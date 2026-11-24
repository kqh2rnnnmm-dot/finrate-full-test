import {monthlyOverview} from './engine/month-budget.mjs';

const paths={
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  swap:'<path d="m21 16-4 4-4-4m4 4V4M3 8l4-4 4 4M7 4v16"/>',
  gear:'<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M10 2h4l.7 2.8 2 .9 2.5-1.4 2.2 3.8-2.1 1.9v4l2.1 1.9-2.2 3.8-2.5-1.4-2 .9L14 22h-4l-.7-2.8-2-.9-2.5 1.4-2.2-3.8 2.1-1.9v-4L2.6 8.1l2.2-3.8 2.5 1.4 2-.9L10 2Zm2 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>',
  settings:'<path d="M9 6h11m-9 6h9m-5 6h5M4 6h1m-1 6h3m-3 6h7"/><circle cx="7" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>',
  back:'<path d="m15 6-6 6 6 6"/>',
  next:'<path d="m9 6 6 6-6 6"/>',
  pencil:'<path d="m14 6 4 4M5 19l1-5L16 4a3 3 0 0 1 4 4L10 18Z"/>',
  calendar:'<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3v5m8-5v5M4 11h16"/>',
  account:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  ellipsis:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>'
};
export const icon=name=>`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
export const selectionMark=selected=>`<span class="fr-selection-mark" aria-hidden="true">${selected?icon('check'):''}</span>`;
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const labels={expense:'Расход',income:'Доход'};
const monthFormat=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'});
const dateFormat=new Intl.DateTimeFormat('ru-RU',{dateStyle:'long'});
const ruNumber=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export const dateText=date=>dateFormat.format(new Date(date+'T12:00:00')).replace(/ г\.$/,'');
const monthText=date=>monthFormat.format(date).replace(/ г\.$/,'');
export const amountText=minor=>ruNumber.format(minor/100)+' ₽';
const isoMonth=(y,m)=>String(y).padStart(4,'0')+'-'+String(m+1).padStart(2,'0');
export const primary=(message,action,attr='')=>`<button type="button" class="fr-primary" data-action="${action}" ${attr}>${message}</button>`;
export const heading=(title,kind='',side='',expandable=false)=>`<header class="fr-header"><button type="button" class="fr-back" data-action="back" aria-label="Назад">${icon('back')}</button><h1 class="fr-title ${kind}" ${expandable?'data-full-name':''}>${esc(title)}</h1>${side}</header>`;

export const home=()=>`<div class="fr-home-header"><div class="fr-brand">FinRate</div><button type="button" class="fr-quick-home-entry fr-menu" data-action="summary">Сводка</button></div>
<main class="fr-home-body"><div class="fr-track" data-stage="neutral">
<button class="fr-pole fr-pole-top" type="button" data-entry="expense"><span aria-hidden="true">↑</span><span>РАСХОД</span></button>
<button class="fr-pole fr-pole-bottom" type="button" data-entry="income"><span aria-hidden="true">↓</span><span>ДОХОД</span></button>
<button class="fr-knob" type="button" aria-label="Вверх — расход, вниз — доход"></button>
</div></main>`;

const groups=[
  ['Учёт',[['Операции','operations'],['Перевод','transfer'],['Счета и кошельки','accounts'],['Категории','categories']]],
  ['Планы и отчёты',[['Платежи','payments'],['Планы доходов','income-plans'],['Накопления','savings']]],
  ['Настройки и помощь',[['Настройки сводки','budget-settings'],['Управление данными','data-management']]]
];
export function menu(open) {
  return heading('Меню')+`<nav id="fr-menu-panel" class="fr-menu-list" aria-label="Разделы FinRate">${groups.map(([title,items])=>`<details class="fr-menu-accordion" data-menu-group="${esc(title)}" ${open===title?'open':''}><summary>${esc(title)}<span class="fr-fold" aria-hidden="true">${icon('down')}</span></summary><div class="fr-menu-children">${items.map(([label,action])=>`<button type="button" class="fr-menu-item" data-action="${action}">${label}</button>`).join('')}</div></details>`).join('')}</nav>`;
}

export function keypad(kind,buffer,valid,title=labels[kind],next='next') {
  return heading(title,kind)+`<div class="fr-amount-display"><output class="fr-money ${buffer?'':'fr-empty'}" aria-label="Сумма" aria-live="polite">${esc(enteredMoney(buffer))}</output></div><div class="fr-keypad" role="group" aria-label="Ввод суммы">${['1','2','3','4','5','6','7','8','9',',','0','backspace'].map(key=>`<button type="button" class="fr-key" data-key="${key}" aria-label="${key==='backspace'?'Удалить цифру':key===','?'Запятая':key}">${key==='backspace'?'⌫':key}</button>`).join('')}</div>`+primary('Далее',next,valid?'':'disabled');
}
export function enteredMoney(buffer){
  if(!buffer)return 'Сумма';
  const [whole,fraction]=buffer.split(',');
  return ruNumber.format(Number(whole))+(fraction===undefined?'':','+fraction)+' ₽';
}

export function budgetBar(plan,spent,funded=0) {
  const scale=Math.max(plan,spent,1);
  return `<div class="fr-budget-bar fr-budget-bar--wide fr-category-meter ${spent>plan?'fr-meter-over':''}" role="img"
    aria-label="План ${amountText(plan)}, расход ${amountText(spent)}"><span class="fr-meter-funding" style="width:${Math.min(plan,funded)/scale*100}%"></span>
    <span class="fr-meter-spent" style="width:${Math.min(plan,spent)/scale*100}%"></span></div>`;
}
export function categoryRows(doc,kind,chosen,query,locked='',date='',amount=0,previous=null) {
  const q=query.toLocaleLowerCase('ru').trim();
  const month=date.slice(0,7);
  const budget=kind==='expense'&&month?monthlyOverview(doc,month):null;
  const items=doc.categories.filter(c=>c.type===kind&&!c.archived&&!c.mergedInto);
  const hits=items.filter(c=>!c.parentId&&(!locked||c.id===locked)).flatMap(parent=>{
    const parentMatch=parent.name.toLocaleLowerCase('ru').includes(q);
    const children=items.filter(c=>c.parentId===parent.id&&(parentMatch||c.name.toLocaleLowerCase('ru').includes(q)));
    if(!parentMatch&&!children.length)return [];
    const option=c=>`<button type="button" class="fr-operation-picker-choice ${c.parentId?'fr-operation-picker-child':''}" data-category="${esc(c.id)}" aria-pressed="${chosen===c.id}"><span>${esc(c.name)}</span>${selectionMark(chosen===c.id)}</button>`;
    const c=budget?.categories.find(row=>row.id===parent.id&&!row.savings);
    const prior=previous?.date.startsWith(month)?previous.allocations.filter(a=>a.categoryId===parent.id||
      items.some(item=>item.id===a.categoryId&&item.parentId===parent.id)).reduce((sum,a)=>sum+a.amount,0):0;
    const excess=c?Math.max(0,c.spent-prior+amount-c.plan):0;
    const budgetMarkup=c?`<div class="fr-picker-budget">${c.spent>c.plan?'Сверх плана':'Осталось по плану'} <strong>${amountText(Math.abs(c.plan-c.spent))}</strong>
      ${budgetBar(c.plan,c.spent,c.funded)}${amount>0&&excess?'<small>После записи сверх плана на '+amountText(excess)+'</small>':''}</div>`:'';
    return `<section class="fr-payment-actions-group ${budget?'fr-expense-picker-group':''}">${option(parent)}${budgetMarkup}${children.map(option).join('')}</section>`;
  });
  return hits.join('') || (q?`<button type="button" class="fr-operation-picker-choice" data-action="category-create-menu">${icon('plus')}<span>Создать «${esc(query.trim())}»</span></button>`:'<p class="fr-no-operations">Категорий пока нет.</p>');
}

export function categoryPicker(doc,draft,query,showCreate,locked='',amount=0,previous=null) {
  const plus=`<button type="button" class="fr-category-new" data-action="category-create-menu" aria-label="Создать категорию или подкатегорию" aria-expanded="${showCreate}">${icon('plus')}</button>`;
  return heading('Категория','',plus)+`<div class="fr-payment-actions-search"><input type="search" data-search-category placeholder="Поиск" aria-label="Поиск категории или подкатегории" autocomplete="off" value="${esc(query)}"></div><div class="fr-payment-actions-list" data-category-results>${categoryRows(doc,draft.kind,draft.categoryId,query,locked,draft.date,amount,previous)}</div>`+
    (showCreate?`<div class="fr-operation-create-menu">${locked?'':'<button type="button" data-action="new-category">Создать категорию</button>'}<button type="button" data-action="new-subcategory">Создать подкатегорию</button></div>`:'');
}

export function createCategoryScreen(form,parents) {
  if(form.sub&&!form.parentId){
    return heading('В какую категорию?')+`<div class="fr-payment-actions-list">${parents.map(c=>`<button type="button" class="fr-operation-picker-choice" data-parent="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>`;
  }
  return heading(form.sub?'Новая подкатегория':'Новая категория')+`<div class="fr-create-body fr-body"><input class="fr-input" data-name value="${esc(form.name)}" placeholder="Название" aria-label="Название" autocomplete="off" maxlength="100"><p class="fr-create-error" role="alert">${esc(form.error)}</p></div>`+primary('Добавить','save-category',form.name.trim()?'':'disabled');
}

