import {accountMark, amountText, dateText, esc, heading, icon, monthHeader, primary, categoryLabel, operationRows, budgetBar} from './screens.mjs';

export const link = (label, action, id='', detail='') =>
  `<button type="button" class="np-link" data-section-action="${action}" data-id="${esc(id)}"><span><span class="fr-section-name" data-full-name>${esc(label)}</span>${detail}</span>${icon('next')}</button>`;
export {budgetBar};
export const small = value => `<small class="fr-muted">${esc(value)}</small>`;
export const moneyLabel = value => `<strong class="np-money">${amountText(value)}</strong>`;
export const pair = (label,value) => `<div class="np-row"><span>${esc(label)}</span>${moneyLabel(value)}</div>`;
export const panel = body => `<div class="fr-section-panel">${body}</div>`;
export const body = content => `<div class="np-body" data-section-scroll>${content}</div>`;
export const empty = text => `<p class="fr-no-operations">${esc(text)}</p>`;
export const plus = (action,label) => `<button class="fr-category-new" type="button" data-section-action="${action}" aria-label="${esc(label)}">${icon('plus')}</button>`;
export const calendarIcon = () => icon('calendar');
export const actionButton = (label,action) => `<button type="button" class="fr-section-secondary" data-section-action="${action}">${esc(label)}</button>`;
export const tabs = (items,current) => `<div class="fr-section-tabs">${items.map(([id,label])=>`<button type="button" data-section-action="tab" data-id="${id}" aria-pressed="${id===current}">${esc(label)}</button>`).join('')}</div>`;
const decimal = value => String(value ?? '').replace('.',',');
const option = (value,label,selected) => `<option value="${esc(value)}" ${String(selected)===String(value)?'selected':''}>${esc(label)}</option>`;
export function field({key,label,type='text',options,placeholder='',required=true,maxlength=100,min,max},value) {
  if(type==='account-picker'){
    const account=options.find(([id])=>id===value&&id);
    const [id,name,mark]=account||[];
    return `<div class="fr-section-field"><span>${esc(label)}</span><button type="button" class="fr-form-account" data-section-action="form-account" aria-label="Счёт: ${esc(name||'Выбрать счёт')}">
      <span class="fr-form-account-copy"><strong>${esc(name||'Выбрать счёт')}</strong>${id?mark:''}</span>${icon('next')}</button></div>`;
  }
  const control = options
    ? `<select name="${key}" ${required?'required':''}>${options.map(([id,label])=>option(id,label,value)).join('')}</select>`
    : type==='checkbox'
      ? `<input type="checkbox" name="${key}" ${value?'checked':''}>`
      : `<input type="${type==='money'?'text':type}" ${type==='money'?'inputmode="decimal" data-decimal':''} name="${key}" ${type==='file'?'accept=".json,application/json"':`value="${esc(type==='money'?decimal(value):value)}"`} ${min?`min="${esc(min)}"`:''} ${max?`max="${esc(max)}"`:''} placeholder="${esc(placeholder)}" maxlength="${maxlength}" ${required?'required':''} autocomplete="off">`;
  return `<label class="fr-section-field ${type==='checkbox'?'fr-check-field':''}"><span>${esc(label)}</span>${control}</label>`;
}

export function formScreen({title,fields,values,error,busy,submitLabel='Сохранить',inside='',insideBefore='',danger=false}) {
  return heading(title)+`<form class="fr-section-form" data-section-form><div class="np-body" data-section-scroll>${insideBefore}${
    fields.map(f=>field(f,values[f.key])).join('')
  }${inside}<p class="fr-create-error" role="alert">${esc(error)}</p></div><button type="submit" class="fr-primary ${danger?'fr-cancel-confirm':''}" ${busy?'disabled':''}>${esc(submitLabel)}</button></form>`;
}

export function monthControl(month) {
  return monthHeader(Number(month.slice(0,4)),Number(month.slice(5,7))-1)
    .replaceAll('data-month=', 'data-section-action="month" data-id=');
}

export function amountOverview(value,{label='',caption=''}={}) {
  return `<div class="fr-amount-overview">${label?small(label):''}${moneyLabel(value)}${caption?small(caption):''}</div>`;
}

