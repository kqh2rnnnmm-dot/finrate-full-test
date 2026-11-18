import * as ledger from '../src/ledger.mjs';
import {addAccount,addCategory} from '../src/engine/model.mjs';
import {localDate,saveOperation} from '../src/engine/operations.mjs';
import {saveIncome} from '../src/engine/planning.mjs';
import {savePaymentPlan,confirmPayment,setPaymentPaused} from '../src/engine/scheduled-payments.mjs';
import {saveShares,saveSavingsGoal,assignSavings} from '../src/engine/month-budget.mjs';

const expense=[
  ['food','Продукты',['Супермаркеты']],['cafes','Кафе и рестораны',['Кофе']],
  ['home','Дом и коммунальные услуги',['ЖКХ','Аренда']],['transport','Транспорт',['Такси']],
  ['health','Здоровье',[]],['other','Прочие расходы',[]]
];
const income=[
  ['salary','Зарплата',['Аванс','Основная часть']],['extra','Дополнительный доход',['Подработка','Премия']],
  ['other-income','Прочие поступления',[]]
];
function basic(d) {
  addAccount(d,{id:'card',name:'Карта',opening:5243000});
  addAccount(d,{id:'cash',name:'Копилка',kind:'cash',opening:650000});
  addAccount(d,{id:'spare',name:'Запасная карта'});
  for(const [type,groups] of [['expense',expense],['income',income]]){
    for(const [id,name,children] of groups){
      addCategory(d,{id,name,type});
      children.forEach((name,i)=>addCategory(d,{id:id+'-'+i,name,type,parentId:id}));
    }
  }
}
function visual(d) {
  basic(d);
  const today=localDate(), month=today.slice(0,7);
  const financial=(id,kind,categoryId,amount,date=today,accountId='card')=>{
    saveOperation(d,{id,kind,date,amount,accountId,allocations:[{categoryId,amount}]});
  };
  const limit=12000000;
  addAccount(d,{id:'sample-credit',name:'Кредитная карта для покупок и путешествий',financeType:'credit',opening:-2000000,
    credit:{limit,grace:{mode:'months',months:1},openingLots:[{amount:500000,due:month+'-30'},{amount:1500000,due:'2026-12-31'}]}});
  addAccount(d,{id:'sample-zero',name:'Покупки по выписке',financeType:'credit',opening:25000,credit:{limit:5000000,grace:{mode:'statement'}}});
  const goals=[['holiday','Отпуск',15000000,5000000,2000000,1500],['notebook','Ноутбук',8000000,1000000,0,1000]];
  for(const [id,name,target,,,bps] of goals){
    saveSavingsGoal(d,{id,name,target,due:'',bps,today:month+'-01'});
  }
  saveShares(d,month,{home:2500,health:1000,cafes:1000,food:1500,transport:1000});
  saveIncome(d,{id:'salary-plan',name:'Зарплата',amount:8500000,start:month+'-10',repeat:'monthly',accountId:'card',categoryId:'salary'});
  financial('salary-fact','income','salary-1',24500000);
  for(const [id,, ,assigned,spent] of goals){
    assignSavings(d,{id:'assignment-'+id,categoryId:id,date:today,amount:assigned});
    if(spent)financial('spent-'+id,'expense',id,spent);
  }
  financial('housing-fact','expense','home-1',2866000);
  financial('health-fact','expense','health',87000);
  const plans=[
    ['rent','Аренда',3000000,'10','fixed','home-1'],
    ['internet','Интернет',90000,'20','fixed','home-0'],
    ['utilities','Коммунальные услуги',550000,'25','variable','home-0'],
    ['phone','Связь',65000,'18','fixed','other']
  ];
  for(const [id,name,amount,day,amountMode,categoryId] of plans){
    savePaymentPlan(d,{id,name,amount,start:month+'-'+day,repeat:'monthly',method:'manual',amountMode,accountId:'card',categoryId},today);
  }
  confirmPayment(d,'phone:'+month+'-18',{id:'phone-paid',amount:65000,date:today,accountId:'card',allocations:[{categoryId:'other',amount:65000}]},today,{final:true});
  setPaymentPaused(d,'utilities',true,today);
}

try{
  await ledger.boot();
  const mode=new URLSearchParams(location.search).get('mode');
  if(mode==='regression'||mode==='visual')await ledger.mutate('test.fixture',mode==='visual'?visual:basic);
  const d=ledger.document();
  document.body.textContent=JSON.stringify({
    datasetId:d.datasetId,revision:d.revision,accounts:d.accounts,categories:d.categories,operations:d.operations,events:d.events,
    balances:ledger.fact().balances,rates:d.monthBudget?.rates||[],
    goals:d.monthBudget?.goals||[],plans:d.planning?.incomes||[],payments:d.payments?.plans||[],total:ledger.fact().total
  });
  document.body.dataset.ready='yes';
}catch(error){
  document.body.textContent=error.code||error.message;
  document.body.dataset.ready='error';
}