export function monthHeader(y,m){
  return `<div class="fr-month"><button type="button" aria-label="Предыдущий месяц" data-month="-1">${icon('back')}</button><div class="fr-month-title">${monthText(new Date(y,m,15,12))}</div><button type="button" aria-label="Следующий месяц" data-month="1">${icon('next')}</button></div>`;
}

export function calendar(kind,y,m,selected,today,title) {
  const offset=(new Date(y,m,1,12).getDay()+6)%7, length=new Date(y,m+1,0,12).getDate();
  const days=Array.from({length},(_,i)=>{
    const date=isoMonth(y,m)+'-'+String(i+1).padStart(2,'0');
    return `<button type="button" class="fr-day" data-date="${date}" aria-label="${dateText(date)}" aria-pressed="${selected===date}" ${date===today?'aria-current="date"':''}>${i+1}</button>`;
  });
  return heading(title||labels[kind],kind)+`<div class="fr-body fr-calendar">${monthHeader(y,m)}<div class="fr-week" aria-hidden="true">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(label=>`<span>${label}</span>`).join('')}</div><div class="fr-days" role="group" aria-label="Выбрать дату">${'<span aria-hidden="true"></span>'.repeat(offset)}${days.join('')}</div><button type="button" class="fr-calendar-today" data-date="${today}">Сегодня</button></div>`;
}

