import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newDocument,addAccount,addCategory,totals,validateDocument} from '../src/engine/model.mjs';
import {saveOperation,cancelOperation,migrateDocument} from '../src/engine/operations.mjs';
import {creditSummary} from '../src/engine/credit.mjs';
import * as budget from '../src/engine/month-budget.mjs';
import * as incomes from '../src/engine/planning.mjs';
import * as payments from '../src/engine/scheduled-payments.mjs';

function setup() {
  const d=newDocument();
  addAccount(d,{id:'bank',name:'Тестовый безнал',opening:2000000});
  addAccount(d,{id:'cash',name:'Тестовые наличные',kind:'cash'});
  addCategory(d,{id:'housing',name:'Тестовый дом'});
  addCategory(d,{id:'food',name:'Тестовые продукты'});
  addCategory(d,{id:'salary',name:'Тестовая зарплата',type:'income'});
  return d;
}
const fact=(id,kind,amount,categoryId,date='2026-11-18',accountId='bank')=>({
  id,kind,amount,date,accountId,allocations:[{categoryId,amount}]
});
function edit(d,id,input,save=saveOperation) {
  const editBase=JSON.stringify(d.operations.find(o=>o.id===id));
  return save(d,input,{editId:id,editBase});
}
test('Shared shares preserve previous months and use the planned income',()=>{
  const d=setup();
  incomes.saveIncome(d,{id:'salary-plan',name:'Тестовый план',amount:10000000,start:'2026-10-10',repeat:'monthly',accountId:'bank',categoryId:'salary'});
  budget.saveShares(d,'2026-10',{housing:5000,food:3000});
  budget.saveShares(d,'2026-11',{housing:4500,food:5500});
  for(const [month,expected] of [['2026-10',5000000],['2026-11',4500000],['2026-12',4500000]]){
    assert.equal(budget.monthlyOverview(d,month).categories.find(c=>c.id==='housing').plan,expected);
  }
  saveOperation(d,fact('income','income',8000000,'salary'));
  saveOperation(d,fact('rent','expense',5500000,'housing'));
  const month=budget.monthlyOverview(d,'2026-11');
  assert.equal(month.income,8000000);
  assert.equal(month.result,2500000);
  assert.equal(month.expected,10000000);
  assert.equal(month.categories.find(c=>c.id==='housing').spent,5500000);
  const next=budget.monthlyOverview(d,'2026-12');
  assert.equal(next.income,0);
  assert.equal(next.balances.bank,4500000);
  assert.deepEqual(migrateDocument(migrateDocument(d)),d);
});
test('Goal assignments are not postings and spending/edit/cancel updates both views',()=>{
  const d=setup();
  budget.saveSavingsGoal(d,{id:'trip',name:'Тестовая поездка',target:1500000,due:'',bps:500,today:'2026-11-01'});
  const assignment={id:'set-aside',categoryId:'trip',date:'2026-11-02',amount:800000};
  budget.assignSavings(d,assignment);
  assert.equal(budget.assignSavings(d,assignment),false);
  assert.deepEqual(budget.availableMoney(d),{actual:2000000,reserved:800000,available:1200000});
  saveOperation(d,fact('trip-expense','expense',300000,'trip'));
  assert.deepEqual(budget.availableMoney(d),{actual:1700000,reserved:500000,available:1200000});
  edit(d,'trip-expense',fact('trip-expense','expense',450000,'trip'));
  assert.deepEqual(budget.availableMoney(d),{actual:1550000,reserved:350000,available:1200000});
  cancelOperation(d,'trip-expense');
  assert.equal(cancelOperation(d,'trip-expense'),false);
  budget.setBudgetPreference(d,'excludeSavings',false);
  assert.equal(budget.availableMoney(d).available,2000000);
  budget.setBudgetPreference(d,'excludeSavings',true);
  budget.closeSavings(d,'trip','2026-11-18');
  assert.equal(budget.savings(d)[0].accumulated,800000);
  assert.deepEqual(budget.availableMoney(d),{actual:2000000,reserved:0,available:2000000});
  validateDocument(d);
});
test('Transfers and credit repayments affect balances once, with no change in income or expense',()=>{
  const d=setup();
  addAccount(d,{id:'credit',name:'Тестовая кредитка',opening:250000,financeType:'credit',credit:{limit:1000000,grace:{mode:'months',months:1}}});
  const transfer={id:'transfer',kind:'transfer',accountId:'bank',toAccountId:'cash',amount:100025,date:'2026-11-18'};
  saveOperation(d,transfer);
  assert.equal(saveOperation(d,transfer),false);
  assert.deepEqual(totals(d).balances,{bank:1899975,cash:100025,credit:250000});
  edit(d,'transfer',{...transfer,amount:50025});
  cancelOperation(d,'transfer');
  const repay={...transfer,id:'repay',toAccountId:'credit',amount:250000};
  assert.equal(creditSummary(d,'credit','2026-11-18').own,250000);
  const purchase=fact('purchase','expense',450000,'food','2026-11-18','credit');
  saveOperation(d,purchase);
  assert.equal(creditSummary(d,'credit','2026-11-18').debt,200000);
  saveOperation(d,{...repay,amount:100000});
  assert.equal(creditSummary(d,'credit','2026-11-18').debt,100000);
  edit(d,'repay',{...repay,amount:150000});
  assert.equal(creditSummary(d,'credit','2026-11-18').debt,50000);
  cancelOperation(d,'repay');
  assert.equal(creditSummary(d,'credit','2026-11-18').debt,200000);
  assert.equal(totals(d).income,0);
  assert.equal(totals(d).expense,450000);
  cancelOperation(d,'purchase');
  assert.deepEqual(totals(d).balances,{bank:2000000,cash:0,credit:250000});
});
test('Payments preserve the original period, date each fact, and reopen on cancellation',()=>{
  for(const amountMode of ['fixed','variable']){
    const d=setup();
    const start='2026-10-20', id='rent:'+start;
    payments.savePaymentPlan(d,{id:'rent',name:'Тестовая аренда',start,repeat:'monthly',amount:100000,amountMode,
      method:'manual',accountId:'bank',categoryId:'housing'},'2026-10-01');
    const part=fact('part','expense',25000,'housing','2026-10-20');
    const close=fact('close','expense',95000,'housing','2026-11-02');
    assert.equal(payments.confirmPayment(d,id,part,'2026-11-18',{final:false}),true);
    assert.equal(payments.confirmPayment(d,id,part,'2026-11-18',{final:false}),false);
    assert.throws(()=>payments.confirmPayment(d,id,close,'2026-11-18',{final:false}));
    assert.equal(payments.confirmPayment(d,id,close,'2026-11-18',{final:true}),true);
    assert.equal(payments.paymentOccurrence(d,id).status,'paid');
    assert.equal(payments.paymentOccurrence(d,id).amount,100000);
    assert.equal(payments.paymentHistory(d)[0].operation.date,'2026-11-02');
    payments.editPayment(d,'close',{...close,amount:30000,allocations:[{categoryId:'housing',amount:30000}]},'2026-11-18',
      {editBase:JSON.stringify(d.operations.find(o=>o.id==='close')),final:true});
    assert.equal(payments.paymentOccurrence(d,id).paid,55000);
    cancelOperation(d,'close');
    assert.equal(payments.paymentOccurrence(d,id).remaining,75000);
    cancelOperation(d,'part');
    assert.equal(payments.paymentOccurrence(d,id).remaining,100000);
    assert.equal(payments.paymentHistory(d).filter(r=>r.operation.cancelled).length,2);
    assert.equal(totals(d).balances.bank,2000000);
  }
});
test('Linking an existing income does not duplicate it; edits and cancellation change coverage',()=>{
  const d=setup();
  incomes.saveIncome(d,{id:'pay',name:'Тестовый доход',amount:100000,start:'2026-11-01',categoryId:'salary',accountId:'bank'});
  const id='pay:once';
  const month=()=>incomes.incomeOccurrences(d,'2026-11-01','2026-11-30')[0];
  saveOperation(d,fact('cash-in','income',20000,'salary'));
  incomes.linkIncome(d,id,'cash-in');
  assert.equal(totals(d).balances.bank,2020000);
  assert.equal(month().remaining,80000);
  edit(d,'cash-in',fact('cash-in','income',120000,'salary'));
  assert.equal(month().received,20000);
  assert.equal(totals(d).income,120000);
  incomes.linkIncome(d,id,'cash-in');
  assert.equal(month().received,100000);
  edit(d,'cash-in',fact('cash-in','income',50000,'salary'));
  assert.equal(month().remaining,50000);
  cancelOperation(d,'cash-in');
  assert.equal(month().remaining,100000);
  assert.equal(totals(d).income,0);
  assert.equal(d.planning.links.length,2);
});

