import {addSafe, addCategory, rename, fail, totals} from './model.mjs';
import {incomeOccurrences} from './planning.mjs';

const empty = () => ({rates: [], goals: [], assignments: [], excludeSavings: true, step: 1});
const data = d => d.monthBudget || empty();
const write = d => d.monthBudget ??= empty();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
const positive = n => Number.isSafeInteger(n) && n > 0;
const sum = values => values.reduce(addSafe,0);
export const categoryRoot = (d,id) => d.categories.find(c => c.id === id)?.parentId || id;
export const expenseCategories = d => d.categories.filter(c => c.type === 'expense' && !c.parentId && !c.archived);
export const budgetPreferences = d => ({excludeSavings:data(d).excludeSavings,step:data(d).step});
export const monthEnd = month => {
  const date = new Date(month+'-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+1,0);
  return date.toISOString().slice(0,10);
};

function ratesAt(d, month) {
  return data(d).rates.filter(v => v.month <= month).at(-1)?.shares || {};
}
export const rateAt = (d,id,month) => (data(d).monthShares?.[month] || ratesAt(d,month))[id] || 0;
export const primaryAccount = d => d.accounts.find(a=>a.id===data(d).primaryAccountId&&!a.archived&&a.financeType!=='credit') ||
  d.accounts.find(a=>!a.archived&&a.financeType!=='credit');
export function expenseShortfall(account,balance,amount,previous){
  if(!account)return 0;
  const restored=previous?.kind==='expense'&&!previous.cancelled&&!previous.pending&&previous.accountId===account.id?previous.amount:0;
  const limit=account.financeType==='credit'?account.credit.limit:0;
  return Math.max(0,amount-(balance+limit+restored));
}
export function setPrimaryAccount(d,id){
  if(!d.accounts.some(a=>a.id===id&&!a.archived&&a.financeType!=='credit'))fail('SELECTION');
  write(d).primaryAccountId=id;
}
export function saveMonthShares(d,month,changes){
  if(!monthPattern.test(month))fail('MONTH_SCHEMA');
  const shares=Object.fromEntries(expenseCategories(d).map(c=>[c.id,changes[c.id]??rateAt(d,c.id,month)]));
  const budget=write(d);
  (budget.monthShares??={})[month]=shares;
  validateMonthBudget(d);
}
export function nextBudgetMonth(month){
  const next=new Date(month+'-01T00:00:00Z');
  next.setUTCMonth(next.getUTCMonth()+1);
  return next.toISOString().slice(0,7);
}

export function validateMonthBudget(d) {
  const budget = d.monthBudget;
  if (budget === undefined) return;
  if (!budget || typeof budget.excludeSavings !== 'boolean' || ![1,5,10].includes(budget.step) ||
      !Array.isArray(budget.rates) || !Array.isArray(budget.goals) || !Array.isArray(budget.assignments)) fail('MONTH_SCHEMA');
  const categories = new Set(d.categories.filter(c => c.type === 'expense' && !c.parentId).map(c => c.id));
  let previous = '';
  for (const {month, shares} of budget.rates) {
    if (!monthPattern.test(month) || month <= previous || !shares || Array.isArray(shares)) fail('MONTH_SCHEMA');
    for (const [id, bps] of Object.entries(shares)) {
      if (!categories.has(id) || !Number.isInteger(bps) || bps < 0 || bps > 10000) fail('MONTH_SCHEMA');
    }
    if (sum(Object.values(shares)) > 10000) fail('MONTH_PERCENT_TOTAL');
    previous = month;
  }
  if(budget.primaryAccountId!==undefined&&!d.accounts.some(a=>a.id===budget.primaryAccountId))fail('MONTH_SCHEMA');
  if(budget.monthShares!==undefined){
    if(!budget.monthShares||Array.isArray(budget.monthShares)||typeof budget.monthShares!=='object')fail('MONTH_SCHEMA');
    for(const [month,shares] of Object.entries(budget.monthShares)){
      if(!monthPattern.test(month)||!shares||Array.isArray(shares)||typeof shares!=='object')fail('MONTH_SCHEMA');
      for(const [id,bps] of Object.entries(shares)){
        if(!categories.has(id)||!Number.isInteger(bps)||bps<0||bps>10000)fail('MONTH_SCHEMA');
      }
      if(sum(Object.values(shares))>10000)fail('MONTH_PERCENT_TOTAL');
    }
  }
  const goals = new Set();
  for (const g of budget.goals) {
    if (!categories.has(g.categoryId) || goals.has(g.categoryId) || !positive(g.target) ||
        !validDate(g.start) || g.due && !validDate(g.due) ||
        g.closed && (!validDate(g.closed.date) || !g.closed.name ||
          g.closed.at !== undefined && (typeof g.closed.at !== 'string' || !Number.isFinite(Date.parse(g.closed.at))) ||
          ![g.closed.accumulated,g.closed.spent,g.closed.remaining].every(n => Number.isSafeInteger(n) && n >= 0))) fail('MONTH_SCHEMA');
    const refs = g.closed?.operationRefs;
    if (refs !== undefined && (!Array.isArray(refs) ||
        refs.some(ref=>!ref || typeof ref.id !== 'string' || !ref.id || typeof ref.facts !== 'string') ||
        new Set(refs.map(ref=>ref.id)).size !== refs.length)) fail('MONTH_SCHEMA');
    goals.add(g.categoryId);
  }
  const requests = new Set();
  for (const a of budget.assignments) {
    if (!a.id || requests.has(a.id) || !goals.has(a.categoryId) ||
        !validDate(a.date) || !positive(a.amount)) fail('MONTH_SCHEMA');
    requests.add(a.id);
  }
}

export function saveShares(d, month, changes) {
  const shares = {...ratesAt(d,month),...changes};
  for (const id of Object.keys(shares)) {
    if (!expenseCategories(d).some(c => c.id === id)) delete shares[id];
  }
  const budget = write(d);
  budget.rates = [...budget.rates.filter(v => v.month < month), {month,shares}];
  validateMonthBudget(d);
}

export function setBudgetPreference(d, key, value) {
  if (!['excludeSavings','step'].includes(key)) fail('MONTH_SCHEMA');
  write(d)[key] = value;
  validateMonthBudget(d);
}

function plannedReceipts(d) {
  const posted = new Map(d.operations.filter(op=>op.kind==='income'&&!op.cancelled&&!op.pending).map(op=>[op.id,op.date]));
  return (d.planning?.links||[]).filter(link=>posted.has(link.operationId))
    .map(link=>({date:posted.get(link.operationId),amount:link.amount}));
}

function goalFunding(d,goal,receipts) {
  const manual=data(d).assignments.filter(entry=>entry.categoryId===goal.categoryId);
  const planned=receipts.filter(entry=>entry.date>=goal.start).map(({date,amount})=>({
    date,amount:Number(BigInt(amount)*BigInt(rateAt(d,goal.categoryId,date.slice(0,7)))/10000n)
  }));
  return [...manual,...planned];
}

export function savings(d) {
  const {goals} = data(d);
  const receipts=plannedReceipts(d);
  const spent = new Map();
  const starts = new Map(goals.filter(g=>!g.closed).map(g=>[g.categoryId,g.start]));
  for (const op of d.operations) {
    if (op.cancelled || op.pending || !['expense','refund'].includes(op.kind)) continue;
    for (const allocation of op.allocations) {
      const id = categoryRoot(d,allocation.categoryId);
      if (starts.has(id) && op.date >= starts.get(id)) {
        spent.set(id,addSafe(spent.get(id)||0,op.kind === 'refund' ? -allocation.amount : allocation.amount));
      }
    }
  }
  return goals.map(g => {
    const name = d.categories.find(c=>c.id===g.categoryId)?.name;
    if (g.closed) return {...g,...g.closed};
    const accumulated = sum(goalFunding(d,g,receipts).map(a=>a.amount));
    const used = Math.max(0,spent.get(g.categoryId)||0);
    return {...g,name,accumulated,spent:used,remaining:Math.max(0,accumulated-used)};
  });
}

export function availableMoney(d) {
  const {balances} = totals(d);
  const actual = sum(d.accounts.filter(a=>!a.archived && a.financeType!=='credit').map(a=>balances[a.id]));
  const reserved = sum(savings(d).filter(g=>!g.closed).map(g=>g.remaining));
  return {actual,reserved,available: data(d).excludeSavings ? addSafe(actual,-reserved) : actual};
}

export function saveSavingsGoal(d, {id,name,target,due,bps,today}) {
  const goals = write(d).goals;
  const goal = goals.find(g=>g.categoryId===id);
  if (goal?.closed) fail('MONTH_CLOSED');
  if (goal) {
    rename(d,'categories',id,name);
    Object.assign(goal,{target,due});
  } else {
    addCategory(d,{id,name,type:'expense'});
    goals.push({categoryId:id,target,due,start:today});
  }
  saveShares(d,today.slice(0,7),{[id]:bps});
}

export function assignSavings(d, entry) {
  const budget = write(d);
  const prior = budget.assignments.find(a=>a.id===entry.id);
  if (prior) {
    if (JSON.stringify(prior)===JSON.stringify(entry)) return false;
    fail('DUPLICATE');
  }
  const goal = budget.goals.find(g=>g.categoryId===entry.categoryId);
  const {actual,reserved} = availableMoney(d);
  if (!goal || goal.closed || entry.date < goal.start || !positive(entry.amount) ||
      entry.amount > actual-reserved) fail('MONTH_AVAILABLE');
  budget.assignments.push(entry);
}

const operationFacts = op => JSON.stringify([
  op.kind, op.date, op.amount, op.accountId, !!op.cancelled, !!op.pending,
  op.allocations.map(({categoryId,amount})=>[categoryId,amount])
]);

export function closedSavingsOperations(d,goal) {
  if (!goal.closed.operationRefs) return {rows:[],changed:false};
  const byId = new Map(d.operations.map(op=>[op.id,op]));
  const pairs = goal.closed.operationRefs.map(ref=>[ref,byId.get(ref.id)]);
  return {
    rows:pairs.map(([,op])=>op).filter(Boolean),
    changed:pairs.some(([ref,op])=>!op || operationFacts(op)!==ref.facts)
  };
}

export function closeSavings(d,id,date) {
  const goal = write(d).goals.find(g=>g.categoryId===id);
  if (!goal) fail('MONTH_GOAL');
  if (goal.closed) return false;
  if (date < goal.start) fail('MONTH_DATE');
  const {name,accumulated,spent,remaining} = savings(d).find(g=>g.categoryId===id);
  const operationRefs = d.operations.filter(op=>!op.pending && ['expense','refund'].includes(op.kind) &&
    op.date>=goal.start && op.allocations.some(a=>categoryRoot(d,a.categoryId)===id))
    .map(op=>({id:op.id,facts:operationFacts(op)}));
  goal.closed = {name,accumulated,spent,remaining,date,at:new Date().toISOString(),operationRefs};
  saveShares(d,date.slice(0,7),{[id]:0});
}

export function monthlyOverview(d,month) {
  const from = month+'-01', to = monthEnd(month);
  const fact=totals(d,{from,to});
  const expected = sum(incomeOccurrences(d,from,to).map(r=>r.amount));
  const receipts=plannedReceipts(d).filter(receipt=>receipt.date>=from&&receipt.date<=to);
  const planned=sum(receipts.map(receipt=>receipt.amount));
  const goalInfo=savings(d).filter(g=>!g.closed);
  const savingsIds=new Set(data(d).goals.map(g=>g.categoryId));
  const spent = new Map();
  for (const [id,n] of Object.entries(fact.byCategory)) {
    const root = categoryRoot(d,id);
    spent.set(root,addSafe(spent.get(root)||0,n));
  }
  const categories = expenseCategories(d).map(c=>{
    const bps = rateAt(d,c.id,month);
    const plan=Number(BigInt(expected)*BigInt(bps)/10000n);
    const funded=expected?Number(BigInt(plan)*BigInt(Math.min(planned,expected))/BigInt(expected)):0;
    return {...c,bps,plan,funded,spent:Math.max(0,spent.get(c.id)||0),savings:savingsIds.has(c.id)};
  }).sort((a,b)=>Number(b.bps>0)-Number(a.bps>0)||a.name.localeCompare(b.name,'ru'));
  const reservedForMonth=sum(goalInfo.map(goal=>{
    const assigned=sum(goalFunding(d,goal,receipts).filter(a=>a.date>=from&&a.date<=to).map(a=>a.amount));
    return Math.min(goal.remaining,Math.max(0,assigned-(spent.get(goal.categoryId)||0)));
  }));
  const excludeSavings=data(d).excludeSavings;
  return {...fact,...availableMoney(d),month,expected,planned,additional:Math.max(0,fact.income-planned),
    result:addSafe(fact.result,excludeSavings?-reservedForMonth:0),excludeSavings,reservedForMonth,categories};
}