const accountTypes={debit:'Безнал',cash:'Наличные',credit:'Кредитная карта'};
const accountType=account=>account.financeType==='credit'?'credit':account.kind==='cash'?'cash':'debit';
export function accountMark(account,withLabel=true){
  const type=accountType(account);
  return `<span class="fr-type-mark fr-type-${type}"><span class="fr-type-dot" aria-hidden="true"></span>${withLabel?'<span>'+accountTypes[type]+'</span>':''}</span>`;
}
export const accountCardContents=(account,balance)=>`<span class="fr-typed-account-name">${accountMark(account,false)}<strong>${esc(account.name)}</strong></span>
    <strong class="np-money">${amountText(balance)}</strong>`;
export function accountChoices(doc,balances,selected,operationKind,primaryId,selectAction=''){
  return Object.entries(accountTypes).map(([type,title])=>{
    if(type==='credit'&&operationKind==='income')return '';
    const matches=doc.accounts.filter(a=>!a.archived&&accountType(a)===type);
    if(!matches.length)return '';
    return `<section class="fr-type-group fr-account-section" aria-label="${title}"><h3 class="fr-section-title">${title}</h3>${matches.map(a=>{
      const action=selectAction?`data-section-action="${selectAction}" data-id="${esc(a.id)}"`:`data-account="${esc(a.id)}"`;
      return `<button type="button" ${action} aria-pressed="${a.id===selected}" class="fr-typed-account fr-account-list-item fr-account-choice ${a.id===primaryId?'fr-main-account-row':''}">
       ${accountCardContents(a,balances[a.id])}${selectionMark(a.id===selected)}</button>`;
    }).join('')}</section>`;
  }).join('');
}
export function accounts(doc,balances,selected,operationKind,{shortfall=0,transfer=false,primaryId=''}={}){
  const rows=accountChoices(doc,balances,selected,operationKind,primaryId);
  const warning=shortfall?`<aside class="fr-funds-warning">
    <div role="status"><strong>Не хватает ${amountText(shortfall)}</strong><p>Выберите другой счёт${transfer?' или сделайте перевод':''}.</p></div>
    ${transfer?'<button type="button" class="fr-section-secondary" data-action="fund-expense">Сделать перевод</button>':''}</aside>`:'';
  return heading('Счёт')+`<div class="fr-payment-actions-list">${warning}${rows||'<p class="fr-no-operations">Нет доступных счетов.</p>'}</div>`+
    (rows?primary('Далее','account-next',selected&&!shortfall?'':'disabled'):primary('Добавить счёт','first-account'));
}