test('Unlinking an earlier income reopens its plan while preserving the transaction and the balance',()=>{
  const d=setup();
  const id='pay:once';
  incomes.saveIncome(d,{id:'pay',name:'Тестовый доход',amount:2500000,start:'2026-11-25',categoryId:'salary',accountId:'bank'});
  incomes.confirmPlannedIncome(d,id,{...fact('early-income','income',2500000,'salary','2026-10-24'),today:'2026-11-23'});
  const [link]=d.planning.links;
  const balances=totals(d).balances;
  const operation=structuredClone(d.operations[0]);
  assert.equal(incomes.unlinkIncome(d,id,link.id),true);
  assert.equal(incomes.unlinkIncome(d,id,link.id),false);
  assert.equal(incomes.incomeOccurrences(d,'2026-11-01','2026-11-30')[0].remaining,2500000);
  assert.equal(budget.monthlyOverview(d,'2026-11').income,0);
  assert.equal(budget.monthlyOverview(d,'2026-10').additional,2500000);
  assert.deepEqual(totals(d).balances,balances);
  assert.deepEqual(d.operations[0],operation);
  validateDocument(d);
});

test('Closed savings preserve only recorded operation links and freeze the outcome',()=>{
  const d=setup();
  budget.saveSavingsGoal(d,{id:'trip',name:'Тестовая поездка',target:1500000,due:'',bps:0,today:'2026-11-10'});
  addCategory(d,{id:'hotel',name:'Отель',parentId:'trip'});
  budget.assignSavings(d,{id:'assign-trip',categoryId:'trip',date:'2026-11-10',amount:800000});
  saveOperation(d,fact('before-goal','expense',50000,'trip','2026-11-09'));
  saveOperation(d,fact('related','expense',300000,'hotel'));
  saveOperation(d,fact('unrelated','expense',300000,'housing'));
  budget.closeSavings(d,'trip','2026-11-18');
  const goal=budget.savings(d)[0];
  assert.deepEqual(goal.closed.operationRefs.map(ref=>ref.id),['related']);
  assert.equal(budget.closedSavingsOperations(d,goal).changed,false);
  cancelOperation(d,'related');
  saveOperation(d,fact('after-close','expense',100000,'trip','2026-11-19'));
  const historical=budget.closedSavingsOperations(d,budget.savings(d)[0]);
  assert.equal(historical.changed,true);
  assert.deepEqual(historical.rows.map(op=>op.id),['related']);
  assert.equal(historical.rows[0].cancelled,true);
  assert.equal(budget.savings(d)[0].spent,300000);
  assert.equal(budget.savings(d)[0].remaining,500000);
  assert.deepEqual(migrateDocument(d).monthBudget,d.monthBudget);
  delete d.monthBudget.goals[0].closed.operationRefs;
  validateDocument(d);
  assert.deepEqual(budget.closedSavingsOperations(d,budget.savings(d)[0]),{rows:[],changed:false});
});

