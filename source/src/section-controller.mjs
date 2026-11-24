import {animatePopover,pressFeedback} from './popovers.mjs';
import {editAmount,normalizedAmount,validAmount} from './amount-pad.mjs';
import * as ledger from './ledger.mjs';
import * as ui from './sections.mjs';
import {heading, esc, amountText, dateText, recentOperationRows, operationRows, categoryRows, accountMark, categoryLabel, keypad, enteredMoney, icon, unsaved} from './screens.mjs';
import {addAccount, addCategory, archive, money, rename, uid, fail, postings, addSafe} from './engine/model.mjs';
import {saveOperation, cancelOperation, localDate, refundRemaining} from './engine/operations.mjs';
import {reconcileAccount, restoreAccount, categoryAction, setAccountPolicy, transferPreview} from './engine/block02.mjs';
import {creditSummary, creditLedger, isCredit, setStatement} from './engine/credit.mjs';
import * as budget from './engine/month-budget.mjs';
import * as income from './engine/planning.mjs';
import * as payments from './engine/scheduled-payments.mjs';
import {RECURRENCES} from './engine/recurring-income.mjs';

const doc = ledger.document;
const date = localDate;
const todayMonth = () => date().slice(0,7);
const categoryTypes=[['expense','Расходы'],['savings','Накопления'],['income','Доходы']];
const blank = ['', 'Выбрать'];
const number = (key,label,required=true) => ({key,label,type:'money',required,placeholder:'0'});
const text = (key,label) => ({key,label});
const day = (key,label,required=true) => ({key,label,type:'date',required});
const choices = (key,label,options,required=true) => ({key,label,options,required});
const check = (key,label) => ({key,label,type:'checkbox',required:false});
const accountName = id => doc().accounts.find(a=>a.id===id)?.name || '—';
const currentAccount = id => doc().accounts.find(a=>a.id===id);
const currentCategory = id => doc().categories.find(c=>c.id===id);
const categoryName = id => {
  const {name,parent} = categoryLabel(doc(),id);
  return parent ? parent+' · '+name : name;
};
const accountOptions = predicate => [blank,...doc().accounts.filter(a=>!a.archived && (!predicate || predicate(a)))
  .map(a=>[a.id,a.name])];
const receiptAccounts=()=>({key:'accountId',label:'Счёт',type:'account-picker',
  options:doc().accounts.filter(a=>!a.archived&&!isCredit(a)).map(a=>[a.id,a.name,accountMark(a)])});
const categoryOptions = kind => [blank,...doc().categories.filter(c=>c.type===kind&&!c.archived&&!c.mergedInto)
  .map(c=>[c.id,categoryName(c.id)])];
const numeric = n => n === undefined ? '' : String(n/100);
const asAmount = value => {
  const n = money(value);
  if (n <= 0 || n > 99999999999) fail('AMOUNT');
  return n;
};
const percent = value => {
  const plain = value.trim().replace(',','.');
  if (plain === '') return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(plain) || Number(plain)>100) fail('MONTH_PERCENT_TOTAL');
  return Math.round(Number(plain)*100);
};
const amountEntry = (id,kind,v,categoryId=v.categoryId) => {
  const amount = asAmount(v.amount);
  return {id,kind,amount,date:v.date,accountId:v.accountId,allocations:[{categoryId,amount}]};
};
const list = (title,content,side='',top='') => heading(title,'',side)+top+ui.body(content);
const errors = {
  NAME_EXISTS:'Такое название уже есть.', AMOUNT:'Проверьте сумму.', INSUFFICIENT_FUNDS:'На счёте недостаточно средств.',
  NONZERO_ACCOUNT:'Для архива нужен нулевой остаток.', LAST_ACCOUNT:'Должен остаться хотя бы один счёт.',
  CREDIT_OVERPAY:'Погашение превышает долг по карте.', CREDIT_LIMIT:'Превышен кредитный лимит.', CREDIT_DUE:'Укажите срок погашения.', CREDIT_SETTINGS:'Проверьте лимит и правила погашения.',
  MONTH_AVAILABLE:'Для назначения не хватает доступных средств.', MONTH_PERCENT_TOTAL:'Сумма долей должна быть не больше 100%.',
  STALE:'Данные изменились в другой вкладке. Откройте приложение заново.', EDIT_STALE:'Запись изменилась. Откройте её заново.',
  PAYMENT_AMOUNT:'Проверьте сумму и выберите частичную или полную оплату.',
  PAYMENT_DATE:'Проверьте дату оплаты.', PAYMENT_LINK:'Сумма или категория противоречит связанной оплате.',
  CONFIRM:'Введите указанную фразу подтверждения.',
  BACKUP_MISMATCH:'Копия не соответствует текущим данным. Сохраните новую копию.',
  DECRYPT:'Не удалось открыть копию. Проверьте пароль.',
  PASSWORD:'Пароль копии должен содержать от 12 до 1024 символов.',
  REFUND:'Проверьте дату и оставшуюся сумму возврата.',
  PLAN_LINK:'Этот доход уже распределён по ожиданиям или ожидание закрыто.'
};

