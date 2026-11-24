import {spendingRoom, isCredit} from './engine/credit.mjs';
import {editAmount,normalizedAmount,validAmount} from './amount-pad.mjs';
import {bindUpdate} from './update.mjs';
import * as ledger from './ledger.mjs';
import {createSections} from './section-controller.mjs';
import {recordHistory, recordRows, field} from './sections.mjs';
import * as screen from './screens.mjs';
import {categoryRoot as rootCategory, monthlyOverview,primaryAccount,expenseShortfall} from './engine/month-budget.mjs';
import {localDate,refundRemaining} from './engine/operations.mjs';
import {money,uid} from './engine/model.mjs';
import {bindMenuGlyph,bindTrack} from './motion.mjs';

const root=document.querySelector('#finrate');
const host=root.querySelector('.fr-route-host');
const menuButton=root.querySelector('.fr-persistent-menu');
const updateMenu=bindMenuGlyph(menuButton);
const parseMonth=date=>{const [year,month]=date.slice(0,7).split('-').map(Number);return new Date(year,month-1,15,12);};
let route='home', menuGroup=null, menuScroll=0, draft=null, previous=null, initial=null, origin='home', originScroll=0, editing=false;
let buffer='', query='', operationQuery='', categoryForm=null, showCreate=false;
let calendar=parseMonth(localDate());
let onOperationSaved;
let sectionParent='home', sectionScroll=0, categoryRoot='', fixedAccount='';
let operationFilters={}, pendingFilters={}, filterQuery='', filterScroll=0;
let note='', error='', busy=false, leave=null, accountChoice='';