export function categoryLabel(doc,id) {
  const category=doc.categories.find(c=>c.id===id);
  return {name:category?.name||'Выбрать категорию',parent:category?.parentId?doc.categories.find(c=>c.id===category.parentId)?.name:''};
}
function reviewRow(field,label,value,mark,extra='',disabled=false){
  return `<button type="button" class="fr-review-row fr-editable-row ${extra}" data-edit="${field}" aria-label="${label}" ${disabled?'disabled':''}><span class="fr-row-text">${value}</span>${icon(mark)}</button>`;
}

export function review(doc,draft,previous,dirty,error,busy,overspent='',archived=false,refundable=false) {
  const {name,parent}=categoryLabel(doc,draft.categoryId),account=doc.accounts.find(a=>a.id===draft.accountId);
  const readonly=archived||previous?.cancelled;
  return heading(labels[draft.kind],draft.kind)+`<div class="fr-review-body"><div class="fr-review-card">
${reviewRow('amount','Изменить сумму',enteredMoney(draft.amount),'pencil','fr-review-money',readonly)}
${reviewRow('category','Выбрать категорию',esc(name)+(overspent?`<span class="fr-payment-actions-parent fr-over-budget">Бюджет категории «${esc(overspent)}» превышен</span>`:parent?`<span class="fr-payment-actions-parent">${esc(parent)}</span>`:''),'pencil','',readonly)}
${reviewRow('date','Изменить дату',esc(dateText(draft.date)),'calendar','',readonly)}
${draft.creditDueDate?reviewRow('credit-date','Изменить срок погашения',esc(dateText(draft.creditDueDate)),'calendar','',readonly):''}
${reviewRow('account','Выбрать счёт операции',account?esc(account.name)+`<span class="fr-selected-account-type">${accountMark(account)}</span>`:'Выбрать счёт','account','fr-account',readonly)}
<button type="button" class="fr-review-row fr-editable-row fr-note-link" data-edit="note">${draft.note?'Заметка<span class="fr-note-present" aria-hidden="true"></span>':'Добавить заметку'}</button>
</div>${previous?`<div class="fr-operation-actions">${refundable&&!readonly?'<button type="button" class="fr-history-link" data-action="refund">Записать возврат</button>':''}<button type="button" class="fr-history-link" data-action="history">История изменений</button>${previous.cancelled?'<p class="fr-no-operations">Операция отменена</p>':archived?'<p class="fr-no-operations">Счёт в архиве</p>':'<button type="button" class="fr-cancel-link" data-action="cancel">Отменить операцию</button>'}</div>`:''}<p class="fr-create-error" role="alert">${esc(error)}</p></div>`+
  (previous?.cancelled||archived?'':primary('Сохранить','save',busy||previous&&!dirty?'disabled':''));
}