export function summary(month, budget, period) {
  const result = amountText(budget.result);
  return heading('Сводка','',`<button type="button" class="fr-category-new" data-section-action="budget-settings" aria-label="Настройки сводки">${icon('settings')}</button>`)+monthControl(month)+body(
    `<div class="fr-summary-card">
      <div class="fr-month-result"><strong class="np-money ${result.length>11?'fr-result-long':''}" aria-label="Результат месяца ${esc(result)}">${result}</strong>
        <button type="button" data-action="month-result-info" aria-label="Как считается результат месяца" aria-haspopup="dialog">${icon('info')}</button>
      </div>
      <button type="button" class="fr-summary-more" data-section-action="summary-more" aria-haspopup="dialog">Ещё</button>
    </div>
    <dialog class="fr-info-dialog" aria-label="Результат месяца"><div class="fr-info-panel" tabindex="-1" autofocus><strong>Результат месяца</strong>
      <p>Все доходы за месяц минус все расходы за месяц. ${budget.excludeSavings?'Из результата также вычтены накопления за этот месяц.':'Накопления включены в результат.'}</p></div></dialog>
    <dialog class="fr-summary-dialog" aria-labelledby="fr-summary-period"><div class="fr-summary-menu">
      <h2 id="fr-summary-period" tabindex="-1" autofocus>${esc(period)}</h2>
      ${link('Получено','received','',moneyLabel(budget.income))}
      <div class="fr-summary-breakdown">${pair('Ожидалось по плану',budget.expected)}${pair('Получено по плану',budget.planned)}${pair('Дополнительный доход',budget.additional)}</div>
      ${link('Расходы','summary-expenses','',moneyLabel(budget.expense))}
      ${link('Накопления','savings','',moneyLabel(budget.reservedForMonth))}
      ${link('Планы доходов','summary-plans')}${link('Платежи','summary-payments')}
      <div class="fr-summary-available">${link('Доступно к тратам','summary-accounts','',moneyLabel(budget.available))}${small('Счета и кошельки · сейчас')}</div>
      ${actionButton('Закрыть','summary-more-close')}
    </div></dialog>`+
    budget.categories.filter(c=>!c.savings).map(c=>`<div class="fr-summary-category">${link(c.name,'share',c.id,moneyLabel(c.spent))}
      ${budgetBar(c.plan,c.spent,c.funded)+small('План '+amountText(c.plan))}</div>`).join('')
  );
}

export function goalProgress(goal) {
  return `<div class="fr-goal-progress">${small('Цель '+amountText(goal.target))}
    <progress max="${goal.target}" value="${Math.min(goal.target,goal.accumulated)}" aria-label="Прогресс накопления"></progress>
    ${small('Накоплено '+amountText(goal.accumulated))}</div>`;
}

export function shareScreen(state,categories,plan,step,operations) {
  const settings=state.single?'':`<button type="button" class="fr-category-new" data-section-action="slider-step" aria-label="Шаг ползунка">${icon('settings')}</button>`;
  const totals=`<div class="np-island fr-share-totals">
    <div class="np-row fr-share-free"><span>Свободно к<br>распределению</span><strong data-share-free></strong></div>
    <div class="fr-budget-bar fr-budget-bar--wide" aria-hidden="true"><span data-share-bar></span></div>
    <div class="np-row fr-share-caption"><span>Распределено</span><span data-share-total></span></div>
    <div class="np-row fr-share-basis"><span>Свободно по плану</span><strong class="np-money" data-share-free-amount></strong></div>
    ${state.single?'<p class="fr-share-room" data-share-room></p>':''}
    <p class="fr-create-error" data-share-error role="status"></p>
  </div>`;
  const panels=categories.map(c=>`<div class="fr-share-panel">
    ${state.single?'':link(c.name,'share-detail',c.id)}
    <div class="fr-share-values"><div><small>План категории</small><strong class="np-money" data-share-amount></strong></div>
      <label class="fr-share-field"><input type="text" inputmode="decimal" data-share-input data-id="${esc(c.id)}" aria-label="Процент ${esc(c.name)}" placeholder="0" value="${esc(state.values[c.id])}"><span>%</span></label>
    </div>
    <input type="range" min="0" max="100" step="${step}" value="${Number(state.values[c.id])||0}" data-share-slider data-id="${esc(c.id)}" aria-label="Ползунок ${esc(c.name)}">
  </div>`).join('')||empty('Категорий пока нет.');
  const error=`<p class="fr-create-error fr-section-error" role="alert">${esc(state.error)}</p>`;
  const save=primary(state.single && state.parentDraft?'Готово':'Сохранить','section-save-share');
  const top=heading(state.title,'',settings);
  if(state.categoryHistory){
    return top+monthControl(state.month)+
      `<div class="np-body fr-share-history" data-section-scroll>${totals}${panels}${error}
        <h2 class="fr-section-title">Операции за месяц</h2>${operations}</div><div class="fr-share-save">${save}</div>`;
  }
  return top+totals+body(panels)+error+save;
}

export function goalCard(goal) {
  return `<button type="button" class="fr-goal-preview" data-section-action="goal" data-id="${esc(goal.categoryId)}">
    <span class="fr-goal-heading"><strong>${esc(goal.name)}</strong>${icon('next')}</span>
    ${goalProgress(goal)}
    <span class="fr-goal-available">${small('Доступно потратить')}${moneyLabel(goal.remaining)}</span>
    ${goal.due?small(dateText(goal.due)):''}
  </button>`;
}

const compactDateFormat = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'});
const compactDate = date => compactDateFormat.format(new Date(date+'T12:00:00')).replace(/ г\.$/,'');
const closureOutcome = goal => goal.spent?'Накоплено и потрачено':'Накоплено';