const doc=ledger.document;
const listNode=()=>host.querySelector('.fr-operation-list,.np-body');
function move(to) { route=to;render(); }
function resetDraft(){onOperationSaved=null;categoryRoot='';fixedAccount='';accountChoice='';draft=null;previous=null;initial=null;editing=false;error='';leave=null;}
const sectionRoutes=new Set(['summary','accounts','categories','transfer','payments','income-plans','savings','budget-settings','data-management']);
const sections=createSections(host,{
  redraw:()=>move('section'),
  exit:()=>{
    move(sectionParent);
    if(listNode())listNode().scrollTop=sectionScroll;
  },
  startOperation:(kind,context)=>{sections.remember();start(kind,context);},
  openOperation:id=>openRecord(id)
});
function openSection(page) {
  sectionParent=route;
  sectionScroll=listNode()?.scrollTop||0;
  sections.open(page);
}
function selectRecord(id) {
  const item=doc().operations.find(o=>o.id===id);
  if(!item)return;
  if(route==='section')return sections.openRecord(id);
  if(['transfer','adjustment','refund'].includes(item.kind)||doc().payments?.links.some(l=>l.operationId===id)){
    sectionParent=route;
    sectionScroll=listNode()?.scrollTop||0;
    return sections.openRecord(id);
  }
  return openRecord(id);
}
const isDirty=()=>JSON.stringify(draft)!==initial;
function start(kind,context={}){
  resetDraft();
  origin=route;originScroll=listNode()?.scrollTop||0;
  onOperationSaved=context.onSaved;
  categoryRoot=context.categoryRoot||'';fixedAccount=context.accountId||'';
  draft={id:uid(),kind,amount:'',categoryId:context.categoryId||'',date:localDate(),accountId:fixedAccount||primaryAccount(doc())?.id||'',note:'',creditDueDate:''};
  initial=JSON.stringify(draft);buffer='';move('amount');
}
function operationsScreen(){
  const active=Object.values(operationFilters).filter(Boolean).length;
  return screen.heading('Операции')+`<div class="fr-toolbar"><input type="search" class="fr-payment-actions-input" data-search-operation
    aria-label="Поиск по категории, подкатегории, счёту или заметке" placeholder="Поиск" value="${screen.esc(operationQuery)}">
    <button type="button" class="fr-filter-button" data-action="filter-open" aria-label="Фильтры${active?' · '+active:''}"><span>Фильтры</span>${active?`<span class="fr-filter-count" aria-hidden="true">${active}</span>`:''}</button></div>
    <div class="fr-operation-list" data-operation-results>${recordRows(doc(),doc().operations,operationQuery,operationFilters)}</div>`;
}
function filterScreen(){
  const all=['','Все'];
  const fields=[
    {key:'kind',label:'Тип',options:[all,['expense','Расход'],['income','Доход'],['refund','Возврат'],['transfer','Перевод'],['adjustment','Корректировка']]},
    {key:'account',label:'Счёт',options:[all,...doc().accounts.map(a=>[a.id,a.name])]},
    {key:'from',label:'С даты',type:'date',required:false},
    {key:'to',label:'По дату',type:'date',required:false}
  ];
  const selected=doc().categories.find(c=>c.id===pendingFilters.category);
  const canPick=!pendingFilters.kind||['income','expense'].includes(pendingFilters.kind);
  return screen.heading('Фильтры')+`<div class="np-body fr-filters-body">
    ${fields.slice(0,2).map(f=>field({...f,required:false},pendingFilters[f.key])).join('')}
    <div class="fr-section-field"><span>Категория</span><button class="fr-section-secondary" type="button"
      data-action="filter-category" ${canPick?'':'disabled'}>${screen.esc(selected?.name||'Все категории')}</button></div>
    ${fields.slice(2).map(f=>field(f,pendingFilters[f.key])).join('')}
    <p role="alert" class="fr-create-error">${screen.esc(error)}</p></div>
    <div class="fr-filter-actions"><button type="button" class="fr-section-secondary" data-action="filter-reset">Сбросить</button>
    <button type="button" class="fr-primary" data-action="filter-apply">Показать</button></div>`;
}
function filterCategories(){
  const q=filterQuery.trim().toLocaleLowerCase('ru');
  const options=(c,child=false)=>`<button type="button" class="fr-operation-picker-choice ${child?'fr-operation-picker-child':''}"
    data-filter-id="${screen.esc(c.id)}" aria-pressed="${c.id===pendingFilters.category}">${screen.esc(c.name)}</button>`;
  return ['expense','income'].filter(kind=>!pendingFilters.kind||kind===pendingFilters.kind).map(kind=>{
    const categories=doc().categories.filter(c=>c.type===kind);
    return categories.filter(c=>!c.parentId).map(c=>{
      const parentMatch=c.name.toLocaleLowerCase('ru').includes(q);
      const children=categories.filter(child=>child.parentId===c.id&&(parentMatch||child.name.toLocaleLowerCase('ru').includes(q)));
      return parentMatch||children.length?options(c)+children.map(c=>options(c,true)).join(''):'';
    }).join('');
  }).join('')||'<p class="fr-no-operations">Категории не найдены.</p>';
}
function returnToOperations(){
  error='';move('operations');listNode().scrollTop=filterScroll;
}
function openRecord(id){
  const item=doc().operations.find(o=>o.id===id);
  if(!item)return;
  resetDraft();
  previous=item;origin=route;originScroll=listNode()?.scrollTop||0;
  draft={id:item.id,kind:item.kind,amount:String(item.amount/100).replace('.',','),categoryId:item.allocations[0]?.categoryId,
    date:item.date,accountId:item.accountId,note:item.note,creditDueDate:item.creditDueDate||''};
  initial=JSON.stringify(draft);move('review');
}
function finish(){
  const to=origin,scroll=originScroll;
  busy=false;
  resetDraft();move(to);
  const list=listNode();if(list)list.scrollTop=scroll;
}