export const noteScreen=(text,readonly)=>heading('Заметка')+`<button class="fr-note-done" type="button" data-action="accept-note" ${text.length>500?'disabled':''}>Готово</button><textarea class="fr-note-textarea" aria-label="Текст заметки" ${readonly?'readonly':''}>${esc(text)}</textarea><div class="fr-note-count ${text.length>500?'fr-over-limit':''}">${text.length} / 500</div>`;

const operationTypes={...labels,transfer:'Перевод',adjustment:'Корректировка',refund:'Возврат'};
export function recentOperationRows(doc,rows,accountId){
  return rows.map(o=>{
    const label=o.allocations[0]?.categoryId?categoryLabel(doc,o.allocations[0].categoryId).name:operationTypes[o.kind]||'Операция';
    const sign=o.kind==='expense'||o.kind==='transfer'&&o.accountId===accountId?'−':'';
    return `<button type="button" class="fr-recent-operation ${o.cancelled?'fr-cancelled':''}" data-operation="${esc(o.id)}">
      <span>${esc(label)}<small>${dateText(o.date)}${o.cancelled?' · Отменена':''}</small></span>
      <strong class="fr-operation-amount">${sign}${amountText(o.amount)}</strong></button>`;
  }).join('')||'<p class="fr-no-operations">Операций пока нет.</p>';
}

export function operationRows(doc,rows,query=''){
  const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е');
  const q=normalize(query).trim();
  const terms=q.split(/\s+/).filter(Boolean);
  let day;
  return rows.slice().reverse().sort((a,b)=>b.date.localeCompare(a.date)).map(o=>{
    const category=categoryLabel(doc,o.allocations[0]?.categoryId);
    const type=operationTypes[o.kind]||'Операция';
    const account=doc.accounts.find(a=>a.id===o.accountId)?.name||'';
    const destination=doc.accounts.find(a=>a.id===o.toAccountId)?.name;
    const categoryName=o.allocations[0]?.categoryId ? [category.parent,category.name].filter(Boolean).join(' ') : '';
    const haystack=normalize([type,categoryName,account,destination,o.note].filter(Boolean).join(' '));
    if(!terms.every(term=>haystack.includes(term)))return '';
    const group=o.date!==day?`<h2 class="fr-operation-date">${dateText(o.date)}</h2>`:'';
    day=o.date;
    const accountPath=destination?[account,destination].filter(Boolean).join(' → '):account;
    return group+`<button type="button" class="fr-operation-row ${o.cancelled?'fr-cancelled':o.kind}" data-operation="${esc(o.id)}">
      <span class="fr-operation-name">${type}</span><span class="fr-operation-amount">${['income','refund'].includes(o.kind)?'+':o.kind==='expense'?'−':''}${amountText(o.amount)}</span>
      ${categoryName?`<span class="fr-operation-category">${esc(category.name)}${category.parent?`<small>${esc(category.parent)}</small>`:''}</span>`:''}
      ${accountPath?`<span class="fr-operation-account">${esc(accountPath)}</span>`:''}
      ${o.cancelled?'<span class="fr-operation-status">Операция отменена</span>':''}</button>`;
  }).join('')||`<p class="fr-no-operations">${q?'Операции не найдены.':'Операций пока нет.'}</p>`;
}

export const unsaved=(attribute='data-action',stay='stay',discard='discard')=>heading('Выйти без сохранения?')+
  `<div class="fr-unsaved-content"><p class="fr-unsaved-message">Изменения не будут сохранены.</p><div class="fr-unsaved-actions">
    <button type="button" class="fr-primary" ${attribute}="${stay}">Вернуться к редактированию</button>
    <button type="button" class="fr-unsaved-discard" ${attribute}="${discard}">Выйти без сохранения</button></div></div>`;