export function closedGoalCard(goal) {
  return `<button type="button" class="fr-goal-preview fr-closed-goal-preview" data-section-action="closed-goal" data-id="${esc(goal.categoryId)}">
    <span class="fr-goal-heading"><strong>${esc(goal.name)}</strong>${icon('next')}</span>
    ${small('Закрыта · '+compactDate(goal.date))}${moneyLabel(goal.accumulated)}${small(closureOutcome(goal))}
  </button>`;
}

export function goalFacts(rows) {
  return `<dl class="fr-goal-facts">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${moneyLabel(value)}</dd></div>`).join('')}</dl>`;
}

export function closedGoalDetail(goal,history,d,expanded) {
  const facts = [['Целевая сумма',goal.target],['Из накопленного потрачено',goal.spent]];
  if (goal.remaining) facts.push(['Возвращено в нераспределённые',goal.remaining]);
  const records = history.rows.slice().reverse().map(op=>{
    const category = categoryLabel(d,op.allocations[0]?.categoryId);
    const title = op.kind==='refund'?'Возврат':category.name||'Расход';
    const account = d.accounts.find(a=>a.id===op.accountId)?.name;
    const meta = [compactDate(op.date),account,op.cancelled?'Отменена':''].filter(Boolean).join(' · ');
    return `<button type="button" class="fr-payment-actions-row" data-operation="${esc(op.id)}" data-cancelled="${!!op.cancelled}">
      <span>${esc(title)}<small>${esc(meta)}</small></span>${moneyLabel(op.amount)}</button>`;
  }).join('');
  return `<section class="fr-goal-total">${small('Цель закрыта')}${moneyLabel(goal.accumulated)}
    ${small(closureOutcome(goal)+' · '+compactDate(goal.date))}</section>`+
    '<p class="fr-goal-as-of">На момент закрытия</p>'+goalFacts(facts)+
    (history.changed?'<p class="fr-muted" role="status">Связанные записи изменены после закрытия. Выше — суммы на дату закрытия.</p>':'')+
    (records?`<details data-closed-expenses ${expanded?'open':''}><summary>Расходы${icon('down')}</summary>${records}</details>`:'');
}

export function accountCard(account,balance,primaryAccount=false) {
  return `<button type="button" class="fr-typed-account fr-account-list-item ${primaryAccount?'fr-main-account-row':''}" data-section-action="account" data-id="${esc(account.id)}">
    <span class="fr-typed-account-name">${accountMark(account,false)}<strong>${esc(account.name)}</strong></span>
    ${moneyLabel(balance)}</button>`;
}

export function ledgerRow(name,action,id,amount,meta='') {
  return `<button type="button" class="fr-ledger-row" data-section-action="${action}" data-id="${esc(id)}">
    <span class="fr-ledger-name">${esc(name)}</span>${moneyLabel(amount)}${meta}</button>`;
}

export function recordHistory(doc,operation) {
  const timeline = doc.operationEdits.filter(r=>r.operationId===operation.id);
  const describe = (key,op) => ({
    amount:()=>amountText(op.amount),
    date:()=>dateText(op.date),
    accountId:()=>doc.accounts.find(a=>a.id===op.accountId)?.name,
    toAccountId:()=>doc.accounts.find(a=>a.id===op.toAccountId)?.name,
    categoryId:()=>op.allocations.map(a=>categoryLabel(doc,a.categoryId).name).join(', '),
    note:()=>op.note,
    creditDueDate:()=>op.creditDueDate && dateText(op.creditDueDate)
  })[key]() || '—';
  const fields = {amount:'Сумма',date:'Дата',accountId:'Счёт',toAccountId:'Счёт зачисления',categoryId:'Категория',note:'Заметка',creditDueDate:'Срок'};
  return timeline.map((row,index)=>{
    const after = timeline[index+1]?.before || operation;
    const changes = Object.entries(fields).map(([key,label])=>{
      const before = describe(key,row.before), value = describe(key,after);
      return before===value?'':`<div class="fr-history-change"><span>${label}</span><del>${esc(before)}</del><strong>${esc(value)}</strong></div>`;
    }).join('');
    return panel(small(new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(row.at)))+
      `<strong>${after.cancelled && !row.before.cancelled?'Отмена':'Изменение'}</strong>`+changes);
  }).reverse().join('')+panel('<strong>Операция записана</strong>'+small(dateText((timeline[0]?.before || operation).date)));
}

export function recordRows(doc,rows,query='',filters={}) {
  return operationRows(doc,rows.filter(o=>
    (!filters.from || o.date>=filters.from) && (!filters.to || o.date<=filters.to) &&
    (!filters.kind || o.kind===filters.kind) && (!filters.account || [o.accountId,o.toAccountId].includes(filters.account)) &&
    (!filters.category || o.allocations.some(a=>a.categoryId===filters.category ||
      doc.categories.find(c=>c.id===a.categoryId)?.parentId===filters.category))
  ),query);
}