function openCategory(){query='';showCreate=false;move('category');}
function openCalendar(){calendar=parseMonth(draft.date);move('date');}
function selectedCategory(id){
  draft.categoryId=id;
  if(editing)showReview();else openCalendar();
}
function showReview(){editing=false;move('review');}
function openAccountSelection(){
  accountChoice=draft.accountId;
  move('account');
}
function selectedAccountWarning(){
  if(draft.kind!=='expense'||!accountChoice)return {};
  const d=doc(),account=d.accounts.find(a=>a.id===accountChoice&&!a.archived), balances=ledger.fact().balances;
  const shortfall=isCredit(account)?Math.max(0,money(draft.amount)-spendingRoom(previous?.accountId===accountChoice?
    {...d,operations:d.operations.filter(o=>o.id!==previous.id)}:d,accountChoice)):expenseShortfall(account,balances[accountChoice],money(draft.amount),previous);
  const transfer=shortfall>0&&account?.financeType!=='credit'&&d.accounts.some(a=>!a.archived&&a.financeType!=='credit'&&
    a.id!==accountChoice&&balances[a.id]>0);
  return {shortfall,transfer};
}
function chooseAccount(id){
  if(draft.accountId!==id) draft.creditDueDate='';
  draft.accountId=id;
  const account=doc().accounts.find(a=>a.id===id);
  if(draft.kind==='expense'&&account?.credit?.grace.mode==='statement'&&!draft.creditDueDate){
    calendar=parseMonth(draft.date);
    return move('credit-date');
  }
  return showReview();
}
function getLeave(onDiscard){
  leave={from:route,onDiscard};move('unsaved');
}
function back(){
  if(busy)return;
  switch(route){
    case 'home': return;
    case 'menu': return move('home');
    case 'section': return sections.back();
    case 'operations': return move('menu');
    case 'filters': return returnToOperations();
    case 'filter-picker': return move('filters');
    case 'history': case 'cancel': return showReview();
    case 'unsaved': {const from=leave.from;leave=null;return move(from);}
    case 'amount':
      if(editing)return showReview();
      if(isDirty()||buffer)return getLeave(finish);
      return finish();
    case 'category':
      if(showCreate){showCreate=false;return render();}
      if(editing)return showReview();
      buffer=draft.amount;return move('amount');
    case 'date':
      if(editing)return showReview();
      return openCategory();
    case 'credit-date': return editing?showReview():fixedAccount?openCalendar():openAccountSelection();
    case 'account':
      if(editing)return showReview();
      return openCalendar();
    case 'review':
      if(previous&&isDirty())return getLeave(finish);
      if(previous)return finish();
      return fixedAccount?openCalendar():openAccountSelection();
    case 'note':
      if(note!==draft.note&&!previous?.cancelled)return getLeave(showReview);
      return showReview();
    case 'category-new':
      if(categoryForm.name.trim()&&categoryForm.name!==categoryForm.initial)return getLeave(()=>move('category'));
      return move('category');
  }
}

function edit(field){
  if(previous&&doc().accounts.some(a=>a.id===previous.accountId&&a.archived)&&field!=='note')return;
  if(previous?.cancelled&&field!=='note'||field==='account'&&fixedAccount)return;
  editing=true;error='';
  if(field==='amount'){buffer=draft.amount;move('amount');}
  if(field==='date')openCalendar();
  if(field==='category')openCategory();
  if(field==='account'&&!fixedAccount)openAccountSelection();
  if(field==='credit-date'){calendar=parseMonth(draft.creditDueDate||draft.date);move('credit-date');}
  if(field==='note'){note=draft.note;move('note');}
}

function enterKey(key){
  if(route==='section')return sections.key(key);
  buffer=editAmount(buffer,key);
  const output=host.querySelector('output');
  output.textContent=screen.enteredMoney(buffer);
  output.classList.toggle('fr-empty',!buffer);
  host.querySelector('[data-action=next]').disabled=!validAmount(buffer);
}