test('Cancelling a spent income records the true balance and reopens the linked expectation',()=>{
  const d=setup();
  const id='pay:once';
  incomes.saveIncome(d,{id:'pay',name:'Тестовый доход',amount:1000000,
    start:'2026-11-25',categoryId:'salary',accountId:'bank'});
  incomes.confirmPlannedIncome(d,id,{...fact('spent-income','income',1000000,'salary','2026-11-23'),today:'2026-11-23'});
  saveOperation(d,fact('later-expense','expense',2500000,'food','2026-11-24'));
  assert.equal(totals(d).balances.bank,500000);
  assert.equal(cancelOperation(d,'spent-income'),true);
  assert.equal(cancelOperation(d,'spent-income'),false);
  assert.equal(totals(d).balances.bank,-500000);
  assert.equal(totals(d).income,0);
  assert.equal(totals(d).expense,2500000);
  assert.equal(incomes.incomeOccurrences(d,'2026-11-01','2026-11-30')[0].remaining,1000000);
  assert.throws(()=>saveOperation(d,fact('new-expense','expense',1,'food','2026-11-25')),{code:'INSUFFICIENT_FUNDS'});
  assert.equal(d.operations.length,2);
  validateDocument(d);
});

test('Credit purchases preserve own funds and refunds and repayments target the correct debt',()=>{
  const d=setup(),today='2026-11-22',card='credit';
  addAccount(d,{id:card,name:'Кредитка с долгами',financeType:'credit',opening:-5000,
    credit:{limit:100000,grace:{mode:'months',months:3},openingOwn:25000,
      openingLots:[{due:'2026-10-31',amount:20000},{due:'2026-11-30',amount:10000}]}});
  const summary=()=>creditSummary(d,card,today);
  const purchase={...fact('credit-purchase','expense',12000,'food','2026-11-20',card),creditFunding:'purchase'};
  saveOperation(d,purchase);
  assert.equal(summary().own,25000);
  assert.equal(summary().debt,42000);
  assert.equal(summary().lots.find(lot=>lot.operationId===purchase.id).due,'2027-02-28');
  const refund={...fact('credit-refund','refund',12000,'food',today,card),referenceId:purchase.id,
    creditFunding:'refund',refundChoice:'keep'};
  saveOperation(d,refund);
  assert.deepEqual(summary().lots.map(l=>l.amount),[8000,10000,12000]);
  const repayment={id:'own-repayment',kind:'transfer',date:today,accountId:card,toAccountId:card,
    creditFunding:'own',creditRepayMonth:'2026-11',amount:6000};
  assert.throws(()=>saveOperation(d,{...repayment,amount:10001}),{code:'CREDIT_OVERPAY'});
  saveOperation(d,repayment);
  assert.equal(saveOperation(d,repayment),false);
  assert.deepEqual(summary().lots.map(l=>l.amount),[8000,4000,12000]);
  assert.equal(summary().own,19000);
  assert.equal(totals(d).expense,0);
  assert.equal(totals(d).income,0);
  const transfer={id:'withdraw-own',kind:'transfer',date:today,accountId:card,toAccountId:'cash',creditFunding:'own',amount:19000};
  assert.throws(()=>saveOperation(d,{...transfer,amount:19001}),{code:'INSUFFICIENT_FUNDS'});
  saveOperation(d,transfer);
  assert.equal(summary().own,0);
  assert.equal(summary().debt,24000);
  cancelOperation(d,repayment.id);
  assert.equal(summary().own,6000);
  assert.equal(summary().debt,30000);
  validateDocument(d);
});

test('A refund on a fully paid card credits only own funds and a debit refund restores the account',()=>{
  const d=setup(),today='2026-11-22',card='credit';
  addAccount(d,{id:card,name:'Погашенная карта',financeType:'credit',
    credit:{limit:100000,grace:{mode:'months',months:1}}});
  saveOperation(d,{...fact('purchase','expense',5000,'food',today,card),creditFunding:'purchase'});
  saveOperation(d,{id:'repaid',kind:'transfer',accountId:'bank',toAccountId:card,amount:5000,date:today});
  saveOperation(d,{...fact('refund-paid','refund',5000,'food',today,card),referenceId:'purchase',creditFunding:'refund',refundChoice:'keep'});
  assert.equal(creditSummary(d,card,today).debt,0);
  assert.equal(creditSummary(d,card,today).own,5000);
  saveOperation(d,fact('debit-purchase','expense',3000,'food',today,'bank'));
  saveOperation(d,{...fact('debit-refund','refund',1000,'food',today,'bank'),referenceId:'debit-purchase'});
  assert.equal(totals(d).balances.bank,1993000);
  assert.equal(totals(d).expense,2000);
});
