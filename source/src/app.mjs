import * as ledger from './ledger.mjs';
import * as screen from './screens.mjs';
import {localDate} from './engine/operations.mjs';
import {money,uid} from './engine/model.mjs';
import {bindMenuGlyph,bindTrack} from './motion.mjs';

const root=document.querySelector('#finrate');
const host=root.querySelector('.fr-route-host');
const menuButton=root.querySelector('.fr-persistent-menu');
const updateMenu=bindMenuGlyph(menuButton);
const parseMonth=date=>{const [year,month]=date.slice(0,7).split('-').map(Number);return new Date(year,month-1,15,12);};
let route='home', menuGroup=null, menuScroll=0, draft=null, previous=null, initial=null, origin='home', originScroll=0, editing=false;
let buffer='', query='', operationQuery='', categoryForm=null, showCreate=false;
let calendar= parseMonth(localDate()), period=parseMonth(localDate());
let note='', error='', busy=false, leave=null;

const doc=ledger.document;
const listNode=()=>host.querySelector('.fr-operation-list,.np-body');
function move(to) { route=to;render(); }
function resetDraft(){draft=null;previous=null;initial=null;editing=false;error='';leave=null;}
function getMonthBounds(){
  const y=period.getFullYear(),m=period.getMonth();
  const from=y+'-'+String(m+1).padStart(2,'0')+'-01';
  const next=new Date(y,m+1,1,12);
  const until=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01';
  const to=from.slice(0,8)+new Date(y,m+1,0,12).getDate();
  return {from,to,until};
}
const isDirty=()=>JSON.stringify(draft)!==initial;
const validAmount=()=>/^\d{1,9}(,\d{0,2})?$/.test(buffer)&&Number(buffer.replace(',','.'))>0;
const normalizedAmount=value=>value.endsWith(',')?value.slice(0,-1):value;
function start(kind){
  resetDraft();
  origin='home';originScroll=0;
  draft={id:uid(),kind,amount:'',categoryId:'',date:localDate(),accountId:'',note:''};
  initial=JSON.stringify(draft);buffer='';move('amount');
}
function openRecord(id){
  const item=doc().operations.find(o=>o.id===id);
  if(!item)return;
  resetDraft();
  previous=item;origin=route;originScroll=listNode()?.scrollTop||0;
  draft={id:item.id,kind:item.kind,amount:String(item.amount/100).replace('.',','),categoryId:item.allocations[0]?.categoryId,
    date:item.date,accountId:item.accountId,note:item.note};
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
function getLeave(onDiscard){
  leave={from:route,onDiscard};move('unsaved');
}
function back(){
  if(busy)return;
  switch(route){
    case 'home': return;
    case 'menu': case 'summary': return move('home');
    case 'operations': case 'accounts': case 'categories': return move('menu');
    case 'received': return move('summary');
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
    case 'account':
      if(editing)return showReview();
      return openCalendar();
    case 'review':
      if(previous&&isDirty())return getLeave(finish);
      if(previous)return finish();
      return move('account');
    case 'note':
      if(note!==draft.note&&!previous?.cancelled)return getLeave(showReview);
      return showReview();
    case 'category-new':
      if(categoryForm.name.trim()&&categoryForm.name!==categoryForm.initial)return getLeave(()=>move('category'));
      return move('category');
  }
}

function edit(field){
  if(previous?.cancelled&&field!=='note')return;
  editing=true;error='';
  if(field==='amount'){buffer=draft.amount;move('amount');}
  if(field==='date')openCalendar();
  if(field==='category')openCategory();
  if(field==='account')move('account');
  if(field==='note'){note=draft.note;move('note');}
}

function enterKey(key){
  if(key==='backspace')buffer=buffer.slice(0,-1);
  if(key===','&&!buffer.includes(','))buffer=(buffer||'0')+',';
  if(/^\d$/.test(key)){
    const candidate=buffer==='0'?key:buffer+key;
    if(/^\d{1,9}(,\d{0,2})?$/.test(candidate))buffer=candidate;
  }
  const output=host.querySelector('output');
  output.textContent=screen.enteredMoney(buffer);
  output.classList.toggle('fr-empty',!buffer);
  host.querySelector('[data-action=next]').disabled=!validAmount();
}

async function save(){
  if(busy||previous?.cancelled)return;
  busy=true;error='';render();
  try{await ledger.save(draft,previous);return finish();}
  catch(cause){
    error={
      INSUFFICIENT_FUNDS:'На выбранном счёте недостаточно средств.',
      STALE:'Данные изменились в другой вкладке. Откройте приложение заново.',
      EDIT_STALE:'Запись изменилась. Откройте её заново.',
      STORAGE_QUOTA_ABORTED:'Недостаточно места на устройстве. Операция не записана.'
    }[cause.code]||'Не удалось сохранить. Проверьте сумму, дату и счёт.';
    busy=false;render();
  }
}
async function cancel(){
  if(busy)return;
  busy=true;error='';render();
  try{await ledger.cancel(previous.id);return finish();}
  catch{error='Не удалось отменить операцию. Попробуйте ещё раз.';busy=false;render();}
}
async function createCategory(){
  if(busy||!categoryForm.name.trim())return;
  busy=true;
  const {name,parentId}=categoryForm,id=uid();
  try{
    await ledger.addOperationCategory({id,name:name.trim(),type:draft.kind,parentId:parentId||null});
    busy=false;
    selectedCategory(id);
  }catch(cause){
    categoryForm.error=cause.code==='NAME_EXISTS'?'Такое название уже есть.':'Не удалось создать категорию.';
    busy=false;render();
  }
}

function action(id){
  if(busy)return;
  switch(id){
    case 'back': return back();
    case 'summary': case 'received': case 'operations': case 'accounts': case 'categories': return move(id);
    case 'next':
      if(!validAmount())return;
      draft.amount=normalizedAmount(buffer);
      if(editing)return showReview();
      return openCategory();
    case 'save': return void save();
    case 'accept-note':
      if(note.length<=500&&!previous?.cancelled)draft.note=note;
      return showReview();
    case 'category-create-menu': showCreate=!showCreate;return render();
    case 'new-category': case 'new-subcategory':
      categoryForm={sub:id==='new-subcategory',name:query.trim(),initial:query.trim(),parentId:'',error:''};
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
  let markup;
  switch(route){
    case 'home': markup=screen.home();break;
    case 'menu': markup=screen.menu(menuGroup);break;
    case 'amount': markup=screen.keypad(draft.kind,buffer,validAmount());break;
    case 'category': markup=screen.categoryPicker(doc(),draft,query,showCreate);break;
    case 'category-new':
      markup=screen.createCategoryScreen(categoryForm,doc().categories.filter(c=>c.type===draft.kind&&!c.parentId&&!c.archived&&!c.mergedInto));break;
    case 'date': markup=screen.calendar(draft.kind,calendar.getFullYear(),calendar.getMonth(),draft.date,localDate());break;
    case 'account': case 'accounts':
      markup=screen.accounts(doc(),ledger.fact().balances,draft?.accountId,route==='accounts');break;
    case 'review': markup=screen.review(doc(),draft,previous,isDirty(),error,busy);break;
    case 'note': markup=screen.noteScreen(note,previous?.cancelled);break;
    case 'operations': markup=screen.operations(doc(),operationQuery);break;
    case 'summary':
      markup=screen.summary(period.getFullYear(),period.getMonth(),ledger.fact(getMonthBounds()));break;
    case 'received': {
      const {from,until}=getMonthBounds();
      const rows=doc().operations.filter(o=>o.kind==='income'&&!o.cancelled&&!o.pending&&o.date>=from&&o.date<until);
      markup=screen.received(doc(),period.getFullYear(),period.getMonth(),ledger.fact(getMonthBounds()).income,rows);break;
    }
    case 'unsaved': markup=screen.unsaved();break;
    case 'cancel': markup=screen.heading('Отменить операцию?')+
      `<div class="fr-unsaved-content"><p class="fr-unsaved-message">Остаток на счёте изменится.</p><div class="fr-unsaved-actions"><button type="button" class="fr-primary fr-cancel-confirm" data-action="cancel-confirm" ${busy?'disabled':''}>Отменить операцию</button><button type="button" class="fr-unsaved-discard" data-action="back" ${busy?'disabled':''}>Оставить операцию</button></div><p role="alert">${screen.esc(error)}</p></div>`;break;
    case 'history': {
      const changes=doc().operationEdits.filter(entry=>entry.operationId===draft.id).reverse();
      markup=screen.heading('История изменений')+`<div class="fr-list">${changes.map(entry=>`<p class="fr-list-row">${screen.dateText(entry.at.slice(0,10))}<br>Прежняя сумма ${screen.amountText(entry.before.amount)}</p>`).join('')||'<p class="fr-no-operations">Изменений пока нет.</p>'}</div>`;break;
    }
    case 'categories':
      markup=screen.heading('Категории')+`<div class="fr-payment-actions-list">${doc().categories.filter(c=>!c.parentId&&!c.archived).map(c=>`<p class="fr-list-row">${screen.esc(c.name)}</p>`).join('')}</div>`;break;
  }
  host.innerHTML=`<section class="fr-screen" data-screen="${route}">${markup}</section>`;
  if(route==='home')bindTrack(host.querySelector('.fr-track'),start);
  if(route==='menu')host.querySelector('#fr-menu-panel').scrollTop=menuScroll;
}

function monthChange(delta){
  const date=route==='date'?calendar:period;
  const next=new Date(date.getFullYear(),date.getMonth()+delta,15,12);
  if(next.getFullYear()<100||next.getFullYear()>9999)return;
  if(route==='date')calendar=next;else period=next;
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
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const data=button.dataset;
  if(data.action)return action(data.action);
  if(data.edit)return edit(data.edit);
  if(data.key)return enterKey(data.key);
  if(data.category)return selectedCategory(data.category);
  if(data.parent){categoryForm.parentId=data.parent;return render();}
  if(data.month)return monthChange(Number(data.month));
  if(data.date){draft.date=data.date;return editing?showReview():move('account');}
  if(data.account){draft.accountId=data.account;return showReview();}
  if(data.operation)return openRecord(data.operation);
});
host.addEventListener('input',event=>{
  const input=event.target;
  if(input.hasAttribute('data-search-category')){
    query=input.value;
    host.querySelector('[data-category-results]').innerHTML=screen.categoryRows(doc(),draft.kind,draft.categoryId,query);
  }
  if(input.hasAttribute('data-search-operation')){
    operationQuery=input.value;
    host.querySelector('[data-operation-results]').innerHTML=screen.operationRows(doc(),doc().operations,operationQuery);
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
},{passive:true});

document.addEventListener('keydown',event=>{
  if(!doc())return;
  if(event.key==='Escape'){event.preventDefault();return back();}
  if(route!=='amount'||event.metaKey||event.ctrlKey||event.altKey||event.target.matches('input,textarea'))return;
  if(/^\d$/.test(event.key)||[',','.','Backspace'].includes(event.key)){
    event.preventDefault();enterKey(event.key==='Backspace'?'backspace':event.key==='.'?',':event.key);
  }
});
ledger.boot().then(()=>{
  render();
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}).catch(()=>{
  host.innerHTML='<p class="fr-body" role="alert">Тестовое хранилище недоступно. Откройте приложение в обычной вкладке Safari и обновите страницу.</p>';
});