async function save(){
  if(busy||previous?.cancelled)return;
  busy=true;error='';render();
  try{
    await ledger.save(draft,previous);
    if(!onOperationSaved)return finish();
    const done=onOperationSaved;
    busy=false;
    resetDraft();
    return done();
  }
  catch(cause){
    error={
      REFUND_LINKED:'Сначала отмените связанный возврат.',
      CREDIT_DUE:'Проверьте срок погашения. Он не может быть раньше даты покупки.',
      CREDIT_LIMIT:'На выбранном счёте недостаточно средств.',
      INSUFFICIENT_FUNDS:'На выбранном счёте недостаточно средств.',
      STALE:'Данные изменились в другой вкладке. Откройте приложение заново.',
      EDIT_STALE:'Запись изменилась. Откройте её заново.',
      STORAGE_QUOTA_ABORTED:'Недостаточно места на устройстве. Операция не записана.'
    }[cause.code]||'Не удалось сохранить. Проверьте сумму, дату и счёт.';
    busy=false;
    if(['CREDIT_LIMIT','INSUFFICIENT_FUNDS'].includes(cause.code)&&!fixedAccount){editing=true;return openAccountSelection();}
    render();
  }
}
async function cancel(){
  if(busy)return;
  busy=true;error='';render();
  try{await ledger.cancel(previous.id);return finish();}
  catch(cause){
    error={
      STALE:'Данные изменились в другой вкладке. Откройте приложение заново.',
      REFUND_LINKED:'Сначала отмените возврат по этой операции.',
      FEE_LINKED:'Отмените перевод, чтобы отменить его комиссию.',
      INSUFFICIENT_FUNDS:'Отмена приведёт к недостатку средств на счёте.',
      CREDIT_LIMIT:'Отмена привела бы к превышению кредитного лимита.'
    }[cause.code]||'Не удалось отменить операцию. Попробуйте ещё раз.';
    busy=false;
    render();
  }
}
async function createCategory(){
  if(busy||!categoryForm.name.trim())return;
  busy=true;
  const {name,parentId}=categoryForm,id=uid();
  try{
    await ledger.addOperationCategory({id,name:name.trim(),type:draft.kind,parentId:parentId||null});
    busy=false;
    if(!parentId){
      categoryForm={sub:true,name:'',initial:'',parentId:id,error:''};
      return render();
    }
    selectedCategory(id);
  }catch(cause){
    categoryForm.error=cause.code==='NAME_EXISTS'?'Такое название уже есть.':'Не удалось создать категорию.';
    busy=false;render();
  }
}