export function createSections(host, {redraw, exit, startOperation, openOperation}) {
  let stack = [];
  let busy = false;
  const state = () => stack.at(-1);
  const scroll = () => host.querySelector('[data-section-scroll], .fr-operation-list');
  const remember = () => {
    if (!state()) return;
    state().scroll = scroll()?.scrollTop || 0;
  };
  function enter(page, props={}) {
    remember();
    stack.push({page,scroll:0,error:'',...props});
    redraw();
  }
  function pop() {
    const closed=stack.pop();
    if(closed?.download)URL.revokeObjectURL(closed.download);
    if(closed?.page==='reset-review')ledger.discardReset();
    if (closed?.returnTo) return closed.returnTo();
    if (stack.length) redraw();
    else exit();
  }
  function dirty(s) {
    if (s.page==='transfer-amount') return s.buffer!==s.initial;
    if (s.page==='form') return JSON.stringify(s.values)!==s.initial||s.repayMonth!==s.initialRepayMonth||s.openingDebtCount!==s.initialOpeningDebtCount;
    if (s.page==='batch-review') return s.items.some(item=>item.reviewed);
    if (s.page==='transfer-accounts') return JSON.stringify(s.draft)!==s.initial;
    if (['distribution','share-detail'].includes(s.page)) return JSON.stringify(s.values)!==s.initial;
    return false;
  }
  function restoreSummaryMore(s) {
    const dialog = host.querySelector('.fr-summary-dialog');
    if (!s.more || !dialog || dialog.open) return;
    const close=()=>{
      if(dialog.dataset.closing)return;
      dialog.dataset.closing='true';
      animatePopover(dialog,true).then(()=>{dialog.close();delete dialog.dataset.closing;});
    };
    dialog.onclick=event=>{if(event.target===dialog){event.stopPropagation();close();}};
    dialog.oncancel=event=>{event.preventDefault();close();};
    dialog.addEventListener('close',()=>{
      if (dialog.isConnected) s.more = false;
    },{once:true});
    pressFeedback(host.querySelector('[data-section-action="summary-more"]'));
    dialog.showModal();
    animatePopover(dialog);
  }
  function back() {
    if (busy) return;
    const more=host.querySelector('.fr-summary-dialog[open]');
    if (more) return more.dispatchEvent(new Event('cancel',{cancelable:true}));
    if(state().accountPanel)return action('account-panel-close');
    if (dirty(state())) enter('discard');
    else pop();
  }
  function form(title,fields,defaults,save,options={}) {
    const values = Object.fromEntries(fields.map(f=>[f.key, defaults[f.key] ?? (f.type==='checkbox'?false:'')]));
    enter('form',{title,fields,values,save,initial:JSON.stringify(values),...options});
  }
  async function commit(action,fn,done=pop,apply=ledger.mutate) {
    if (busy) return;
    remember();
    const current = state();
    busy = true;
    current.error = '';
    redraw();
    try {
      await apply(action,fn);
      busy = false;
      done();
    } catch (error) {
      busy = false;
      current.error = errors[error.code] || 'Не удалось сохранить. Проверьте введённые данные.';
      redraw();
    }
  }
  const confirm = (title,message,submitLabel,action,fn,done) => enter('confirm',{title,message,submitLabel,action,fn,done});
  const monthLabel=month=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'})
    .format(new Date(month+'-01T00:00:00Z')).replace(/ г\.$/,'');
  const backupPassword={key:'password',label:'Пароль копии',type:'password',maxlength:1024};
  const backupFile={key:'backup',label:'Файл резервной копии',type:'file'};
  const clearPhrase=mode=>mode==='all'?'СБРОСИТЬ FINRATE':'ОЧИСТИТЬ ФИНАНСЫ';
  const clearTitle=mode=>mode==='all'?'Полный сброс FinRate':'Очистить финансовые данные';
  const clearConsequences=mode=>mode==='all'?'Будут удалены счета, операции, планы, накопления, категории, настройки и внутренняя история. Внешний файл копии останется у вас.':
    'Будут удалены счета, операции, планы, накопления и история. Категории и настройки сохранятся. Внешний файл копии останется у вас.';
  function dataTask(fn,done){
    return commit('data.management',null,done,fn);
  }
  function verifyReset(s){
    form('Проверить резервную копию',[backupFile,backupPassword],{},v=>{
      const {backup,password}=v;
      v.password='';
      let proof;
      return dataTask(async()=>{proof=await ledger.prepareReset(s.intent,backup,password);},()=>{
        const phrase=clearPhrase(s.mode);
        form('Подтвердить сброс',[text('confirmation','Введите '+phrase)],{},v=>{
          if(v.confirmation.trim()!==phrase)fail('CONFIRM');
          return dataTask(()=>ledger.applyReset(proof,phrase),()=>location.reload());
        },{submitLabel:'Удалить данные',danger:true,
          insideBefore:ui.panel('<p>Копия проверена. '+clearConsequences(s.mode)+'</p>')});
      });
    },{submitLabel:'Проверить копию',insideBefore:ui.panel('<p>Выберите сохранённый файл и введите его пароль.</p>')});
  }
  const editBase = op => ({editId:op.id,editBase:JSON.stringify(op)});

  const monthShares = month => Object.fromEntries(budget.expenseCategories(doc())
    .map(c=>[c.id,String(budget.rateAt(doc(),c.id,month)/100 || '')]));

  function openShare(id) {
    const parent = state();
    const parentDraft = parent?.page==='distribution';
    const fromSummary = ['summary','summary-expenses'].includes(parent?.page);
    const month = parentDraft||fromSummary ? parent.month : todayMonth();
    const values = parentDraft ? {...parent.values} : monthShares(month);
    enter(id?'share-detail':'distribution',{
      single:id,title:id?currentCategory(id).name:'Распределение плана',values,initial:JSON.stringify(values),month,parentDraft,
      categoryHistory:!!id&&fromSummary
    });
  }
  function changeShareMonth(s,month) {
    s.values=monthShares(month);
    s.initial=JSON.stringify(s.values);
    s.month=month;
    s.scroll=0;
    s.error='';
    redraw();
  }
  function shares(s) {
    return Object.fromEntries(Object.entries(s.values).map(([id,value])=>[id,percent(String(value))]));
  }
  function updateShare(s) {
    let parsed;
    try {parsed = shares(s);} catch {parsed = null;}
    const total = parsed && Object.values(parsed).reduce((a,b)=>a+b,0);
    const valid = parsed && total<=10000;
    host.querySelector('[data-share-total]').textContent = total===null ? '—' : total/100+'%';
    const free=Math.max(0,10000-total);
    host.querySelector('[data-share-free]').textContent = total===null?'—':free/100+'%';
    host.querySelector('[data-share-free-amount]').textContent=total===null?'—':amountText(Number(BigInt(s.plan)*BigInt(free)/10000n));
    const room=host.querySelector('[data-share-room]');
    if(room){
      const available=Math.max(0,10000-total+(parsed?.[s.single]||0));
      room.textContent='Для категории доступно '+(total===null?'—':available/100+'%');
    }
    host.querySelector('[data-share-bar]').style.width = (total===null?0:Math.min(10000,total)/100)+'%';
    host.querySelector('[data-share-error]').textContent = valid?'':errors.MONTH_PERCENT_TOTAL;
    host.querySelector('[data-action=section-save-share]').disabled = busy || !valid;
    host.querySelectorAll('[data-share-input]').forEach(el=>{
      const value = Number(String(s.values[el.dataset.id]).replace(',','.')) || 0;
      el.closest('.fr-share-panel').querySelector('[data-share-amount]').textContent = amountText(Math.floor(s.plan*value/100));
    });
  }
  function saveShare(s) {
    let values;
    try {values=shares(s);} catch {return;}
    if (Object.values(values).reduce((a,b)=>a+b,0)>10000) return;
    if (s.parentDraft) {
      stack.at(-2).values[s.single] = s.values[s.single];
      return pop();
    }
    enter('share-scope',{owner:s,values});
  }
  function applyShareScope(s,scope){
    const owner=s.owner;
    return commit('budget.shares',d=>{
      if(owner.single)budget.saveMonthShares(d,owner.month,{[owner.single]:s.values[owner.single]});
      if(scope==='future'){
        const month=budget.nextBudgetMonth(todayMonth());
        const changes=owner.single?{[owner.single]:s.values[owner.single]}:s.values;
        budget.saveShares(d,month,changes);
      }
    },()=>{stack.pop();pop();});
  }

  function finishCategoryCreation(kind) {
    if(stack.at(-2)?.page==='category-type-picker'){
      stack.pop();
      stack.at(-2).tab=kind;
    }
    pop();
  }

  function categoryForm(parentId=null,kind=state().tab,category=null) {
    const id = category?.id || uid();
    form(category?'Название':parentId?'Новая подкатегория':'Новая категория',[text('name','Название')],
      {name:category?.name || (parentId?'':state().query||'')}, (v)=>commit(category?'category.rename':'category.add',
        d=>category?categoryAction(d,id,'rename',{name:v.name.trim()}):addCategory(d,{id,name:v.name.trim(),type:kind,parentId}),
        ()=>finishCategoryCreation(kind)));
  }
  function readOpeningDebts(values,count) {
    return Array.from({length:count},(_,i)=>{
      const amount=values['debtAmount'+i],due=values['debtDue'+i];
      if(!amount&&!due)return null;
      if(!amount||!due)fail('CREDIT_DUE');
      return {amount:asAmount(amount),due};
    }).filter(Boolean);
  }
  function readOpeningDebtsForPreview(values,count) {
    return Array.from({length:count},(_,i)=>{
      const value=values['debtAmount'+i];
      const decimal=(value||'').replace('.',',');
      return validAmount(decimal)?money(normalizedAmount(decimal)):0;
    }).reduce((sum,amount)=>sum+amount,0);
  }
  function openingDebtFields(count) {
    return Array.from({length:count},(_,i)=>[number('debtAmount'+i,'Сумма долга '+(i+1),false),
      day('debtDue'+i,'Погасить до',false)]).flat();
  }
  function openingDebtForm(a) {
    const opening=a.credit.openingLots||(a.opening<0?[{amount:-a.opening,due:''}]:[]);
    const count=Math.max(opening.length,1);
    const defaults=Object.fromEntries(opening.flatMap((lot,i)=>[['debtAmount'+i,numeric(lot.amount)],['debtDue'+i,lot.due]]));
    form('Долги при настройке',openingDebtFields(count),defaults,v=>commit('account.opening-debt',d=>{
      const original=d.accounts.find(x=>x.id===a.id);
      const openingLots=readOpeningDebts(v,state().openingDebtCount);
      const debt=openingLots.reduce((sum,lot)=>addSafe(sum,lot.amount),0);
      if(debt>original.credit.limit)fail('CREDIT_LIMIT');
      d.accountEdits.push({id:uid(),at:new Date().toISOString(),accountId:a.id,before:structuredClone(original)});
      const openingOwn=original.credit.openingOwn??Math.max(0,original.opening);
      original.opening=openingOwn-debt;
      original.credit={...original.credit,openingLots,openingOwn};
    }),{openingDebtCount:count,initialOpeningDebtCount:count});
  }
  function newAccount(options={}) {
    const id = uid();
    form('Новый счёт',[
      choices('kind','Тип счёта',[['bank','Безнал'],['cash','Наличные'],...(options.kind==='income'?[]:[['credit','Кредитная карта']])]),
      text('name','Название'),number('opening','Начальный остаток',false),number('limit','Кредитный лимит',false),
      choices('mode','Беспроцентный период',[['months','До конца месяца'],['days','Дней после покупки'],['statement','По выписке']]),
      number('days','Количество дней',false)
    ],{kind:'bank',mode:'months'},v=>commit('account.add',d=>{
      const credit = v.kind==='credit';
            const entered=!credit&&v.opening?money(v.opening):0;
      const lots=credit?readOpeningDebts(v,state().openingDebtCount):[];
      const opening=lots.length?-lots.reduce((sum,lot)=>addSafe(sum,lot.amount),0):entered;
      const openingLots=lots.length?lots:null;
      addAccount(d,{id,name:v.name,kind:credit?'bank':v.kind,financeType:credit?'credit':'debit',opening,
        ...(credit?{credit:{limit:asAmount(v.limit),grace:grace(v),...(openingLots?{openingLots}:{})}}:{})});
    },()=>{
      if(options.created){stack.pop();return options.created(id);}
      pop();enter('account',{id});
    }),{dynamic:'account',returnTo:options.exit,openingDebtCount:1,initialOpeningDebtCount:1});
  }
  function grace(v) {
    if (v.mode==='statement') return {mode:v.mode};
    const value = Number(String(v.days).replace(',','.'));
    return v.mode==='days' ? {mode:v.mode,days:value} : {mode:'months',months:value||1};
  }
  function creditSettings(a) {
    form('Условия кредитной карты',[
      number('limit','Кредитный лимит'),
      choices('mode','Беспроцентный период',[['months','По месяцам'],['days','Дней после покупки'],['statement','По выписке']]),
      number('days','Месяцев или дней',false)
    ],{limit:numeric(a.credit.limit),mode:a.credit.grace.mode,days:String(a.credit.grace.days||a.credit.grace.months||'')},
    v=>commit('account.credit-settings',d=>setAccountPolicy(d,a.id,{
      financeType:'credit',credit:{...a.credit,limit:asAmount(v.limit),grace:grace(v)}
    })));
  }
  function repaymentOptions(d,id,asOf) {
    const credit=creditSummary(d,id,asOf,creditLedger({...d,operations:d.operations.filter(o=>o.date<=asOf)}));
    const months=new Map();
    for(const lot of credit.lots){
      const month=lot.due?.slice(0,7);
      if(month&&month<=asOf.slice(0,7))months.set(month,addSafe(months.get(month)||0,lot.amount));
    }
    return {credit,months:new Map([...months].sort())};
  }
  function repayCard(id,operation=null) {
    const base=d=>operation?{...d,operations:d.operations.filter(o=>o.id!==operation.id)}:d;
    const options=v=>{
      const d=base(doc()), current=v.date||date();
      const {credit,months}=repaymentOptions(d,id,current);
      const sources=accountOptions(a=>!isCredit(a));
      if(credit.own>0||operation?.accountId===id)sources.push([id,'Свои деньги на карте · '+amountText(credit.own)]);
      return {credit,months,sources};
    };
    const initialDate=operation?.date||date();
    const {months}=options({date:initialDate});
    const month=operation?.creditRepayMonth||(operation?'all':months.has(initialDate.slice(0,7))?initialDate.slice(0,7):[...months.keys()].at(-1)||'all');
    const requestId=operation?.id||uid();
    form('Погасить долг',[number('amount','Сумма погашения'),choices('accountId','Откуда',[]),{...day('date','Дата'),max:date()}],{amount:numeric(operation?.amount),date:initialDate,accountId:operation?.accountId||budget.primaryAccount(doc())?.id||''},
      v=>commit(operation?'transfer.edit':'credit.repay',d=>{
        const n=asAmount(v.amount),source=d.accounts.find(a=>a.id===v.accountId&&!a.archived);
        const target=d.accounts.find(a=>a.id===id&&!a.archived);
        if(!source||!target||isCredit(source)&&source.id!==id||v.date>date())fail('SELECTION');
        const {credit,months}=repaymentOptions(base(d),id,v.date);
        const selected=state().repayMonth;
        if(n>(selected==='all'?credit.debt:months.get(selected)||0))fail('CREDIT_OVERPAY');
        if(source.id===id&&n>credit.own)fail('INSUFFICIENT_FUNDS');
        return saveOperation(d,{id:requestId,kind:'transfer',accountId:source.id,toAccountId:id,amount:n,date:v.date,
          ...(source.id===id?{creditFunding:'own'}:{}),...(selected!=='all'?{creditRepayMonth:selected}:{})},
          operation?editBase(operation):undefined);
      }),{dynamic:'credit-repay',repayMonth:month,initialRepayMonth:month,repayOptions:options});
  }
  function refundForm(operation,returnTo) {
    const refundId=uid();
    const remaining=refundRemaining(doc(),operation.id).reduce((total,part)=>addSafe(total,part.amount),0);
    form('Возврат покупки',[number('amount','Сумма возврата'),{...day('date','Дата возврата'),min:operation.date,max:date()}],{date:date()},v=>commit('operation.refund',d=>{
      const original=d.operations.find(o=>o.id===operation.id&&!o.cancelled);
      const account=d.accounts.find(a=>a.id===original?.accountId&&!a.archived);
      if(!original||!account||v.date>date()||v.date<original.date)fail('REFUND');
      const amount=asAmount(v.amount),allocations=[];
      let rest=amount;
      for(const part of refundRemaining(d,original.id)){
        const used=Math.min(rest,part.amount);
        if(used)allocations.push({categoryId:part.categoryId,amount:used});
        rest-=used;
      }
      if(rest)fail('REFUND');
      return saveOperation(d,{id:refundId,kind:'refund',accountId:account.id,date:v.date,amount,allocations,referenceId:original.id,
        ...(isCredit(account)?{refundChoice:'keep',creditFunding:'refund'}:{})});
    }),{returnTo,insideBefore:ui.pair('Можно вернуть',remaining)+ui.actionButton('Вернуть всю оставшуюся сумму','refund-full'),refundMax:remaining});
  }
  function transferForm(from='',to='',operation=null,funding=null) {
    const creditSource=isCredit(currentAccount(from))?from:'';
    const accountId=funding?'':from||budget.primaryAccount(doc())?.id||'';
    const draft={id:operation?.id||uid(),kind:'transfer',accountId,toAccountId:to,
      amount:numeric(funding?.amount??operation?.amount),date:operation?.date||date()};
    enter('transfer-accounts',{draft,initial:JSON.stringify(draft),operation,creditSource,
      title:'Перевод',funding,returnTo:funding?.done});
    if(funding)enter('transfer-picker',{owner:state(),field:'accountId'});
  }
  function transferAmount(s,done) {
    const buffer=s.draft.amount.replace('.',',');
    enter('transfer-amount',{title:s.title,buffer,initial:buffer,owner:s,done});
  }
  function saveTransfer(s) {
    return commit(s.operation?'transfer.edit':'transfer.add',d=>{
      const input={...s.draft,amount:asAmount(s.draft.amount)};
      if(input.accountId===input.toAccountId)fail('SELECTION');
      const accounts=[input.accountId,input.toAccountId].map(id=>d.accounts.find(a=>a.id===id));
      if(accounts.some(a=>!a||a.archived))fail('SELECTION');
      if(input.amount>accountTransferPreview(d,input,s.operation).maximum)fail('INSUFFICIENT_FUNDS');
      if(isCredit(accounts[0]))input.creditFunding='own';
      return saveOperation(d,input,s.operation?editBase(s.operation):undefined);
    },()=>{stack.pop();pop();});
  }

  function accountTransferPreview(d,input,operation) {
    const preview=transferPreview(d,input.accountId,input.toAccountId,input.amount,0,{editId:operation?.id});
    if(!isCredit(currentAccount(input.accountId)))return preview;
    const base=operation?{...d,operations:d.operations.filter(o=>o.id!==operation.id)}:d;
    const own=creditSummary(base,input.accountId,date()).own;
    return {...preview,maximum:own,fromAfter:own-input.amount};
  }

  function transferRow(label,action,id,after=null) {
    const a=currentAccount(id);
    const balance=a ? (after??(isCredit(a)?creditSummary(doc(),id,date()).own:ledger.fact().balances[id])) : 0;
    const hint=after===null?'':label==='Откуда'?'Останется ':'Будет ';
    return `<section class="fr-transfer-field"><h2>${label}</h2>
      <button class="fr-transfer-choice" type="button" data-section-action="${action}" ${state().funding&&action==='transfer-target'?'disabled':''}>
      <span class="fr-transfer-choice-copy"><strong data-full-name>${esc(a?.name||'Выбрать счёт')}</strong>
      ${a?accountMark(a)+`<span class="fr-transfer-balance">${hint}${amountText(balance)}</span>`:''}</span>
      ${icon(after===null?'down':'pencil')}</button></section>`;
  }

  function goalForm(goal) {
    const id = goal?.categoryId || uid();
    form(goal?'Изменить категорию':'Новая цель',[text('name',goal?'Категория':'Название'),number('target',goal?'Сумма цели':'Целевая сумма'),
      day('due','Срок',false),number('share','Доля плана, %',false)],{
      name:goal?.name,target:numeric(goal?.target),due:goal?.due,share:String(budget.rateAt(doc(),id,todayMonth())/100 || '')
    },v=>commit('savings.goal',d=>budget.saveSavingsGoal(d,{
      id,name:v.name,target:asAmount(v.target),due:v.due,bps:percent(v.share),today:date()
    }),()=>finishCategoryCreation('savings')));
  }
  function incomeForm(source=null) {
    const id = source?.id || uid();
    const last = source?.schedules?.at(-1) || source;
    const now = new Date(date()+'T00:00:00Z');
    const numbers = (length, start) => Array.from({length},(_,i)=>[i+start,String(i+start)]);
    const weekdays = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    form(source?'Изменить план дохода':'Новый план дохода',[
      number('amount','Сумма'),choices('categoryId','Категория / подкатегория',categoryOptions('income')),
      choices('repeat','Повторение',Object.entries(RECURRENCES)),
      choices('day','Число месяца',numbers(31,1)),choices('weekday','День недели',weekdays.map((v,i)=>[i,v])),
      choices('month','Месяц',numbers(12,1)),choices('accountId','Счёт',accountOptions(a=>!isCredit(a))),
      ...(source?[]:[day('start','План действует с')])
    ],{amount:numeric(last?.amount),categoryId:last?.categoryId,repeat:last?.repeat||'monthly',
      day:String(last?.day||now.getUTCDate()),weekday:String(last?.weekday??now.getUTCDay()),
      month:String(last?.month||now.getUTCMonth()+1),accountId:last?.accountId,start:date()},
    v=>commit('income.plan',d=>income.saveRecurringIncome(d,{...v,id,name:categoryName(v.categoryId),amount:asAmount(v.amount)},source?date():v.start)),
    {dynamic:'income'});
  }
  function incomeRow(id) {
    const old = doc().planning?.occurrences.find(o=>o.id===id);
    const from = old?.date || id.match(/:\d{4}-\d{2}-\d{2}$/)?.[0].slice(1) ||
      id.match(/:\d{4}-\d{2}(?=:|$)/)?.[0].slice(1).concat('-01') ||
      doc().planning?.incomes.find(plan=>id===plan.id+':once')?.start;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(from)?from:state().month+'-01';
    return income.incomeOccurrences(doc(),start,budget.monthEnd(start.slice(0,7))).find(o=>o.id===id);
  }
  function draftReceiptAccount(preferred){
    const account=currentAccount(preferred);
    return account&&!account.archived&&!isCredit(account)?preferred:budget.primaryAccount(doc())?.id;
  }
  function receipt(row, review=false) {
    const id = uid();
    const receiptEntry=(d,v,final)=>income.confirmPlannedIncome(d,row.id,{
      ...amountEntry(id,'income',v,row.categoryId),today:date()
    },{final});
    const save = (v,final,nested=false) => {
      if(!review)return commit('income.receipt',d=>receiptEntry(d,v,final),nested?()=>{stack.pop();pop();}:pop);
      return enter('income-review',{row,values:v,final,save:()=>commit('income.receipt',d=>receiptEntry(d,v,final),()=>{
        stack=[];exit();
      })});
    };
    form('Записать поступление',[number('amount','Получено'),day('date','Дата'),receiptAccounts()],
      {amount:numeric(row.remaining),date:date(),accountId:draftReceiptAccount(row.accountId)},
      v=>{
        if(asAmount(v.amount)>=row.remaining)return save(v,false);
        enter('income-completion',{row,received:asAmount(v.amount),onChoice:final=>save(v,final,true)});
      },{submitLabel:'Далее'});
  }

  function paymentForm(plan=null,occurrence=null) {
    const id = plan?.id||uid(), last = occurrence || plan?.versions.at(-1);
    const fields = [text('name','Название'),number('amount','Сумма'),day('start','Дата'),
      choices('amountMode','Вид суммы',[['fixed','Фиксированная'],['variable','Ориентировочная']]),
      choices('method','Способ',[['manual','Вручную'],['bank','В банке']]),
      choices('accountId','Счёт',accountOptions()),{key:'categoryId',label:'Категория / подкатегория',type:'category-picker',options:categoryOptions('expense')}];
    if (occurrence?.paid) fields.splice(fields.findIndex(f=>f.key==='categoryId'),1);
    if (!occurrence) fields.splice(3,0,choices('repeat','Повторение',Object.entries(payments.PAYMENT_REPEATS)));
    form(occurrence||plan?'Изменить платёж':'Новый платёж',fields,{
      name:last?.name,amount:numeric(last?.amount),start:last?.start||last?.date||(state().calendar&&state().tab==='planned'?state().days?.[state().month]:null)||date(),repeat:last?.repeat||'once',
      amountMode:last?.amountMode||'fixed',method:last?.method||'manual',accountId:last?.accountId,categoryId:last?.categoryId
    },v=>commit('payment.plan',d=>{
      const patch = {name:v.name,amount:asAmount(v.amount),amountMode:v.amountMode,method:v.method,accountId:v.accountId,categoryId:v.categoryId||occurrence?.categoryId};
      if (!occurrence) return payments.savePaymentPlan(d,{...patch,id,start:v.start,repeat:v.repeat},date());
      const changed = payments.editPaymentOccurrence(d,occurrence.id,patch,date());
      const moved = v.start!==occurrence.date && payments.movePayment(d,occurrence.id,v.start,date());
      return changed || moved;
    }));
  }
  function paymentFact(row,op=null) {
    const id = op?.id || uid();
    const info = op && payments.paymentLinkInfo(doc(),op.id);
    const fields = [number('amount','Сумма оплаты'),day('date','Дата оплаты'),receiptAccounts()];
    const otherClosing = info?.closingOperationId && info.closingOperationId!==id;
    const originalDate = row.originalDate;
    const save = (input,final,changeFuture,steps) => commit(op?'payment.edit':'payment.record',d=>{
      const result = op ? payments.editPayment(d,id,input,date(),{editBase:JSON.stringify(op),final})
        : payments.confirmPayment(d,row.id,input,date(),{final});
      if (result && changeFuture) {
        const next = new Date(budget.monthEnd(originalDate.slice(0,7))+'T00:00:00Z');
        next.setUTCDate(next.getUTCDate()+1);
        payments.changePaymentFuture(d,row.id,{amount:row.paid-(op?.amount||0)+input.amount},next.toISOString().slice(0,10),date());
      }
      return result;
    },()=>{stack.splice(-steps);redraw();});
    form(op?'Изменить оплату':'Записать оплату',fields,{
      amount:numeric(op?.amount ?? row.remaining),date:op?.date || date(),accountId:op?.accountId || budget.primaryAccount(doc())?.id
    },v=>{
      const input=amountEntry(id,'expense',v,op?.allocations[0]?.categoryId || row.categoryId);
      if(budget.expenseShortfall(currentAccount(v.accountId),ledger.fact().balances[v.accountId],input.amount,op))fail('INSUFFICIENT_FUNDS');
      const total=row.paid-(op?.amount||0)+input.amount;
      if(otherClosing)return save(input,false,false,1);
      enter('payment-completion',{
        total,plan:row.amount,partial:total<row.amount,
        onChoice:final=>{
          if(final&&row.amountMode==='fixed'&&total!==row.amount){
            enter('payment-future',{onChoice:change=>save(input,true,change,3)});
          }else save(input,final,false,2);
        }
      });
    },{submitLabel:'Далее',paymentRecord:op,isPayment:true,inside:ui.pair('Запланировано на платёж',row.amount)});
  }

  const operationList = rows => operationRows(doc(),rows);
  const accountOperations=(d,id)=>d.operations.filter(o=>o.accountId===id||o.toAccountId===id||o.refundToAccountId===id);
  const bottom=(left,right='')=>'<div class="fr-action-islands'+(right?' fr-action-pair':'')+'">'+left+right+'</div>';
  const actionIsland=(label,action,disabled=false)=>'<button class="fr-primary" type="button" data-section-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
  const accountMenu=(action,expanded,label)=>'<button type="button" class="fr-category-new" data-section-action="'+action+'" aria-label="'+label+'" aria-expanded="'+expanded+'">'+icon('ellipsis')+'</button>';
  function accountPopover(panel,content) {
    return '<div class="fr-account-popover-layer"><button type="button" class="fr-account-dismiss" data-section-action="account-panel-close" aria-label="Закрыть"></button>'+
      '<div role="dialog" aria-modal="true" tabindex="-1" aria-label="'+({actions:'Действия со счётом',more:'Сведения о счёте',info:'О сумме'}[panel])+'" class="fr-account-popover fr-account-popover-'+panel+'">'+content+'</div></div>';
  }
  function creditPeriods(credit) {
    const periods=new Map();
    for(const lot of credit?.lots||[])if(lot.due)periods.set(lot.due,addSafe(periods.get(lot.due)||0,lot.amount));
    return [...periods].sort().map(([day,amount])=>'<div class="fr-credit-due-row">'+ui.pair('До '+dateText(day),amount)+(day<date()?ui.small('Просрочено'):'')+'</div>').join('')+
      (credit?.unknown?ui.pair('Без срока',credit.unknown):'')+(credit?.statementCurrent?ui.pair('По выписке до '+dateText(credit.dueDate),credit.due):'');
  }
  function renderAccount(s,a,credit,d) {
    const rows=accountOperations(d,a.id);
    const recent=[...rows].reverse().sort((left,right)=>right.date.localeCompare(left.date)).slice(0,5);
    const amount=credit?credit.debt:ledger.fact().balances[a.id];
    const statement=ui.actionButton('Указать сумму по выписке','credit-statement');
    const tabs=credit?ui.tabs([['due','Беспроцентный период'],['history','Операции']],s.tab||'due'):'';
    let received=0,spent=0;
    if(!credit)for(const op of rows){
      for(const [id,n] of postings(op)){
        const movementDate=op.kind==='transfer'&&id===op.toAccountId?op.creditDate||op.date:op.debitDate||op.date;
        if(id!==a.id||!movementDate.startsWith(todayMonth()))continue;
        if(n>0)received=addSafe(received,n);else spent=addSafe(spent,-n);
      }
    }
    const history=ui.link('История счёта','account-history',a.id);
    const more=credit?ui.panel(ui.pair('Кредитный лимит',credit.limit)+ui.pair('Можно потратить с карты',credit.available)+ui.pair('Свои деньги на карте',credit.own))+
      history+(!a.archived&&credit.own?ui.actionButton('Перевести свои деньги','account-transfer'):''):
      ui.panel(ui.small('Движение за '+monthLabel(todayMonth()))+ui.pair('Поступило',received)+ui.pair('Списано',spent))+history;
    const actions=a.archived?ui.actionButton('Восстановить счёт','account-restore'):
      (credit?ui.actionButton('Записать покупку','credit-purchase')+ui.actionButton('Условия кредитной карты','credit-settings')+
        ui.actionButton('Долги при настройке','credit-opening')+statement:ui.actionButton('Скорректировать остаток','account-reconcile'))+
      ui.actionButton('Переименовать','account-rename')+ui.actionButton('Архивировать','account-archive');
    const info=credit?'Вся непогашенная задолженность по кредитной карте.':'Текущий остаток на счёте с учётом записанных операций.';
    const body=ui.body('<div class="fr-account-total">'+ui.moneyLabel(amount)+
      '<button type="button" class="fr-account-info" data-section-action="account-panel-info" aria-label="О сумме" aria-expanded="'+(s.accountPanel==='info')+'">'+icon('info')+'</button></div>'+
      '<div class="fr-account-kind">'+accountMark(a)+(a.archived?ui.small('В архиве'):'')+'</div>'+tabs+
      (credit&&s.tab!=='history'?'<div class="fr-account-periods">'+(creditPeriods(credit)||ui.empty('Долга нет.'))+'</div>'+ui.actionButton('Все сроки','credit-periods'):
        (credit?'':'<h2 class="fr-section-title">Последние операции</h2>')+'<div class="fr-account-recent">'+recentOperationRows(d,recent,a.id)+'</div>'));
    return heading(a.name,'',accountMenu('account-panel-actions',s.accountPanel==='actions',credit?'Действия с картой':'Действия со счётом'),true)+
      '<div class="fr-account-static">'+body+'</div>'+bottom(actionIsland(credit?'Погасить долг':'Перевод',credit?'credit-repay':'account-transfer',a.archived||!!credit&&!credit.debt),
        '<button type="button" class="fr-primary fr-account-more" data-section-action="account-panel-more" aria-expanded="'+(s.accountPanel==='more')+'">Ещё</button>')+
      (s.accountPanel?accountPopover(s.accountPanel,s.accountPanel==='more'?more:s.accountPanel==='info'?'<p>'+info+'</p>':actions):'');
  }

  const incomeForMonth = month => income.incomeOccurrences(doc(),month+'-01',budget.monthEnd(month));

  function nextOpenIncome(month) {
    let next=month;
    for(let offset=0;offset<12&&next!=='9999-12';offset++){
      next=budget.nextBudgetMonth(next);
      const row=incomeForMonth(next).find(row=>row.remaining>0);
      if(row)return row;
    }
  }
  const freeIncome = op => op.amount-(doc().planning?.links||[])
    .filter(l=>l.operationId===op.id).reduce((sum,l)=>sum+l.amount,0);
  const linkableIncome = () => doc().operations.filter(o=>o.kind==='income'&&!o.cancelled&&!o.pending&&o.date<=date()&&freeIncome(o)>0);
  function linkIncome(row,operationId){
    const operation=linkableIncome().find(o=>o.id===operationId);
    if(!row?.remaining||!operation)return;
    const amount=Math.min(freeIncome(operation),row.remaining);
    return confirm('Связать с планом?',amountText(amount)+' будет учтено по плану «'+row.name+'» на '+dateText(row.date)+
      '. Дата записи — '+dateText(operation.date)+'. Остаток на счёте не изменится.',
      'Связать доход','income.link',d=>income.linkIncome(d,row.id,operationId),()=>{stack.pop();pop();});
  }
  function paymentDetail(s) {
    const row = payments.paymentOccurrence(doc(),s.id);
    const facts = payments.paymentHistory(doc()).filter(x=>x.occurrence.id===s.id);
    return list(row.name,ui.panel(ui.pair('Запланировано на платёж',row.amount)+ui.pair('Оплачено',row.paid)+
      ui.pair('Осталось',row.remaining)+ui.small(dateText(row.date))+
      (row.date<date()&&row.remaining>0?`<p class="fr-overdue">Просрочено</p>`:''))+
      (row.status==='open'||row.status==='partial'?ui.actionButton('Записать оплату','pay')+
        ui.actionButton('Изменить','payment-edit'): '')+
      (row.remaining>0&&row.method==='bank'?ui.actionButton('Результат в банке','payment-bank'):'')+
      (facts.length?`<details class="fr-section-panel"><summary>История оплат</summary>${facts.map(({operation:o})=>
        ui.link(dateText(o.date),'payment-record',o.id,ui.small(amountText(o.amount)+(o.cancelled?' · Отменена':'')))
      ).join('')}</details>`:''));
  }

  function render() {
    const s = state(), d = doc();
    if(s.dynamic==='credit-repay'){
      const {credit,months,sources}=s.repayOptions(s.values);
      const choicesMarkup=[['all','Весь долг',credit.debt],...[...months].map(([month,amount])=>[month,monthLabel(month),amount])].map(([id,label,amount])=>
        '<button class="fr-repay-choice" type="button" data-section-action="repay-scope" data-id="'+id+'" aria-pressed="'+(s.repayMonth===id)+'"><span>'+label+'</span>'+ui.moneyLabel(amount)+'</button>').join('');
      return ui.formScreen({...s,busy,insideBefore:choicesMarkup,submitLabel:'Погасить',
        fields:s.fields.map(field=>field.key==='accountId'?{...field,options:sources}:field)});
    }
    switch (s.page) {
      case 'summary': return ui.summary(s.month,budget.monthlyOverview(d,s.month),monthLabel(s.month));
      case 'summary-expenses': {
        const values=budget.monthlyOverview(d,s.month);
        const rows=d.operations.filter(o=>o.date.startsWith(s.month)&&!o.cancelled&&!o.pending&&
          (o.kind==='expense'||o.kind==='refund'||o.kind==='transfer'&&o.transferTarget==='external'));
        const categories=values.categories.filter(c=>!c.savings).map(c=>ui.link(c.name,'share',c.id,ui.moneyLabel(c.spent))).join('');
        return list('Расходы',ui.amountOverview(values.expense,{caption:monthLabel(s.month)})+categories+operationList(rows));
      }
      case 'received': {
        const rows=d.operations.filter(o=>o.date.startsWith(s.month)&&o.kind==='income'&&!o.cancelled&&!o.pending);
        const period=monthLabel(s.month);
        return list('Получено',ui.amountOverview(rows.reduce((sum,op)=>sum+op.amount,0),{caption:period})+operationList(rows));
      }
      case 'money': {
        const values=budget.availableMoney(d),{excludeSavings}=budget.budgetPreferences(d);
        return list('Можно тратить',ui.amountOverview(values.available)+
          ui.pair('На счетах',values.actual)+ui.pair(excludeSavings?'Непотраченные накопления':'Из них в накоплениях',
            excludeSavings&&values.reserved?-values.reserved:values.reserved)+
          ui.link('Накопления','savings')+ui.link('Настройки сводки','budget-settings'));
      }
      case 'data-management':
        return list('Управление данными',ui.actionButton('Сохранить резервную копию','backup-export')+
          ui.actionButton('Восстановить из копии','backup-restore')+
          ui.actionButton('Очистить финансовые данные','reset-financial')+
          ui.actionButton('Полный сброс FinRate','reset-all')+(s.error?ui.empty(s.error):''));
      case 'backup-ready':
        return list('Резервная копия',ui.panel('<p>Сохраните файл и запомните пароль копии. Он понадобится для восстановления.</p>')+
          `<a class="fr-section-secondary fr-backup-download" href="${esc(s.download)}" download="FinRate-${date()}.json">Скачать резервную копию</a>`);
      case 'reset-review':
        return list(clearTitle(s.mode),ui.panel('<p>'+clearConsequences(s.mode)+'</p>'+
          ui.small('Счетов: '+s.intent.summary.accounts+' · операций: '+s.intent.summary.operations))+
          ui.actionButton('Подготовить копию','backup-export')+ui.actionButton('Проверить сохранённую копию','reset-verify'));
      case 'summary-range': {
        const to=budget.monthEnd(s.month);
        const report=ledger.fact({from:s.from,to});
        return list('Сводка с даты',ui.small(dateText(s.from)+' — '+dateText(to))+
          ui.panel(ui.pair('Доходы',report.income)+ui.pair('Расходы',report.expense)+ui.pair('Доходы минус расходы',report.result))+
          ui.actionButton('Изменить дату','summary-range-filter')+ui.actionButton('Весь месяц','summary-range-close'));
      }
      case 'budget-settings': {
        const {excludeSavings}=budget.budgetPreferences(d);
        return list('Настройки сводки',
          `<section class="fr-display-setting"><h2>Расчёт доступной суммы</h2>
            <button type="button" class="fr-display-toggle" role="switch" aria-checked="${!excludeSavings}"
              data-section-action="toggle-savings">Показывать накопления в результате месяца
              <span aria-hidden="true"></span></button></section>`+ui.link('Сводка с даты','summary-range-filter')+(s.error?ui.empty(s.error):''));
      }
      case 'form-categories': {
        const rows=paymentCategoryRows(s);
        const add=ui.actionButton('Создать категорию','form-category-new')+ui.actionButton('Создать подкатегорию','form-subcategory-parent');
        return list('Категория','<input type="search" class="fr-input" data-payment-category-search aria-label="Поиск категории" placeholder="Поиск" value="'+esc(s.query)+'"><div data-payment-category-results>'+rows+'</div>'+add);
      }
      case 'form-subcategory-parent':
        return list('В какую категорию?',d.categories.filter(c=>c.type==='expense'&&!c.parentId&&!c.archived&&!c.mergedInto)
          .map(c=>`<button type="button" class="fr-operation-picker-choice" data-section-action="form-category-new" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')||ui.empty('Сначала создайте категорию.'));
      case 'form-accounts': {
        const selected=currentAccount(s.accountId);
        const shortfall=s.owner.isPayment&&selected?budget.expenseShortfall(selected,ledger.fact().balances[selected.id],
          validAmount(s.owner.values.amount.replace('.',','))?money(s.owner.values.amount):0,s.owner.paymentRecord):0;
        return list('Счёт',s.options.map(([id,label,mark])=>`<button type="button" class="fr-form-account"
          data-section-action="form-account-select" data-id="${esc(id)}" aria-pressed="${id===s.accountId}">
          <span class="fr-form-account-copy"><strong>${esc(label)}</strong>${mark}</span>${id===s.accountId?icon('check'):''}</button>`).join('')+
          (shortfall?ui.empty('На этом счёте не хватает '+amountText(shortfall)+'. Выберите другой счёт.'):''))+
          `<button type="button" class="fr-primary" data-section-action="form-account-next" ${selected&&!shortfall?'':'disabled'}>Далее</button>`;
      }
      case 'share-scope': return list(s.owner.single?'Когда применить?':'Изменить план на все следующие месяцы?',
        (s.owner.single?ui.actionButton('Только этот месяц','share-scope-month'):'')+
        ui.actionButton(s.owner.single?'Этот месяц и план на будущее':'Да, изменить план','share-scope-future')+
        (s.error?ui.empty(s.error):''));
      case 'distribution':
      case 'share-detail': {
        const overview=budget.monthlyOverview(d,s.month);
        s.plan=overview.expected;
        const operations=s.categoryHistory ? operationList(d.operations.filter(o=>o.date.startsWith(s.month)&&
          o.allocations.some(a=>budget.categoryRoot(d,a.categoryId)===s.single))) : '';
        return ui.shareScreen(s,overview.categories.filter(c=>!s.single||c.id===s.single),s.plan,budget.budgetPreferences(d).step,operations);
      }
      case 'categories': {
        return heading('Категории','',ui.plus('category-type-new','Создать категорию'))+
          `<div class="fr-category-browser">
            <div class="fr-payment-actions-search fr-category-search"><input type="search" data-section-search placeholder="Поиск" aria-label="Поиск категорий" value="${esc(s.query)}"></div>
            ${ui.body(`<div data-section-results>${categoryResults(s)}</div>`)}
          <div class="fr-category-carousel" role="slider" tabindex="0" aria-label="Тип категорий"
            aria-valuemin="1" aria-valuemax="3" aria-valuenow="${categoryTypes.findIndex(([id])=>id===s.tab)+1}"
            aria-valuetext="${categoryTypes.find(([id])=>id===s.tab)[1]}">
            <div class="fr-category-carousel-highlight" aria-hidden="true"></div>
            <div class="fr-category-carousel-rail" aria-hidden="true">${categoryTypes.map(([id,label])=>
              `<span data-category-slide="${id}" ${id===s.tab?'data-current':''}>${label}</span>`).join('')}</div></div></div>`;
      }
      case 'category-type-picker': return list('Тип категории',
        ui.link('Расходная','category-type-create','expense')+ui.link('Доходная','category-type-create','income')+ui.link('Накопительная','category-type-create','savings'));
      case 'category': {
        const c=currentCategory(s.id);
        const children=d.categories.filter(child=>child.parentId===c.id&&!child.archived)
          .sort((a,b)=>a.name.localeCompare(b.name,'ru'));
        const totals=c.type==='expense' && budget.monthlyOverview(d,todayMonth()).categories.find(item=>item.id===c.id);
        return list(c.name,(totals?ui.panel(ui.pair('План',totals.plan)+ui.pair('Расход',totals.spent)+ui.budgetBar(totals.plan,totals.spent)):'')+
          ui.link(c.type==='expense'?'Расходы':'Поступления','category-ops',c.id)+
          (totals?ui.link('Доля плана','share',c.id,ui.small(totals.bps/100+'%')):'')+
          (children.length?`<section class="fr-section-panel fr-subcategory-panel" aria-labelledby="fr-subcategory-heading">
            <h2 class="fr-section-title" id="fr-subcategory-heading">Подкатегории</h2>
            ${children.map(child=>ui.link(child.name,'category',child.id)).join('')}
          </section>`:'')+
          (!c.parentId?ui.actionButton('Создать подкатегорию','subcategory-new'):'')+
          ui.actionButton('Переименовать','category-rename'));
      }
      case 'category-ops': {
        const c=currentCategory(s.id);
        return list(c.type==='expense'?'Расходы':'Поступления',ui.small(c.name)+operationList(d.operations.filter(o=>o.kind===c.type&&
          o.allocations.some(a=>a.categoryId===c.id||budget.categoryRoot(d,a.categoryId)===c.id))),ui.plus('context-operation',c.type==='expense'?'Записать расход':'Записать доход'));
      }
      case 'savings': return heading('Накопления','',ui.plus('goal-new','Новая цель'))+
        ui.body(budget.savings(d).filter(g=>!g.closed).map(g=>ui.goalCard(g)).join('')||ui.empty('Целей пока нет.'))+
        `<div class="fr-floating-history">${ui.actionButton('История накоплений','goal-history')}</div>`;
      case 'goal-history': {
        const history=budget.savings(d).filter(g=>g.closed).reverse()
          .sort((a,b)=>b.date.localeCompare(a.date)||(b.at||'').localeCompare(a.at||''));
        return list('История накоплений',history.map(ui.closedGoalCard).join('')||ui.empty('Закрытых целей пока нет.'));
      }
      case 'goal':
      case 'goal-manage': {
        const goal=budget.savings(d).find(g=>g.categoryId===s.id);
        const opened=s.page==='goal-manage';
        const manage=accountMenu('goal-manage',opened,'Управление накоплением');
        return list(goal.name,`<section class="fr-goal-total">${ui.small('Доступно потратить')}${ui.moneyLabel(goal.remaining)}
          ${ui.small('Цель '+amountText(goal.target))}</section>
          <progress class="fr-goal-detail-progress" max="${goal.target}" value="${Math.min(goal.target,goal.accumulated)}" aria-label="Прогресс накопления"></progress>`+
          ui.goalFacts([['Всего накоплено',goal.accumulated],['Из этого потрачено',goal.spent],['До цели',Math.max(0,goal.target-goal.accumulated)]])+
          ui.link('Расходы цели','category-ops',goal.categoryId),manage)+(opened?accountPopover('actions',
           ui.actionButton('Добавить расход','goal-expense')+ui.actionButton('Изменить категорию','goal-edit')+ui.actionButton('Цель достигнута','goal-close')):'');
      }
      case 'closed-goal': {
        const goal=budget.savings(d).find(g=>g.categoryId===s.id);
        return list(goal.name,ui.closedGoalDetail(goal,budget.closedSavingsOperations(d,goal),d,s.expanded));
      }
      case 'accounts': {
        const balances=ledger.fact().balances, active=s.tab!=='archive';
        const types=[['Безнал',a=>!isCredit(a)&&a.kind!=='cash'],['Наличные',a=>a.kind==='cash'],['Кредитная карта',isCredit]];
        const rows=types.map(([name,match])=>{
          const accounts=d.accounts.filter(a=>a.archived===!active&&match(a));
          return accounts.length?`<section class="fr-account-section"><h2 class="fr-section-title">${name}</h2>${
            accounts.map(a=>ui.accountCard(a,isCredit(a)?creditSummary(d,a.id,date()).debt:balances[a.id],a.id===budget.primaryAccount(d)?.id)).join('')}</section>`:'';
        }).join('');
        const menu=accountMenu('account-panel-actions',s.accountPanel==='actions','Настройки счетов');
        return heading('Счета и кошельки','',menu)+
          '<div class="fr-accounts-browser'+(active?' fr-accounts-active':'')+'">'+
          ui.tabs([['active','Действующие'],['archive','Архив']],active?'active':'archive').replace('fr-section-tabs','fr-section-tabs fr-account-tabs')+
          ui.body(rows||ui.empty(active?'Счетов пока нет.':'Архив пуст.'))+'</div>'+
          (active?bottom(actionIsland('Добавить счёт','account-new')):'')+
          (s.accountPanel==='actions'?accountPopover('actions',ui.actionButton('Выбрать основной счёт','account-primary-picker')):'');
      }
      case 'account': {
        const a=currentAccount(s.id);
        return renderAccount(s,a,isCredit(a)?creditSummary(d,a.id,date()):null,d);
      }
      case 'credit-periods': return list('Беспроцентный период',creditPeriods(creditSummary(d,s.id,date()))||ui.empty('Долга нет.'));
      case 'account-primary-picker': {
        const primary=budget.primaryAccount(d)?.id;
        return list('Основной счёт',d.accounts.filter(a=>!a.archived&&!isCredit(a)).map(a=>
          ui.link(a.name,'account-primary',a.id,a.id===primary?ui.small('Основной счёт'):'')).join('')||ui.empty('Нет доступных счетов.'));
      }
      case 'account-history': return list('История счёта',ui.small(accountName(s.id))+
        d.accountEdits.filter(r=>r.accountId===s.id).map((r,i,rows)=>{
          const next=rows[i+1]?.before||currentAccount(s.id);
          return ui.panel(ui.small(dateText(r.at.slice(0,10)))+
            (r.before.name!==next.name?`<div class="fr-history-change"><del>${esc(r.before.name)}</del><strong>${esc(next.name)}</strong></div>`:'Условия счёта изменены'));
        }).reverse().join('')+'<div class="fr-account-history-rows">'+operationList(accountOperations(d,s.id))+'</div>');
      case 'transfer-amount': return keypad('',s.buffer,validAmount(s.buffer),s.title,'transfer-accept');
      case 'transfer-accounts': {
        const x=s.draft;
        return heading(s.title)+ui.body('<div class="fr-transfer-accounts-body">'+transferRow('Откуда','transfer-source',x.accountId)+
          (!s.funding?`<div class="fr-transfer-direction"><button type="button" class="fr-transfer-swap" data-section-action="transfer-swap" aria-label="Поменять счета местами"
             ${x.accountId&&x.toAccountId&&!isCredit(currentAccount(x.accountId))?'':'disabled'}>${icon('swap')}</button></div>`:'')+
          transferRow('Куда','transfer-target',x.toAccountId)+'</div>')+
          `<button type="button" class="fr-primary" data-section-action="transfer-next" ${x.accountId&&x.toAccountId?'':'disabled'}>Далее</button>`;
      }
      case 'transfer-picker': {
        const x=s.owner.draft;
        const other=s.field==='accountId'?x.toAccountId:x.accountId;
        const candidates=d.accounts.filter(a=>!a.archived&&a.id!==other&&(!isCredit(a)||s.field==='accountId'&&a.id===s.owner.creditSource));
        return list(s.field==='accountId'?'Откуда':'Куда',candidates.map(a=>ui.link(a.name,'transfer-pick',a.id,
          `<span class="fr-section-amount">${ui.moneyLabel(isCredit(a)?creditSummary(d,a.id,date()).own:ledger.fact().balances[a.id])}${accountMark(a)}</span>`)).join('')||ui.empty('Нет доступных счетов.'));
      }
      case 'transfer-review': {
        const v=s.draft;
        const p=accountTransferPreview(d,{...v,amount:money(v.amount)},s.operation);
        const insufficient=money(v.amount)>p.maximum;
        return heading(s.title)+ui.body(`<button type="button" class="fr-transfer-total" data-section-action="transfer-edit-amount"
          aria-label="Изменить сумму перевода">${ui.amountOverview(money(v.amount),{label:'Сумма'})}${icon('pencil')}</button>`+
          transferRow('Откуда','transfer-source',v.accountId,p.fromAfter)+transferRow('Куда','transfer-target',v.toAccountId,p.toAfter)+
          ui.link('Дата','transfer-edit-date','',ui.small(dateText(v.date)))+(insufficient?ui.empty('Недостаточно доступных средств для перевода.'):s.error?ui.empty(s.error):''))+
          `<button type="button" class="fr-primary" data-section-action="transfer-save" ${busy||insufficient?'disabled':''}>${s.operation?'Сохранить':'Перевести'}</button>`;
      }
      case 'transfer-record': {
        const o=d.operations.find(o=>o.id===s.id);
        const repayment=isCredit(currentAccount(o.toAccountId)), own=o.accountId===o.toAccountId;
        const title=repayment?'Погашение':'Перевод';
        const source=own?'Свои деньги на карте':accountName(o.accountId)+' → '+accountName(o.toAccountId);
        return list(title,ui.panel(ui.pair('Сумма',o.amount)+ui.small(source)+
          (o.creditRepayMonth?ui.small(monthLabel(o.creditRepayMonth)):'')+
          ui.small(dateText(o.date))+(o.cancelled?ui.small('Отменён'):!repayment&&o.balanceSnapshot?
            ui.pair('Остаток отправителя после перевода',o.balanceSnapshot.fromAfter)+
            ui.pair('Остаток получателя после перевода',o.balanceSnapshot.toAfter):''))+
          `<details class="fr-section-panel"><summary>История изменений</summary>${ui.recordHistory(d,o)}</details>`+
          (o.cancelled||currentAccount(o.accountId)?.archived||currentAccount(o.toAccountId)?.archived?'':ui.actionButton('Изменить','transfer-edit')+ui.actionButton('Отменить перевод','transfer-cancel')));
      }
      case 'refund': {
        const o=d.operations.find(o=>o.id===s.id);
        return list('Возврат',ui.panel(ui.pair('Сумма',o.amount)+ui.small(accountName(o.accountId))+ui.small(dateText(o.date)))+
          ui.link('Исходный расход','refund-original',o.referenceId)+
          (o.cancelled?ui.small('Операция отменена'):currentAccount(o.accountId).archived?'':ui.actionButton('Отменить возврат','refund-cancel')));
      }
      case 'adjustment': {
        const o=d.operations.find(o=>o.id===s.id);
        return list('Корректировка',ui.panel(ui.pair('Сумма',o.amount)+ui.small(accountName(o.accountId))+ui.small(dateText(o.date))));
      }
      case 'income-choice':
        return list('Записать доход','<div class="fr-income-choice">'+
          '<button class="fr-primary" type="button" data-section-action="planned-income">Записать запланированный доход</button>'+
          ui.actionButton('Другой доход','normal-income')+'</div>');
      case 'income-due':
      case 'income-link-target': {
        const linking=s.page==='income-link-target';
        const occurrences=incomeForMonth(s.month);
        const rows=occurrences.filter(row=>row.remaining>0);
        const next=rows.length?null:nextOpenIncome(s.month);
        const caption=linking?ui.small('Выберите месяц плана. Дата зачисления не изменится.'):'';
        return list('Запланированные доходы',ui.monthControl(s.month)+caption+
          (rows.map(row=>expectedIncomeRow(row,linking?'income-link-target-pick':'income-due-pick')).join('')||
          ui.empty(occurrences.length?'Все ожидания этого месяца уже закрыты.':'На этот месяц нет запланированных поступлений.'))+
          (next?ui.link('Следующее ожидание','income-show-month',next.date.slice(0,7),ui.small(next.name+' · '+dateText(next.date))):'')+
          (linking?'':ui.actionButton('Планы доходов','income-plans-manage')));
      }
      case 'income-review': {
        const v=s.values;
        return list('Доход',ui.panel(ui.pair('Получено',asAmount(v.amount))+ui.small(s.row.name)+
          ui.small(dateText(v.date))+ui.small(accountName(v.accountId)))+
          (s.error?ui.empty(s.error):'')+ui.actionButton('Сохранить','income-review-save'));
      }
      case 'income-link-source':
        return list('Связать записанный доход',linkableIncome().map(o=>ui.link(categoryName(o.allocations[0]?.categoryId),
          'income-link-source-pick',o.id,ui.small(amountText(freeIncome(o))+' · '+dateText(o.date)))).join('')||
          ui.empty('Нет записанных доходов, которые можно связать.'));
      case 'income-completion':
        return list('Доход получен полностью?',ui.panel(ui.pair('Получено',s.received)+ui.pair('Осталось',s.row.remaining-s.received))+
          ui.actionButton('Получен частично','income-receipt-part')+ui.actionButton('Получен полностью','income-receipt-full')+
          (s.error?ui.empty(s.error):''));
      case 'income-stop-choice':
        return list('Ожидания этого плана',ui.actionButton('Сохранить ожидания','income-stop-keep')+
          ui.actionButton('Закрыть ожидания','income-stop-close')+(s.error?ui.empty(s.error):''));
      case 'income-plans': {
        const archived=s.tab==='archive';
        const plans=(d.planning?.incomes||[]).filter(p=>p.archived===archived&&!p.deletedAt);
        const rows=archived?[]:incomeForMonth(s.month);
        const entries=plans.map(p=>`<button type="button" class="fr-income-plan-row" data-section-action="income-source" data-id="${esc(p.id)}">
          <span><strong>${esc(p.name)}</strong>${ui.small(incomeSchedule(p))}</span>
          <span>${ui.small('По плану')}${ui.moneyLabel(p.amount)}</span></button>`).join('');
        const expected=!archived&&(rows.length||d.planning?.incomes.length)?`<section class="fr-income-occurrences"><h2>Ожидаемые поступления</h2>
          ${ui.monthControl(s.month)}${rows.map(row=>expectedIncomeRow(row)).join('')||
          ui.empty('Ожидаемых поступлений пока нет.')}</section>`:'';
        return heading('Планы доходов','',archived?'':ui.plus('income-new','Новый план дохода'))+
          ui.tabs([['active','Действующие'],['archive','Архив']],archived?'archive':'active').replace('fr-section-tabs','fr-section-tabs fr-income-plans-tabs')+
          ui.body((entries||ui.empty(archived?'Архив пуст.':'Планов доходов пока нет.'))+expected+
            (!archived?ui.actionButton('Связать записанный доход','income-link-source'):''))+
          (archived?'':'<button type="button" class="fr-primary" data-section-action="distribution">Распределение плана</button>');
      }
      case 'income-source': {
        const p=d.planning.incomes.find(p=>p.id===s.id);
        return list(p.name,ui.panel(ui.pair('План',p.amount)+ui.small(incomeSchedule(p))+ui.small('План действует с '+dateText(p.start)))+
          (p.archived?ui.actionButton('Восстановить','income-restore'):ui.actionButton('Изменить','income-edit')+
            ui.actionButton('В архив','income-stop'))+(s.error?ui.empty(s.error):''));
      }
      case 'income-occurrence': {
        const r=incomeRow(s.id);
        const links=(d.planning?.links||[]).filter(l=>l.occurrenceId===r.id);
        return list(r.name,ui.panel(ui.pair('Ожидается',r.amount)+ui.pair('Получено в счёт плана',r.received)+ui.pair('Осталось получить',r.remaining)+
          ui.small(dateText(r.date))+(r.status==='skipped'?ui.small('Ожидание закрыто'):''))+
          (r.remaining?ui.actionButton('Записать поступление','income-receipt')+
            (linkableIncome().length?ui.actionButton('Связать записанный доход','income-link-list'):'')+
            ui.actionButton('Больше не ожидаю','income-close'):'')+
          links.map(link=>{
            const op=d.operations.find(o=>o.id===link.operationId);
            if(!op||op.cancelled||op.pending)return '';
            return ui.panel(operationList([op])+ui.pair('Зачтено в план',link.amount)+
              `<button type="button" class="fr-section-secondary" data-section-action="income-unlink" data-id="${esc(link.id)}">Отвязать от плана</button>`);
          }).join(''));
      }
      case 'income-link-list': {
        const rows=linkableIncome();
        return list('Выбрать поступление',rows.map(o=>ui.link(categoryName(o.allocations[0]?.categoryId),'income-link',o.id,ui.small(amountText(freeIncome(o))+' · '+dateText(o.date)))).join('')||ui.empty('Поступлений пока нет.'));
      }
      case 'payments': return renderPayments(s);
      case 'payment-detail': return paymentDetail(s);
      case 'payment-plan': {
        const plan=d.payments.plans.find(p=>p.id===s.id), latest=plan.versions.at(-1);
        const paused=plan.pauses.some(p=>!p.to);
        return list(latest.name,ui.panel(ui.pair('Запланировано на платёж',latest.amount)+ui.small(payments.PAYMENT_REPEATS[latest.repeat]))+
          ui.actionButton('Изменить','payment-plan-edit')+ui.actionButton(paused?'Возобновить':'Приостановить','payment-pause')+
          (s.error?ui.empty(s.error):''));
      }
      case 'batch-review': {
        const total=s.items.reduce((sum,item)=>sum+money(item.values.amount),0);
        return heading('Проверка оплат')+ui.body(ui.pair('Общая сумма',total)+s.items.map((item,i)=>
          ui.panel(ui.link(item.row.name,'batch-item',i,ui.small(item.reviewed?'Проверено':'Проверить'))+
            ui.pair('Сумма',money(item.values.amount))+ui.small(dateText(item.values.date)+' · '+accountName(item.values.accountId)))
        ).join('')+(s.error?ui.empty(s.error):''))+
          `<button type="button" class="fr-primary" data-section-action="batch-save" ${busy||s.items.some(item=>!item.reviewed)?'disabled':''}>Подтвердить оплаты</button>`;
      }
      case 'payment-completion':
        return list('Платёж оплачен полностью?', ui.panel(ui.pair('Запланировано на платёж',s.plan)+ui.pair('Фактически',s.total)+
          (s.total!==s.plan?ui.pair('Разница',s.total-s.plan):''))+
          ui.actionButton('Полностью','payment-final')+(s.partial?ui.actionButton('Частично','payment-partial'):'')+
          (s.error?ui.empty(s.error):''));
      case 'payment-future':
        return list('Изменить сумму плана на следующие месяцы?',ui.actionButton('Да, изменить','payment-future-yes')+
          ui.actionButton('Нет, только этот платёж','payment-future-no')+(s.error?ui.empty(s.error):''));
      case 'payment-record': {
        const o=d.operations.find(o=>o.id===s.id), info=payments.paymentLinkInfo(d,o.id);
        const r=info.occurrence;
        return list('Запись оплаты',ui.panel(ui.pair('Сумма оплаты',o.amount)+ui.small(r.name)+ui.small(dateText(o.date))+
          ui.small(accountName(o.accountId))+(o.cancelled?ui.small('Отменена'):''))+
          `<details class="fr-section-panel" ${s.historyOpen?'open':''}><summary>История изменений</summary>${ui.recordHistory(d,o)}</details>`+
          (o.cancelled?'':ui.actionButton('Изменить','payment-fact-edit')+
            (!currentAccount(o.accountId).archived&&refundRemaining(d,o.id).some(part=>part.amount>0)?ui.actionButton('Записать возврат','payment-refund'):'')+
            ui.actionButton('Отменить запись оплаты','payment-fact-cancel')));
      }
      case 'form': {
        if(s.openingDebtCount&&(s.dynamic!=='account'||s.values.kind==='credit')){
          const debt=readOpeningDebtsForPreview(s.values,s.openingDebtCount);
          return ui.formScreen({...s,busy,fields:s.dynamic==='account'?[...visibleFields(s).filter(f=>!['opening','openingDue'].includes(f.key)),...openingDebtFields(s.openingDebtCount)]:s.fields,
            inside:'<div data-opening-total>'+ui.pair('Общий начальный долг',debt)+'</div>'+ui.actionButton('Добавить долг','opening-debt-add')});
        }
        return ui.formScreen({...s,busy,fields:visibleFields(s)});
      }
      case 'discard': return unsaved('data-section-action','resume','discard');
      case 'confirm':
        return list(s.title,ui.panel(`<p>${esc(s.message)}</p>`)+ui.actionButton(s.submitLabel,'confirm')+
        (s.error?ui.empty(s.error):''));
    }
  }

  function expectedIncomeRow(row,action='income-occurrence') {
    const status=row.status==='skipped'?'Ожидание закрыто':
      row.status==='closed'||!row.remaining?'Получение завершено':row.received?'Получено частично':'Ожидается';
    return `<button type="button" class="fr-income-event" data-section-action="${action}" data-id="${esc(row.id)}">
      <span class="fr-income-event-date">${dateText(row.date)}</span><span class="fr-income-event-status">${status}</span>
      <strong class="fr-income-event-name">${esc(row.name)}</strong>
      <span class="fr-income-event-amount">${ui.small('Осталось получить')}${ui.moneyLabel(row.remaining)}</span></button>`;
  }

  function incomeSchedule(plan) {
    const schedule=plan.schedules?.at(-1);
    const frequency=RECURRENCES[plan.repeat]||({once:'Разово','salary-split':'Аванс и остаток'})[plan.repeat]||plan.repeat;
    if(!schedule)return frequency;
    if(plan.repeat==='monthly')return frequency+' · '+schedule.day+' числа';
    if(plan.repeat==='weekly')return frequency+' · '+['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][schedule.weekday];
    if(plan.repeat==='yearly')return frequency+' · '+schedule.day+'.'+String(schedule.month).padStart(2,'0');
    return frequency;
  }


  function categoryResults(s) {
    const q=s.query.trim().toLocaleLowerCase('ru');
    const goals=new Set(budget.savings(doc()).filter(g=>!g.closed).map(g=>g.categoryId));
    const rows=doc().categories.filter(c=>!c.parentId&&!c.archived&&
      (s.tab==='savings'?goals.has(c.id):c.type===s.tab&&!goals.has(c.id)))
      .filter(c=>c.name.toLocaleLowerCase('ru').includes(q)||doc().categories.some(child=>child.parentId===c.id&&child.name.toLocaleLowerCase('ru').includes(q)))
      .sort((a,b)=>Number(budget.rateAt(doc(),b.id,todayMonth())>0)-Number(budget.rateAt(doc(),a.id,todayMonth())>0)||
        a.name.localeCompare(b.name,'ru'));
    const overview=s.tab==='expense'?budget.monthlyOverview(doc(),todayMonth()):null;
    return rows.map(c=>{
      const b=overview?.categories.find(r=>r.id===c.id);
      const children=doc().categories.filter(child=>child.parentId===c.id&&!child.archived&&
        (c.name.toLocaleLowerCase('ru').includes(q)||child.name.toLocaleLowerCase('ru').includes(q)))
        .sort((a,b)=>a.name.localeCompare(b.name,'ru'));
      const open=q||s.expanded?.includes(c.id);
      return `<div class="fr-category-group-row"><div class="fr-category-group-heading">
        <button type="button" class="fr-category-group-main" data-section-action="category" data-id="${esc(c.id)}">
        <strong data-full-name>${esc(c.name)}</strong>${b?`<span class="fr-category-metrics">${ui.small(b.bps/100+'%')}${ui.moneyLabel(b.plan-b.spent)}</span>`:''}</button>
        <button type="button" class="fr-category-fold" data-section-action="category-fold" data-id="${esc(c.id)}"
          aria-label="Подкатегории: ${esc(c.name)}" aria-expanded="${!!open}">${icon('down')}</button></div>
        ${open?`<div class="fr-category-children">${children.map(child=>ui.link(child.name,'category',child.id)).join('')}
          ${ui.link('Добавить подкатегорию','category-add-child',c.id)}</div>`:''}</div>`;
    }).join('')||(q?ui.link('Создать «'+s.query.trim()+'»','category-new'):ui.empty('Категорий пока нет.'));

  }

  function renderPayments(s) {
    const d=doc(), from=s.month+'-01', to=budget.monthEnd(s.month);
    let content='';
    const occurrences=payments.paymentOccurrences(d,from,to);
    const chosenDay=s.days?.[s.month];
    if (s.tab==='planned') {
      const plans=(d.payments?.plans||[]).slice().sort((a,b)=>a.versions.at(-1).name.localeCompare(b.versions.at(-1).name,'ru'));
      if(s.calendar){
        content=occurrences.filter(r=>!chosenDay||r.date===chosenDay).sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(r=>
          ui.ledgerRow(r.name,'payment-detail',r.id,r.amount,ui.small(dateText(r.date)))).join('');
      }else{
        const rows=(paused)=>plans.filter(p=>p.pauses.some(v=>!v.to)===paused).map(p=>{
          const v=p.versions.filter(v=>v.from<=to).at(-1)||p.versions[0];
          return ui.ledgerRow(v.name,'payment-plan',p.id,v.amount,ui.small(dateText(v.start)));
        }).join('');
        const paused=rows(true);
        content=rows(false)+(paused?ui.panel('<h2 class="fr-section-title">Приостановленные</h2>'+paused):'');
      }
    } else if (s.tab==='paid') {
      const groups=new Map();
      for (const {operation:o,occurrence:r} of payments.paymentHistory(d)) {
        if (o.cancelled||!o.date.startsWith(s.month)) continue;
        const group=groups.get(r.id)||{r,sum:0,date:o.date};
        group.sum+=o.amount;
        groups.set(r.id,group);
      }
      content=[...groups.values()].map(({r,sum,date:paid})=>ui.ledgerRow(r.name,'payment-detail',r.id,sum,ui.small(dateText(paid)))).join('');
    } else {
      const due=payments.paymentDue(d,s.month,date()).filter(r=>s.month>=todayMonth()||r.date>=from);
      content=due.map(r=>`<div class="fr-due-row">${s.selecting?`<input type="checkbox" data-batch="${esc(r.id)}" aria-label="${esc(r.name)}" ${s.selected.includes(r.id)?'checked':''}>`:''}${
        ui.ledgerRow(r.name,'payment-detail',r.id,r.remaining,`<span class="fr-payment-meta">${ui.small(dateText(r.date))}
        ${r.overdue?'<span class="fr-overdue">Просрочено</span>':''}</span>`)
      }</div>`).join('');
      if (s.selecting) content+=ui.actionButton('Оплатить выбранные','batch')+
        (s.selected.length===1?ui.actionButton('Изменить выбранный платёж','batch-edit'):'')+ui.actionButton('Снять выбор','batch-exit');
    }
    const days=new Set(occurrences.map(r=>r.date));
    const offset=(new Date(from+'T12:00:00Z').getUTCDay()+6)%7;
    const calendar=s.tab==='planned'&&s.calendar ? `<div class="fr-section-calendar">${'<span></span>'.repeat(offset)}${Array.from({length:Number(to.slice(8))},(_,i)=>{
      const day=from.slice(0,8)+String(i+1).padStart(2,'0');
      return `<button type="button" data-section-action="payment-day" data-id="${day}" aria-pressed="${chosenDay===day}" ${days.has(day)?'data-marked':''}>${i+1}</button>`;
    }).join('')}</div>` : '';
    return `<div class="fr-payment-screen ${s.tab==='planned'?'fr-payment-screen--planned':''}">`+
      heading('Платежи','',ui.plus('payment-new','Новый платёж'))+ui.monthControl(s.month)+calendar+
      ui.body(content||ui.empty('Платежей пока нет.'))+
      `<div class="fr-payment-tab-island"><div class="fr-payment-tab-top" role="group" aria-label="План платежей">${ui.tabs([['planned','Запланированные']],s.tab)}
      ${s.tab==='planned'?`<button type="button" class="fr-calendar-toggle" data-section-action="payment-calendar"
        aria-label="${s.calendar?'Список':'Календарь'}">${s.calendar?'☰':ui.calendarIcon()}</button>`:''}</div>
        <div class="fr-payment-facts" role="group" aria-label="Состояние оплаты">${ui.tabs([['due','К оплате'],['paid','Оплаченные']],s.tab)}</div></div></div>`;
  }

  function visibleFields(s) {
    if (s.dynamic==='account') return s.fields.filter(f=>s.values.kind==='credit'?
      (f.key!=='days'||s.values.mode!=='statement'):!['limit','mode','days','openingDue'].includes(f.key));
    if (s.dynamic==='income') return s.fields.filter(f=>
      (f.key!=='day'||['monthly','yearly'].includes(s.values.repeat))&&
      (f.key!=='month'||s.values.repeat==='yearly')&&(f.key!=='weekday'||s.values.repeat==='weekly'));
    return s.fields;
  }

  function action(name,id='') {
    if (busy) return;
    const s=state();
    if(s.accountPanel==='actions'&&!name.startsWith('account-panel-'))s.accountPanel='';
    switch (name) {
      case 'month': {
        const next=new Date(s.month+'-01T12:00:00Z');
        next.setUTCMonth(next.getUTCMonth()+Number(id));
        const month=next.toISOString().slice(0,7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<100) return;
        if(s.categoryHistory){
          if(dirty(s))return enter('discard',{onDiscard:()=>changeShareMonth(s,month)});
          return changeShareMonth(s,month);
        }
        s.month=month;s.scroll=0;s.selected=[];return redraw();
      }
      case 'tab': remember();s.tab=id;s.scroll=0;s.selecting=false;s.selected=[];return redraw();
      case 'resume': return pop();
      case 'discard':
        stack.pop();
        return s.onDiscard ? s.onDiscard() : pop();
      case 'confirm': return commit(s.action,s.fn,s.done||pop);
      case 'summary-range-filter': {
        const first=s.month+'-01', last=budget.monthEnd(s.month);
        return form('Сводка с даты',[{...day('from','Начало периода'),min:first,max:last}],{from:s.from||first},v=>{
          if(!/^\d{4}-\d{2}-\d{2}$/.test(v.from)||v.from<first||v.from>last)fail('SELECTION');
          stack.pop();
          if(s.page==='summary-range'){s.from=v.from;return redraw();}
          return enter('summary-range',{month:s.month,from:v.from,settings:s});
        },{submitLabel:'Показать'});
      }
      case 'summary-range-close':
        if(stack.at(-2)?.page==='budget-settings'&&stack.at(-3)?.page==='summary')stack.pop();
        return pop();
      case 'backup-export': return form('Сохранить резервную копию',[backupPassword],{},v=>{
        const password=v.password;v.password='';
        let file;
        return dataTask(async()=>{file=await ledger.exportBackup(password);},
          ()=>{stack.pop();enter('backup-ready',{download:URL.createObjectURL(file)});});
      },{submitLabel:'Подготовить копию',insideBefore:ui.panel('<p>Задайте пароль копии, минимум 12 символов.</p>')});
      case 'backup-restore': return form('Восстановить из копии',[backupFile,backupPassword],{},v=>{
        const {backup,password}=v;v.password='';
        return dataTask(()=>ledger.restoreBackup(backup,password),()=>location.reload());
      },{submitLabel:'Заменить данные',danger:true,insideBefore:ui.panel('<p>Данные из копии заменят текущие данные приложения.</p>')});
      case 'reset-financial': case 'reset-all': {
        const mode=name==='reset-all'?'all':'financial';
        let intent;
        return dataTask(async()=>{intent=await ledger.resetPreview(mode);},()=>enter('reset-review',{mode,intent}));
      }
      case 'reset-verify': return verifyReset(s);
      case 'summary-more':
        s.more=true;
        return restoreSummaryMore(s);
      case 'summary-more-close': return host.querySelector('.fr-summary-dialog[open]')?.close();
      case 'summary-expenses': return enter(name,{month:s.month});
      case 'summary-plans': return enter('income-plans',{month:s.month,tab:'active'});
      case 'summary-payments': return enter('payments',{month:s.month,tab:'due',selected:[]});
      case 'summary-accounts': return enter('accounts',{tab:'active'});
      case 'received': return enter('received',{month:s.month});
      case 'budget-settings': return enter('budget-settings',{month:s.month||todayMonth()});
      case 'money': return enter('money');
      case 'savings': return enter('savings');
      case 'form-category-open': return enter('form-categories',{owner:s,query:''});
      case 'form-category-select': {
        s.owner.values.categoryId=id;
        s.owner.fields.find(f=>f.key==='categoryId').options=categoryOptions('expense');
        return pop();
      }
      case 'form-subcategory-parent': return enter(name);
      case 'form-category-new': {
        const categoryId=uid();
        return form(id?'Новая подкатегория':'Новая категория',[text('name','Название')],{name:id?'':s.query||''},v=>commit('category.add',
          d=>addCategory(d,{id:categoryId,name:v.name.trim(),type:'expense',parentId:id||null}),()=>{
            stack.pop();
            if(state().page==='form-subcategory-parent')stack.pop();
            return action('form-category-select',categoryId);
          }));
      }
      case 'form-account': return enter('form-accounts',{owner:s,options:s.fields.find(field=>field.key==='accountId').options,accountId:s.values.accountId});
      case 'form-account-select': s.accountId=id;remember();return redraw();
      case 'form-account-next': {
        if(!s.options.some(([id])=>id===s.accountId)||currentAccount(s.accountId)?.archived)return;
        const value=String(s.owner.values.amount||'');
        const amount=validAmount(value.replace('.',','))?money(value):0;
        if(s.owner.isPayment&&budget.expenseShortfall(currentAccount(s.accountId),ledger.fact().balances[s.accountId],amount,s.owner.paymentRecord))return;
        s.owner.values.accountId=s.accountId;return pop();
      }
      case 'share-scope-month': case 'share-scope-future': return applyShareScope(s,name.endsWith('month')?'month':'future');
      case 'distribution': return openShare();
      case 'share': case 'share-detail': return openShare(id);
      case 'section-save-share': return saveShare(s);
      case 'slider-step': return form('Шаг ползунка',[choices('step','Шаг',[[1,'1%'],[5,'5%'],[10,'10%']])],
        {step:budget.budgetPreferences(doc()).step},v=>commit('budget.step',d=>budget.setBudgetPreference(d,'step',Number(v.step))));
      case 'toggle-savings': return commit('budget.savings-visibility',
        d=>budget.setBudgetPreference(d,'excludeSavings',!budget.budgetPreferences(d).excludeSavings),()=>{
          redraw();
          host.querySelector('[data-section-action=toggle-savings]')?.focus({preventScroll:true});
        });
      case 'category': case 'category-ops': return enter(name,{id});
      case 'category-type-new': return enter('category-type-picker');
      case 'category-type-create': {
        if(id==='savings')return goalForm();
        return categoryForm(null,id);
      }
      case 'category-new': return s.tab==='savings'?goalForm():categoryForm();
      case 'category-add-child': return categoryForm(id,s.tab);
      case 'category-fold':
        s.expanded=s.expanded?.includes(id)?s.expanded.filter(item=>item!==id):[...(s.expanded||[]),id];
        remember();return redraw();
      case 'subcategory-new': return categoryForm(s.id,currentCategory(s.id).type);
      case 'category-rename': {const c=currentCategory(s.id);return categoryForm(c.parentId,c.type,c);}
      case 'context-operation': {
        const c=currentCategory(s.id);
        return startOperation(c.type,{categoryId:c.id,categoryRoot:c.parentId||c.id});
      }
      case 'goal': return enter(name,{id});
      case 'goal-manage': return enter(name,{id:s.id});
      case 'closed-goal': return enter(name,{id});
      case 'goal-new': return goalForm();
      case 'goal-history': return enter(name);
      case 'goal-edit': return goalForm(budget.savings(doc()).find(g=>g.categoryId===s.id));
      case 'goal-expense': return startOperation('expense',{categoryId:s.id,categoryRoot:s.id,onSaved:pop});
      case 'goal-close': return confirm('Цель достигнута?', 'Цель появится в истории накоплений. Оставшиеся деньги снова доступны.', 'Цель достигнута',
        'savings.close',d=>budget.closeSavings(d,s.id,date()),()=>{stack.splice(-3,3,{page:'goal-history',scroll:0,error:''});redraw();});
      case 'account': case 'account-history': return enter(name,{id});
      case 'account-panel-actions': case 'account-panel-more': case 'account-panel-info': {
        const panel=name.split('-').at(-1);
        s.accountPanel=s.accountPanel===panel?'':panel;remember();return redraw();
      }
      case 'account-panel-close': {
        const node=host.querySelector('.fr-account-popover');
        if(node?.dataset.closing)return;
        if(node)node.dataset.closing='true';
        return animatePopover(node,true).then(()=>{
          if(state()!==s)return;
          if(s.page==='goal-manage')return pop();
          const panel=s.accountPanel;s.accountPanel='';remember();redraw();
          host.querySelector('[data-section-action="account-panel-'+panel+'"]')?.focus({preventScroll:true});
        });
      }
      case 'account-primary-picker': s.accountPanel='';return enter(name);
      case 'payment-refund': return refundForm(doc().operations.find(o=>o.id===s.id));
      case 'refund-original': return openExistingRecord(id);
      case 'refund-cancel': return confirm('Отменить возврат?','Остаток на счёте изменится.','Отменить возврат','operation.cancel',d=>cancelOperation(d,s.id));
      case 'refund-full': {
        s.values.amount=numeric(s.refundMax);remember();return redraw();
      }
      case 'repay-scope': {
        const {credit,months}=s.repayOptions(s.values);
        s.repayMonth=id;s.values.amount=numeric(id==='all'?credit.debt:months.get(id));remember();return redraw();
      }
      case 'opening-debt-add': {
        if(s.openingDebtCount>=100)return;
        s.openingDebtCount++;
        if(s.dynamic!=='account')s.fields=openingDebtFields(s.openingDebtCount);
        remember();return redraw();
      }
      case 'credit-periods': return enter(name,{id:s.id});
      case 'credit-opening': return openingDebtForm(currentAccount(s.id));
      case 'account-primary': return commit('account.primary',d=>budget.setPrimaryAccount(d,id||s.id),()=>{if(id)pop();else redraw();});
      case 'account-new': return newAccount();
      case 'account-transfer': return transferForm(s.id);
      case 'account-rename': return form('Название счёта',[text('name','Название')],{name:accountName(s.id)},
        v=>commit('account.rename',d=>{
          const a=d.accounts.find(a=>a.id===s.id);
          if(a.name===v.name.trim())return false;
          d.accountEdits.push({id:uid(),at:new Date().toISOString(),accountId:a.id,before:{...a}});
          rename(d,'accounts',s.id,v.name);
        }));
      case 'account-reconcile': {
        const id=uid();
        return form('Сверка остатка',[number('amount','Фактический остаток'),day('date','Дата')],
          {amount:numeric(ledger.fact().balances[s.id]),date:date()},
          v=>commit('account.reconcile',d=>reconcileAccount(d,s.id,money(v.amount),v.date,id)));
      }
      case 'account-archive': return confirm('Архивировать счёт?', 'История операций сохранится.', 'Архивировать',
        'account.archive',d=>{
          const wasPrimary=budget.primaryAccount(d)?.id===s.id;
          archive(d,'accounts',s.id);
          const replacement=wasPrimary&&budget.primaryAccount(d);
          if(replacement)budget.setPrimaryAccount(d,replacement.id);
        });
      case 'account-restore': return confirm('Восстановить счёт?', 'Счёт снова будет доступен для операций.', 'Восстановить счёт',
        'account.restore',d=>restoreAccount(d,s.id));
      case 'credit-repay': return repayCard(s.id);
      case 'credit-purchase': return startOperation('expense',{accountId:s.id});
      case 'credit-settings': return creditSettings(currentAccount(s.id));
      case 'credit-statement': return form('Сумма по выписке',[number('amount','К оплате'),day('dueDate','Срок')],{dueDate:date()},
        v=>commit('credit.statement',d=>setStatement(d,s.id,{amount:money(v.amount),dueDate:v.dueDate})));
      case 'transfer-next': return transferAmount(s,()=>{
        stack.pop();
        enter('transfer-review',{draft:s.draft,operation:s.operation,creditSource:s.creditSource,title:s.title,funding:s.funding});
      });
      case 'transfer-source': case 'transfer-target':
        if(s.funding&&name==='transfer-target')return;
        return enter('transfer-picker',{owner:s,field:name==='transfer-source'?'accountId':'toAccountId'});
      case 'transfer-pick': s.owner.draft[s.field]=id;return pop();
      case 'transfer-swap': {
        const {accountId,toAccountId}=s.draft;
        if(!accountId||!toAccountId||isCredit(currentAccount(accountId))||s.funding)return;
        Object.assign(s.draft,{accountId:toAccountId,toAccountId:accountId});
        return redraw();
      }
      case 'transfer-edit-amount': return transferAmount(s,pop);
      case 'transfer-accept':
        if(validAmount(s.buffer)){
          s.owner.draft.amount=normalizedAmount(s.buffer);
          return s.done();
        }
        return;
      case 'transfer-edit-date': return form('Дата перевода',[day('date','Дата')],s.draft,v=>{s.draft.date=v.date;pop();});
      case 'transfer-save': return saveTransfer(s);
      case 'transfer-edit': {
        const o=doc().operations.find(o=>o.id===s.id);return isCredit(currentAccount(o.toAccountId))?repayCard(o.toAccountId,o):transferForm(o.accountId,o.toAccountId,o);
      }
      case 'transfer-cancel': return confirm('Отменить перевод?', 'Остатки счетов будут пересчитаны.', 'Отменить перевод',
        'transfer.cancel',d=>cancelOperation(d,s.id),()=>{stack.pop();pop();});
      case 'normal-income': return startOperation('income',{onSaved:()=>{stack=[];exit();}});
      case 'planned-income': return enter('income-due',{month:todayMonth()});
      case 'income-plans-manage': return enter('income-plans',{month:todayMonth()});
      case 'income-show-month': s.month=id;s.scroll=0;return redraw();
      case 'income-due-pick': return receipt(incomeRow(id),true);
      case 'income-review-save': return s.save();
      case 'income-link-source': return enter(name);
      case 'income-link-source-pick': {
        const operation=linkableIncome().find(o=>o.id===id);
        if(operation)return enter('income-link-target',{operationId:id,month:operation.date.slice(0,7)});
        return;
      }
      case 'income-link-target-pick': return linkIncome(incomeRow(id),s.operationId);
      case 'income-receipt-part': case 'income-receipt-full': return s.onChoice(name==='income-receipt-full');
      case 'income-new': return incomeForm();
      case 'income-source': case 'income-occurrence': return enter(name,{id,month:s.month});
      case 'income-edit': return incomeForm(doc().planning.incomes.find(p=>p.id===s.id));
      case 'income-stop': return enter('income-stop-choice',{id:s.id});
      case 'income-stop-keep': case 'income-stop-close':
        return commit('income.archive',d=>income.stopIncomePlan(d,s.id,date(),{closePending:name==='income-stop-close'}));
      case 'income-restore': return commit('income.restore',d=>income.restoreIncomePlan(d,s.id,date()));
      case 'income-receipt': return receipt(incomeRow(s.id));
      case 'income-link-list': return enter(name,{id:s.id,month:s.month,remaining:incomeRow(s.id).remaining});
      case 'income-link': return linkIncome(incomeRow(s.id),id);
      case 'income-unlink': return confirm('Отвязать от плана?', 'Поступление, его дата и остаток счёта сохранятся. План будет пересчитан.',
        'Отвязать','income.unlink',d=>income.unlinkIncome(d,s.id,id),pop);
      case 'income-close': return confirm('Больше не ожидаю', 'Оставшаяся сумма ожидания будет закрыта.', 'Закрыть ожидание',
        'income.close',d=>income.closeIncomeOccurrence(d,s.id),pop);
      case 'payment-new': return paymentForm();
      case 'payment-calendar': s.calendar=!s.calendar;remember();return redraw();
      case 'payment-day':
        s.days??={};s.days[s.month]=s.days[s.month]===id?null:id;s.scroll=0;return redraw();
      case 'payment-plan': case 'payment-detail': case 'payment-record': return enter(name,{id});
      case 'payment-plan-edit': return paymentForm(doc().payments.plans.find(p=>p.id===s.id));
      case 'payment-pause': {
        const paused=doc().payments.plans.find(p=>p.id===s.id).pauses.some(p=>!p.to);
        return commit('payment.pause',d=>payments.setPaymentPaused(d,s.id,!paused,date()),redraw);
      }
      case 'payment-edit': return paymentForm(null,payments.paymentOccurrence(doc(),s.id));
      case 'payment-bank': return form('Результат в банке',[choices('status','Результат',[['failed','Не прошёл'],['unknown','Не знаю']])],{status:'unknown'},
        v=>commit('payment.bank',d=>payments.setBankPaymentResult(d,s.id,v.status,date())));
      case 'payment-final': case 'payment-partial': return s.onChoice(name==='payment-final');
      case 'payment-future-yes': case 'payment-future-no': return s.onChoice(name==='payment-future-yes');
      case 'pay': return paymentFact(payments.paymentOccurrence(doc(),s.id));
      case 'payment-fact-edit': {
        s.historyOpen=!!host.querySelector('details[open]');
        const o=doc().operations.find(o=>o.id===s.id);
        return paymentFact(payments.paymentLinkInfo(doc(),o.id).occurrence,o);
      }
      case 'payment-fact-cancel': return confirm('Отменить запись оплаты?', 'Остаток счёта и состояние платежа будут пересчитаны.',
        'Отменить запись оплаты','payment.cancel',d=>cancelOperation(d,s.id),()=>{
          stack.pop();stack.pop();
          if(state()?.page==='payment-detail')pop();else if(stack.length)redraw();else exit();
        });
      case 'batch-exit': s.selecting=false;s.selected=[];return redraw();
      case 'batch': return batchPayment(s);
      case 'batch-edit': return paymentForm(null,payments.paymentOccurrence(doc(),s.selected[0]));
      case 'batch-item': return batchItem(s.items[Number(id)]);
      case 'batch-save': return saveBatch(s);
    }
  }

  function batchPayment(s) {
    if (!s.selected.length) return;
    const items=s.selected.map(occurrenceId=>{
      const row=payments.paymentOccurrence(doc(),occurrenceId);
      return {id:uid(),row,values:{amount:numeric(row.remaining),date:date(),accountId:row.accountId},reviewed:false};
    });
    enter('batch-review',{items,owner:s});
  }
  function batchItem(item) {
    const {row}=item;
    const finish=(v,final,changeFuture,depth)=>{
      item.values=v;item.final=final;item.changeFuture=changeFuture;item.reviewed=true;
      stack.splice(-depth);redraw();
    };
    form(row.name,[number('amount','Сумма оплаты'),day('date','Дата оплаты'),
      choices('accountId','Счёт',accountOptions(a=>!isCredit(a)))],item.values,v=>{
      const amount=asAmount(v.amount);
      if(v.date>date())fail('PAYMENT_DATE');
      const total=row.paid+amount;
      enter('payment-completion',{plan:row.amount,total,partial:total<row.amount,onChoice:final=>{
        if(final&&row.amountMode==='fixed'&&total!==row.amount){
          enter('payment-future',{onChoice:change=>finish(v,true,change,3)});
        }else finish(v,final,false,2);
      }});
    },{submitLabel:'Далее'});
  }
  function saveBatch(s) {
    const entries=s.items.map(({id,row,values,final})=>({
      occurrenceId:row.id,input:amountEntry(id,'expense',values,row.categoryId),final
    }));
    return commit('payment.batch',d=>{
      const recorded=payments.confirmPayments(d,entries,date());
      if(recorded)for(const item of s.items.filter(item=>item.changeFuture)){
        const end=new Date(budget.monthEnd(item.row.originalDate.slice(0,7))+'T00:00:00Z');
        end.setUTCDate(end.getUTCDate()+1);
        payments.changePaymentFuture(d,item.row.id,{amount:item.row.paid+money(item.values.amount)},end.toISOString().slice(0,10),date());
      }
      return recorded;
    },()=>{s.owner.selecting=false;s.owner.selected=[];pop();});
  }



  function layoutCategoryIsland(island) {
    if(!island)return;
    const tabs=[...island.querySelectorAll('[data-category-slide]')];
    const active=categoryTypes.findIndex(([id])=>id===state().tab);
    island.setAttribute('aria-valuenow',String(active+1));
    island.setAttribute('aria-valuetext',categoryTypes[active][1]);
    const width=island.clientWidth;
    tabs.forEach((tab,index)=>{
      const step=index-active;
      const position=step?Math.sign(step)*(width/2+tab.offsetWidth/2-26+(Math.abs(step)-1)*width):0;
      tab.toggleAttribute('data-current',!step);
      tab.style.setProperty('--slide',position+'px');
    });
    island.style.setProperty('--highlight',tabs[active].offsetWidth+34+'px');
  }
  function stepCategory(island,step){
    const s=state();
    const next=categoryTypes[categoryTypes.findIndex(([id])=>id===s.tab)+step]?.[0];
    if(!next)return;
    s.tabScroll??={};
    s.tabScroll[s.tab]=scroll().scrollTop;
    s.tab=next;
    s.expanded=[];
    host.querySelector('[data-section-results]').innerHTML=categoryResults(s);
    scroll().scrollTop=s.tabScroll[next]||0;
    layoutCategoryIsland(island);
  }
  let categorySlide;
  host.addEventListener('pointerdown',event=>{
    const island=event.target.closest('.fr-category-carousel');
    if(!island||!event.isPrimary||event.button!==0)return;
    categorySlide={id:event.pointerId,x:event.clientX,y:event.clientY,drift:0,island};
    island.setPointerCapture(event.pointerId);
    island.classList.add('is-dragging');
  });
  host.addEventListener('pointermove',event=>{
    if(categorySlide?.id!==event.pointerId)return;
    const {island,x,y}=categorySlide;
    const dx=event.clientX-x;
    categorySlide.drift=Math.max(categorySlide.drift,Math.hypot(dx,event.clientY-y));
    const i=categoryTypes.findIndex(([id])=>id===state().tab);
    const edge=dx>0?i===0:i===categoryTypes.length-1;
    island.style.setProperty('--drag',Math.max(-96,Math.min(96,dx*(edge ? 0.2 : 0.78)))+'px');
  });
  function endCategorySlide(event){
    if(categorySlide?.id!==event.pointerId)return;
    const {island,x,y,drift}=categorySlide;
    categorySlide=null;
    island.classList.remove('is-dragging');
    island.style.removeProperty('--drag');
    if(event.type!=='pointerup')return;
    const dx=event.clientX-x,dy=event.clientY-y;
    if(Math.abs(dx)>=27&&Math.abs(dx)>=Math.abs(dy))return stepCategory(island,dx<0?1:-1);
    if(drift>9||Math.hypot(dx,dy)>9)return;
    const highlight=island.querySelector('.fr-category-carousel-highlight').getBoundingClientRect();
    if(x<highlight.left)stepCategory(island,-1);
    else if(x>highlight.right)stepCategory(island,1);
  }
  host.addEventListener('pointerup',endCategorySlide);
  host.addEventListener('pointercancel',endCategorySlide);
  host.addEventListener('keydown',event=>{
    const island=event.target.closest('.fr-category-carousel');
    if(!island||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    stepCategory(island,event.key==='ArrowRight'?1:-1);
  });
  function positionAccountPopover(panel){
    if(panel==='more')return;
    const popover=host.querySelector('.fr-account-popover');
    const anchor=host.querySelector(panel==='goal'?'[data-section-action=goal-manage]':'[data-section-action="account-panel-'+panel+'"]');
    const screen=popover?.closest('.fr-screen');
    if(!anchor||!screen)return;
    const screenBox=screen.getBoundingClientRect(), anchorBox=anchor.getBoundingClientRect();
    popover.style.top=(anchorBox.bottom-screenBox.top+6)+'px';
    popover.style.right=Math.max(12,screenBox.right-anchorBox.right)+'px';
    popover.style.maxHeight=(screenBox.bottom-anchorBox.bottom-18)+'px';
  }
  function fitAccountContent(){
    const body=host.querySelector('.fr-account-static .np-body');
    if(!body)return;
    const list=body.querySelector('.fr-account-recent, .fr-account-periods');
    if(!list)return;
    const rows=[...list.children], more=body.querySelector('[data-section-action=credit-periods]');
    rows.forEach(row=>row.hidden=false);
    if(more)more.hidden=true;
    let bottom=body.getBoundingClientRect().bottom-6;
    if(more&&list.getBoundingClientRect().bottom>bottom){
      more.hidden=false;
      bottom-=more.getBoundingClientRect().height+8;
    }
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      const group=row.classList.contains('fr-operation-date');
      const last=group&&rows[i+1]?rows[i+1]:row;
      if(last.getBoundingClientRect().bottom<=bottom)continue;
      rows.slice(i).forEach(item=>item.hidden=true);
      break;
    }
  }
  new ResizeObserver(()=>{
    layoutCategoryIsland(host.querySelector('.fr-category-carousel'));
    fitAccountContent();
  }).observe(host);

  let hold;
  const clearHold=()=>{clearTimeout(hold?.timer);hold=null;};
  host.addEventListener('pointerdown',event=>{
    if (state()?.page!=='payments'||state().tab!=='due'||!event.target.closest('[data-section-action=payment-detail]')) return;
    const id=event.target.closest('[data-id]').dataset.id;
    const s=state();
    clearHold();
    hold={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
      s.selecting=true;
      if (!s.selected.includes(id)) s.selected.push(id);
      remember();redraw();
    },480)};
  });
  host.addEventListener('pointermove',event=>{
    if (hold&&Math.hypot(hold.x-event.clientX,hold.y-event.clientY)>10) clearHold();
  });
  host.addEventListener('pointerup',event=>{
    clearHold();
  });
  host.addEventListener('pointerleave',clearHold);
  host.addEventListener('pointercancel',clearHold);
  host.addEventListener('contextmenu',event=>{
    if(state()?.page==='payments'&&event.target.closest('.fr-due-row'))event.preventDefault();
  });
  function paymentCategoryRows(s){
    return categoryRows(doc(),'expense',s.owner.values.categoryId,s.query)
      .replaceAll('data-category=','data-section-action="form-category-select" data-id=')
      .replaceAll('data-action="category-create-menu"','data-section-action="form-category-new"');
  }
  host.addEventListener('input',event=>{
    if (!event.target.closest('[data-section-page]')||!state()) return;
    const input=event.target,s=state();
    if(input.matches('[data-payment-category-search]')){
      s.query=input.value;
      host.querySelector('[data-payment-category-results]').innerHTML=paymentCategoryRows(s);
      return;
    }
    if (input.matches('[data-section-search]')) {
      s.query=input.value;
      host.querySelector('[data-section-results]').innerHTML=categoryResults(s);
    }
    if(input.matches('[data-batch]')){
      s.selected=s.selected.filter(id=>id!==input.dataset.batch);
      if(input.checked)s.selected.push(input.dataset.batch);
      remember();redraw();return;
    }
    if (input.matches('[data-share-input],[data-share-slider]')) {
      if (input.matches('[data-share-input]')) input.value=input.value.replace(/[^\d,.]/g,'');
      s.values[input.dataset.id]=input.value;
      const selector=input.matches('[data-share-input]')?'[data-share-slider]':'[data-share-input]';
      input.closest('.fr-share-panel').querySelector(selector).value=selector==='[data-share-slider]'?
        Number(input.value.replace(',','.'))||0:input.value;
      updateShare(s);
    }
    if (s.page!=='form'||!input.name) return;
    if (input.matches('[data-decimal]')) {
      const signed=input.name==='opening'&&s.values.kind==='credit';
      input.value=input.value.replace(signed?/[^\d,.-]/g:/[^\d,.]/g,'');
    }
    s.values[input.name]=input.type==='checkbox'?input.checked:input.type==='file'?input.files[0]:input.value;
    if(input.name.startsWith('debtAmount'))host.querySelector('[data-opening-total] .np-money').textContent=amountText(readOpeningDebtsForPreview(s.values,s.openingDebtCount));
    if(s.dynamic==='credit-repay'&&input.name==='date'&&input.validity.valid){
      const {months}=s.repayOptions(s.values);
      if(s.repayMonth!=='all'&&!months.has(s.repayMonth))s.repayMonth='all';
      remember();redraw();return;
    }
    if ((s.dynamic==='account'&&['kind','mode'].includes(input.name))||(s.dynamic==='income'&&input.name==='repeat')){
      remember();redraw();host.querySelector(`[data-select-trigger="${input.name}"]`)?.focus({preventScroll:true});
    }
  });
  host.addEventListener('submit',event=>{
    if (!event.target.matches('[data-section-form]')) return;
    event.preventDefault();
    if (busy) return;
    const s=state();
    try {
      if(s.fields.some(field=>field.type==='account-picker')&&(!s.values.accountId||draftReceiptAccount(s.values.accountId)!==s.values.accountId))fail('SELECTION');
      if(s.fields.some(f=>f.type==='category-picker'&&!s.values[f.key])){s.error='Выберите категорию.';remember();return redraw();}
      s.save(s.values);
    } catch(error) {s.error=errors[error.code]||'Проверьте введённые данные.';remember();redraw();}
  });
  function openExistingRecord(id) {
    if (state()?.page==='closed-goal') state().expanded=host.querySelector('[data-closed-expenses]')?.open;
    const op=doc().operations.find(o=>o.id===id);
    if (!op) return;
    if (['transfer','adjustment','refund'].includes(op.kind)) {
      return enter(op.kind==='transfer'?'transfer-record':op.kind,{id});
    }
    if (payments.paymentLinkInfo(doc(),id)) return enter('payment-record',{id});
    remember();
    openOperation(id);
  }
  return {
    open(page,props={}) {
      if (page==='transfer') return transferForm();
      enter(page,{month:todayMonth(),query:'',tab:page==='categories'?'expense':'due',selected:[],...props});
    },
    openRecord:openExistingRecord,
    refundForm,
    fundExpense:(id,amount,done)=>transferForm('',id,null,{amount,done}),
    newAccount,
    busy:()=>busy,
    dirty:()=>stack.some(dirty),
    key(key) {
      const s=state();
      if(s?.page!=='transfer-amount')return;
      s.buffer=editAmount(s.buffer,key);
      const output=host.querySelector('output');
      output.textContent=enteredMoney(s.buffer);
      output.classList.toggle('fr-empty',!s.buffer);
      host.querySelector('[data-action=transfer-accept]').disabled=!validAmount(s.buffer);
    },
    render, back, action, remember,
    restore() {
      if (scroll()) scroll().scrollTop=state().scroll;
      if (['distribution','share-detail'].includes(state().page)) updateShare(state());
      if (state().page==='summary') restoreSummaryMore(state());
      layoutCategoryIsland(host.querySelector('.fr-category-carousel'));
      fitAccountContent();
      const popover=host.querySelector('.fr-account-popover');
      if(popover){
        const key=state().accountPanel;
        positionAccountPopover(key||'goal');
        pressFeedback(host.querySelector(key?'[data-section-action="account-panel-'+key+'"]':'[data-section-action=goal-manage]'));
        animatePopover(popover);
        const layer=popover.parentElement;
        for(const element of layer.parentElement.children)if(element!==layer)element.inert=true;
        (popover.querySelector('button')||popover).focus({preventScroll:true});
      }
    }
  };
}