function action(id){
  if(busy)return;
  if(sectionRoutes.has(id))return openSection(id);
  switch(id){
    case 'back': return back();
    case 'operations': return move(id);
    case 'filter-open':
      filterScroll=listNode().scrollTop;pendingFilters={...operationFilters};error='';return move('filters');
    case 'filter-reset':
      pendingFilters={};error='';return render();
    case 'filter-apply':
      if(pendingFilters.from&&pendingFilters.to&&pendingFilters.from>pendingFilters.to){
        error='Начальная дата позже конечной.';return render();
      }
      operationFilters={...pendingFilters};filterScroll=0;return returnToOperations();
    case 'filter-category':
      filterQuery='';return move('filter-picker');
    case 'section-save-share': case 'transfer-accept': return sections.action(id);
    case 'account-next':
      if(route!=='account'||selectedAccountWarning().shortfall||
        !doc().accounts.some(a=>a.id===accountChoice&&!a.archived&&(draft.kind!=='income'||a.financeType!=='credit')))return;
      return chooseAccount(accountChoice);
    case 'fund-expense': {
      const warning=selectedAccountWarning();
      if(route==='account'&&warning.transfer)sections.fundExpense(accountChoice,warning.shortfall,()=>move('account'));
      return;
    }
    case 'month-result-info': {
      const dialog=host.querySelector('.fr-info-dialog');
      const trigger=host.querySelector('[data-action=month-result-info]');
      if(!dialog||dialog.open)return;
      let start=null;
      dialog.onpointerdown=event=>{start=event.target===dialog?[event.clientX,event.clientY]:null;};
      dialog.onpointercancel=()=>{start=null;};
      dialog.onpointerup=event=>{
        const moved=start&&Math.hypot(event.clientX-start[0],event.clientY-start[1])>24;
        start=null;
        if(moved&&event.target===dialog)setTimeout(()=>{if(dialog.open)dialog.close();},300);
      };
      dialog.onclick=event=>{if(event.target===dialog){event.stopPropagation();dialog.close();}};
      dialog.addEventListener('close',()=>trigger.blur(),{once:true});
      dialog.showModal();
      const anchor=trigger.getBoundingClientRect(), width=dialog.offsetWidth;
      dialog.style.top=(anchor.bottom+6)+'px';
      dialog.style.left=Math.max(12,Math.min(anchor.right-width,document.documentElement.clientWidth-width-12))+'px';
      return;
    }
    case 'first-account':
      return sections.newAccount({
        kind:draft.kind,
        exit:()=>move('account'),
        created:id=>{accountChoice=id;move('account');}
      });
    case 'refund': {
      if(isDirty()){error='Сначала сохраните изменения расхода.';return render();}
      const scroll=host.querySelector('.fr-review-body')?.scrollTop||0;
      return sections.refundForm(previous,()=>{move('review');host.querySelector('.fr-review-body').scrollTop=scroll;});
    }
    case 'next':
      if(!validAmount(buffer))return;
      draft.amount=normalizedAmount(buffer);
      if(editing)return showReview();
      return openCategory();
    case 'save': return void save();
    case 'accept-note':
      if(note.length<=500&&!previous?.cancelled)draft.note=note;
      return showReview();
    case 'category-create-menu': showCreate=!showCreate;return render();
    case 'new-category': case 'new-subcategory':
      categoryForm={sub:id==='new-subcategory',name:query.trim(),initial:'',parentId:categoryRoot,error:''};
      showCreate=false;return move('category-new');
    case 'save-category': return void createCategory();
    case 'stay': return back();
    case 'discard': {const discard=leave.onDiscard;leave=null;return discard();}
    case 'cancel': error='';return move('cancel');
    case 'cancel-confirm': return void cancel();
    case 'history': return move('history');
  }
}

function render(){
  const oldMenu=host.querySelector('#fr-menu-panel');
  if(oldMenu)menuScroll=oldMenu.scrollTop;
  updateMenu(route);
  root.dataset.route=route;
  let markup;
  switch(route){
    case 'home': markup=screen.home();break;
    case 'menu': markup=screen.menu(menuGroup);break;
    case 'amount':
      markup=screen.keypad(draft.kind,buffer,validAmount(buffer));
      break;
    case 'category': markup=screen.categoryPicker(doc(),draft,query,showCreate,categoryRoot,money(draft.amount),previous);break;
    case 'category-new':
      markup=screen.createCategoryScreen(categoryForm,doc().categories.filter(c=>c.type===draft.kind&&!c.parentId&&!c.archived&&!c.mergedInto));break;
    case 'date': markup=screen.calendar(draft.kind,calendar.getFullYear(),calendar.getMonth(),draft.date,localDate());break;
    case 'credit-date': markup=screen.calendar(draft.kind,calendar.getFullYear(),calendar.getMonth(),draft.creditDueDate,localDate(),'Срок погашения');break;
    case 'account':
      markup=screen.accounts(doc(),ledger.fact().balances,accountChoice,draft.kind,selectedAccountWarning());break;
    case 'review': {
      const rootId=rootCategory(doc(),draft.categoryId);
      const category=draft.kind==='expense'&&monthlyOverview(doc(),draft.date.slice(0,7)).categories.find(c=>c.id===rootId);
      const alreadyCounted=previous?.date.startsWith(draft.date.slice(0,7))?previous.allocations
        .filter(a=>rootCategory(doc(),a.categoryId)===rootId).reduce((sum,a)=>sum+a.amount,0):0;
      const over=category&&category.spent-alreadyCounted+money(draft.amount)>category.plan;
      markup=screen.review(doc(),draft,previous,isDirty(),error,busy,over?category.name:'',
        doc().accounts.some(a=>a.id===previous?.accountId&&a.archived),
        previous?.kind==='expense'&&!previous.cancelled&&!previous.referenceId&&refundRemaining(doc(),previous.id).some(x=>x.amount>0));
      break;
    }
    case 'note': markup=screen.noteScreen(note,previous?.cancelled||doc().accounts.some(a=>a.id===previous?.accountId&&a.archived));break;
    case 'operations': markup=operationsScreen();break;
    case 'filters': markup=filterScreen();break;
    case 'filter-picker':
      markup=screen.heading('Категория')+
        `<div class="fr-payment-actions-search"><input type="search" data-filter-search aria-label="Поиск категории" placeholder="Поиск"
        value="${screen.esc(filterQuery)}"></div><div class="fr-payment-actions-list">
        <button type="button" class="fr-operation-picker-choice" data-filter-id="">Все категории</button>
        <div data-filter-results>${filterCategories()}</div></div>`;
      break;
    case 'section': markup=sections.render();break;
    case 'unsaved': markup=screen.unsaved();break;
    case 'cancel': {
      const balance=ledger.fact().balances[previous.accountId]-previous.amount;
      const message=previous.kind==='income'&&!previous.pending&&balance<0
        ? 'После отмены остаток на счёте станет отрицательным: '+screen.amountText(balance)+'.'
        : 'Остаток на счёте изменится.';
      markup=screen.heading('Отменить операцию?')+
      `<div class="fr-unsaved-content"><p class="fr-unsaved-message">${screen.esc(message)}</p><div class="fr-unsaved-actions"><button type="button" class="fr-primary fr-cancel-confirm" data-action="cancel-confirm" ${busy?'disabled':''}>Отменить операцию</button><button type="button" class="fr-unsaved-discard" data-action="back" ${busy?'disabled':''}>Оставить операцию</button></div><p role="alert">${screen.esc(error)}</p></div>`;break;
    }
    case 'history':
      markup=screen.heading('История изменений')+`<div class="np-body">${recordHistory(doc(),previous)}</div>`;break;
  }
  host.innerHTML=`<section class="fr-screen" data-screen="${route}" ${route==='section'?'data-section-page':''}>${markup}</section>`;
  if(route==='section')sections.restore();
  if(route==='home')bindTrack(host.querySelector('.fr-track'),kind=>{
    if(kind==='income')return openSection('income-choice');
    start(kind);
  });
  if(route==='menu')host.querySelector('#fr-menu-panel').scrollTop=menuScroll;
}

function monthChange(delta){
  const date=calendar;
  const next=new Date(date.getFullYear(),date.getMonth()+delta,15,12);
  if(next.getFullYear()<100||next.getFullYear()>9999)return;
  calendar=next;
  render();
  host.querySelector(`[data-month="${delta}"]`)?.focus({preventScroll:true});
}

host.addEventListener('click',event=>{
  if(busy)return;
  const summary=event.target.closest('summary');
  if(summary&&route==='menu'){
    event.preventDefault();
    const group=summary.parentElement;
    menuGroup=group.open?null:group.dataset.menuGroup;
    host.querySelectorAll('details').forEach(detail=>{detail.open=detail.dataset.menuGroup===menuGroup;});
    return;
  }
  const label=event.target.closest('[data-full-name]');
  if(label&&label.scrollWidth>label.clientWidth&&!label.classList.contains('fr-full-name')){
    label.classList.add('fr-full-name');
    return;
  }
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const data=button.dataset;
  if(data.filterId!==undefined){pendingFilters.category=data.filterId;return move('filters');}
  if(data.sectionAction)return sections.action(data.sectionAction,data.id);
  if(data.action)return action(data.action);
  if(data.edit)return edit(data.edit);
  if(data.key)return enterKey(data.key);
  if(data.category)return selectedCategory(data.category);
  if(data.parent){categoryForm.parentId=data.parent;return render();}
  if(data.month)return monthChange(Number(data.month));
  if(data.date){
    if(route==='credit-date'){draft.creditDueDate=data.date;return showReview();}
    draft.date=data.date;
    return editing?showReview():fixedAccount?chooseAccount(fixedAccount):openAccountSelection();
  }
  if(data.account&&route==='account'){accountChoice=data.account;return render();}
  if(data.operation)return selectRecord(data.operation);
});
host.addEventListener('input',event=>{
  const input=event.target;
  if(input.hasAttribute('data-search-category')){
    query=input.value;
    host.querySelector('[data-category-results]').innerHTML=screen.categoryRows(doc(),draft.kind,draft.categoryId,query,categoryRoot,draft.date,money(draft.amount),previous);
  }
  if(input.hasAttribute('data-search-operation')){
    operationQuery=input.value;
    host.querySelector('[data-operation-results]').innerHTML=recordRows(doc(),doc().operations,operationQuery,operationFilters);
  }
  if(route==='filters'&&input.name){
    pendingFilters[input.name]=input.value;
    if(input.name==='kind'){
      if(input.value&&doc().categories.find(c=>c.id===pendingFilters.category)?.type!==input.value)delete pendingFilters.category;
      render();host.querySelector('[name=kind]').focus({preventScroll:true});
    }
  }
  if(input.matches('[data-filter-search]')){
    filterQuery=input.value;
    host.querySelector('[data-filter-results]').innerHTML=filterCategories();
  }
  if(input.hasAttribute('data-name')){
    categoryForm.name=input.value;
    host.querySelector('[data-action=save-category]').disabled=!input.value.trim();
  }
  if(input.matches('textarea')){
    note=input.value;
    const count=host.querySelector('.fr-note-count');
    count.textContent=note.length+' / 500';
    count.classList.toggle('fr-over-limit',note.length>500);
    host.querySelector('[data-action=accept-note]').disabled=note.length>500;
  }
});
menuButton.onclick=()=>move(route==='menu'?'home':'menu');
root.addEventListener('pointerdown',event=>{
  if(route==='menu'&&!event.target.closest('.fr-menu-list,.fr-persistent-menu,.fr-back'))move('home');
});
let touchStart=null;
host.addEventListener('touchstart',event=>{
  touchStart=route==='menu'&&event.touches.length===1?event.touches[0]:null;
},{passive:true});
host.addEventListener('touchend',event=>{
  if(touchStart&&route==='menu'){
    const end=event.changedTouches[0];
    if(end&&end.clientX-touchStart.clientX>60&&end.clientX-touchStart.clientX>Math.abs(end.clientY-touchStart.clientY)*1.5)move('home');
  }
  touchStart=null;
},{passive:false});

document.addEventListener('keydown',event=>{
  if(!doc())return;
  if(event.key==='Escape'){if(host.querySelector('dialog[open]'))return;event.preventDefault();return back();}
  if(!['amount','section'].includes(route)||!host.querySelector('.fr-keypad')||event.metaKey||event.ctrlKey||event.altKey||event.target.matches('input,textarea'))return;
  if(/^\d$/.test(event.key)||[',','.','Backspace'].includes(event.key)){
    event.preventDefault();enterKey(event.key==='Backspace'?'backspace':event.key==='.'?',':event.key);
  }
});
ledger.boot().then(()=>{
  render();
  bindUpdate(root,apply=>{
    if(busy||sections.busy()||route==='unsaved')return;
    const activeDraft=draft&&(isDirty()||route==='amount'&&buffer!==draft.amount||
      route==='note'&&note!==draft.note||route==='category-new'&&categoryForm.name!==categoryForm.initial);
    if(activeDraft||sections.dirty())getLeave(apply);
    else apply();
  });
}).catch(()=>{
  host.innerHTML='<p class="fr-body" role="alert">Тестовое хранилище недоступно. Откройте приложение в обычной вкладке Safari и обновите страницу.</p>';
});
