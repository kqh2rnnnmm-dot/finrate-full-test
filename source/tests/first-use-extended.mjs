import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';

const appUrl=process.argv[2];
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark',acceptDownloads:true,reducedMotion:'reduce'});
const errors=[];
page.on('pageerror',error=>errors.push(error.stack));
page.setDefaultTimeout(5000);
const button=name=>page.getByRole('button',{name,exact:true});
const section=(name,id)=>page.locator(`[data-section-action="${name}"]${id===undefined?'':`[data-id="${id}"]`}`);
const action=name=>page.locator(`[data-action="${name}"]`);
const title=name=>page.getByRole('heading',{name,exact:true}).waitFor();
const back=()=>button('Назад').click();
const fill=(field,value)=>page.locator(`input[name="${field}"]`).fill(value);
const submit=()=>page.locator('button[type=submit]').click();
const normal=s=>s.replace(/[\u00a0\u202f]/g,' ');
async function menu(group,item){
  await page.locator("[data-screen=home], [data-screen=menu]").waitFor();
  if(await page.locator('[data-screen=home]').count())await button('Открыть меню').click();
  const details=page.locator(`[data-menu-group="${group}"]`);
  if(await details.getAttribute('open')===null)await details.locator('summary').click();
  await button(item).click();
}
async function selectField(key,label){
  await page.locator(`[data-select-trigger="${key}"]`).click();
  const dialog=page.locator('dialog[open]');
  await page.keyboard.press('Tab');
  assert.equal(await dialog.locator('button:focus-visible').evaluate(button=>getComputedStyle(button).textDecorationLine),'none');
  await dialog.getByRole('button',{name:label,exact:true}).click();
  await dialog.getByRole('button',{name:'Далее',exact:true}).click();
}
async function amount(value,next='next'){
  for(const digit of value)await page.keyboard.press(digit);
  await action(next).click();
}
async function beginExpense(value){
  await page.locator('[data-entry=expense]').click();
  await title('Расход');
  await amount(value);
}
async function category(name){
  await page.locator('[data-category]').filter({hasText:name}).first().click();
  await action('category-next').click();
}
async function addCategory(label,kind){
  await button('Создать категорию или подкатегорию').click();
  await button(kind==='child'?'Создать подкатегорию':'Создать категорию').click();
  if(kind==='child'){
    assert.equal(await action('parent-next').isEnabled(),false);
    await page.locator('[data-parent]').filter({hasText:'Учёба'}).click();
    await action('parent-next').click();
  }
  await page.locator('[data-name]').fill(label);
  await action('save-category').click();
  await title('Категория');
  assert.equal(await page.locator('[data-category][aria-pressed=true]').textContent(),label);
}
async function newAccount(name,opening,kind='bank'){
  await section('account-new').click();
  await section('account-type-set',kind).click();
  await section('account-type-next').click();
  await fill('name',name);
  await fill('opening',opening);
  await submit();
  await title(name);
  await back();
}
try{
  await page.clock.setFixedTime(new Date(2026,10,25,12));
  async function checkSheet(trigger) {
    await section(trigger).click();
    const sheet=page.locator('dialog.fu-action-sheet[open]');
    await sheet.waitFor();
    assert.ok(await sheet.evaluate(el=>document.activeElement===el),trigger+' initial focus');
    const actions=sheet.getByRole('button');
    for(let index=0;index<await actions.count();index++){
      await page.keyboard.press('Tab');
      const state=await actions.nth(index).evaluate(button=>{
        const style=getComputedStyle(button);
        return {focused:button===document.activeElement,decoration:style.textDecorationLine,filter:style.filter};
      });
      assert.deepEqual(state,{focused:true,decoration:'none',filter:'brightness(1.14)'},trigger);
    }
  }
  await page.goto(appUrl);
  await button('Сводка').waitFor();
  await beginExpense('300');
  await addCategory('Учёба','parent');
  await addCategory('Книги','child');
  await action('category-next').click();
  await page.locator('[data-date="2026-11-23"]').click();
  await back();
  await action('category-next').click();
  assert.equal(await page.locator('.fr-day[aria-pressed=true]').getAttribute('data-date'),'2026-11-25');
  await page.locator('[data-date="2026-11-24"]').click();
  await action('date-next').click();
  await action('save').click();

  await menu('Учёт','Операции');
  const layers=await page.locator('[data-screen=operations]').evaluate(screen=>{
    const header=screen.querySelector('.fr-header'),toolbar=screen.querySelector('.fr-toolbar');
    const list=screen.querySelector('.fr-operation-list');
    const fade=getComputedStyle(screen,'::before');
    return {backgrounds:[header,toolbar,list].map(el=>getComputedStyle(el).backgroundColor),
      gradient:fade.maskImage,fade:Number(fade.zIndex),toolbar:Number(getComputedStyle(toolbar).zIndex),
      startsBehind:list.getBoundingClientRect().top<header.getBoundingClientRect().bottom};
  });
  assert.ok(layers.backgrounds.every(value=>value==='rgba(0, 0, 0, 0)'));
  assert.match(layers.gradient,/linear-gradient/);
  assert.ok(layers.fade<layers.toolbar&&layers.startsBehind);
  const record=page.locator('[data-operation]').filter({hasText:'Книги'}).first();
  await action('filter-open').click();
  await action('filter-category').click();
  const filterChoice=name=>page.locator('[data-filter-id]').filter({hasText:name});
  await filterChoice('Учёба').click();
  await filterChoice('Продукты').click();
  assert.equal(await page.locator('[data-filter-id][aria-pressed=true]').count(),2);
  await action('filter-category-save').click();
  assert.match(await action('filter-category').textContent(),/2/);
  await action('filter-category').click();
  await filterChoice('Продукты').click();
  await back();
  assert.match(await action('filter-category').textContent(),/2/);
  await action('filter-apply').click();
  await record.click();
  await page.getByLabel('Изменить сумму').click();
  for(let i=0;i<3;i++)await page.keyboard.press('Backspace');
  await amount('450');
  await action('save').click();
  await record.click();
  assert.match(await page.locator('[data-edit=amount]').textContent(),/450/);
  await button('Отменить операцию').click();
  await action('cancel-confirm').click();
  await page.locator('.fr-operation-row.fr-cancelled').waitFor();
  await back();

  await menu('Планы и отчёты','Накопления');
  await section('goal-new').click();
  assert.equal(await page.locator('[data-goal-share]').count(),0);
  await fill('name','Отпуск');
  await fill('target','10000');
  await submit();
  await checkSheet('savings-more');
  await page.locator('[data-sheet-close]').click();
  await section('goal').filter({hasText:'Отпуск'}).click();
  await title('Отпуск');
  assert.match(await page.locator('.fr-goal-total .np-money').textContent(),/^0/);
  await back();await back();await back();
  await button('Сводка').click();
  await action('month-result-info').click();
  const savingsSwitch=page.getByRole('switch',{name:'Включать накопления в доступную сумму'});
  const startingToggle=await savingsSwitch.getAttribute('aria-checked');
  const originalSwitch=await savingsSwitch.elementHandle();
  await savingsSwitch.click();
  await page.waitForFunction(value=>{
    const control=document.querySelector('.fr-info-dialog[open] [role=switch]');
    return control&&control.getAttribute('aria-checked')!==value;
  },startingToggle);
  assert.ok(await originalSwitch.evaluate(node=>node.isConnected && node.closest('dialog').open));
  await page.mouse.click(4,4);
  await page.locator('.fr-info-dialog[open]').waitFor({state:'hidden'});
  await back();

  await menu('Планы и отчёты','Планы доходов');
  await section('income-new').click();
  await fill('amount','8000');
  assert.equal(await page.locator('[data-select-trigger=accountId]').count(),0);
  await selectField('categoryId','Зарплата');
  await submit();
  await button('Позже').click();
  await back();await back();
  await page.locator('[data-entry=income]').click();
  await section('income-pick','ordinary').click();
  await section('income-pick-next').click();
  await amount('1000');
  await category('Дополнительный доход');
  await action('date-next').click();
  await action('save').click();
  await page.locator('[data-entry=income]').click();
  await section('income-pick').filter({hasText:'Зарплата'}).click();
  await section('income-pick-next').click();
  await submit();
  assert.equal(await section('receipt-account-next').count(),0);
  await section('income-review-save').click();

  await menu('Учёт','Счета и кошельки');
  await newAccount('Карта','5000');
  await newAccount('Кошелёк','500','cash');
  await checkSheet('accounts-more');
  await section('accounts-archive').click();
  await title('Архив счетов');
  await back();
  await title('Счета и кошельки');
  assert.equal(await button('Действующие').count(),0);
  await checkSheet('accounts-more');
  await section('account-primary-picker').click();
  await section('account-primary-pick').filter({hasText:'Кошелёк'}).click();
  await section('account-primary-next').click();
  await back();await back();
  await beginExpense('1000');
  await category('Продукты');
  await action('date-next').click();
  assert.match(await page.locator('[data-account][aria-pressed=true]').textContent(),/Кошелёк/);
  assert.equal(await action('account-next').isDisabled(),true);
  await action('fund-expense').click();
  await section('transfer-pick').filter({hasText:'Карта'}).click();
  await section('transfer-picker-next').click();
  await section('transfer-next').click();
  await action('transfer-accept').click();
  await section('transfer-save').click();
  await title('Счёт');
  assert.equal(await action('account-next').isEnabled(),true);
  await action('account-next').click();
  await action('save').click();

  await menu('Учёт','Счета и кошельки');
  await section('account-new').click();
  await section('account-type-set','credit').click();
  await section('account-type-next').click();
  await fill('name','Кредитка');
  await fill('limit','8000');
  await submit();
  await title('Кредитка');
  await section('account-panel-actions').click();
  await section('credit-purchase').click();
  await amount('300');
  await category('Покупки');
  await action('date-next').click();
  await action('save').click();
  assert.match(normal(await page.locator('.fr-credit-total .np-money').textContent()),/7 700/);
  await section('account-panel-close').click();
  await back();await back();

  await menu('Учёт','Счета и кошельки');
  await checkSheet('accounts-more');
  await section('account-primary-picker').click();
  await section('account-primary-pick').filter({hasText:'Кредитка'}).click();
  await section('account-primary-next').click();
  await back();await back();
  await menu('Учёт','Категории');
  const island=page.getByRole('slider',{name:'Тип категорий'});
  await island.focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  const box=await island.boundingBox();
  const x=box.x+box.width*0.7,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-70,y,{steps:5});
  assert.equal(await island.evaluate(el=>el.style.getPropertyValue('--drag')),'0px');
  await page.mouse.up();
  assert.equal(await island.getAttribute('aria-valuetext'),'Доходы');
  await checkSheet('category-more');
  await section('category-parent').click();
  await section('category-parent-pick').filter({hasText:'Связь'}).click();
  await section('category-parent-next').click();
  await fill('name','Домашний интернет');
  await submit();
  await page.getByText('Домашний интернет',{exact:true}).waitFor();
  await back();
  await menu('Планы и отчёты','Платежи');
  await section('payment-new').click();
  await fill('name','Интернет');
  await fill('amount','400');
  await selectField('accountId','Карта');
  await section('form-category-open').click();
  await section('form-category-select').filter({hasText:'Связь'}).click();
  await section('form-category-next').click();
  await submit();
  await section('payment-detail').filter({hasText:'Интернет'}).click();
  await section('pay').click();
  await page.locator('[data-section-action=form-account]').click();
  await section('form-account-select').filter({hasText:'Карта'}).click();
  await section('form-account-next').click();
  await submit();
  await section('payment-final').click();
  await section('payment-choice-next').click();
  await page.getByText('История оплат',{exact:true}).waitFor();
  await back();await back();

  await menu('Настройки и помощь','Управление данными');
  await section('backup-export').click();
  const somePassword='test-only-long-password';
  await fill('password',somePassword);
  await submit();
  const dl=page.waitForEvent('download');
  await page.getByRole('link',{name:'Скачать резервную копию'}).click();
  const download=await dl;
  const localCopy=await download.path();
  assert.ok(localCopy);
  await back();
  await section('reset-options').click();
  await section('reset-custom').click();
  await page.getByRole('checkbox',{name:'Сохранить планы доходов'}).check();
  await selectField('payments','Сохранить только названия');
  await submit();
  await section('reset-final').click();
  await section('reset-apply').click();
  await button('Сводка').waitFor();
  await menu('Планы и отчёты','Платежи');
  await section('payment-template').filter({hasText:'Интернет'}).click();
  assert.equal(await page.locator('input[name=amount]').inputValue(),'');
  assert.equal(await page.locator('input[name=name]').inputValue(),'Интернет');
  await back();await back();
  await menu('Учёт','Счета и кошельки');
  const card=section('account').filter({hasText:'Карта'}).filter({hasNotText:'Кредитка'});
  assert.match(normal(await card.textContent()),/0 ₽/);
  await back();
  await menu('Настройки и помощь','Управление данными');
  await section('reset-options').click();
  await section('reset-all').click();
  await section('reset-final').click();
  await section('reset-apply').click();
  await button('Сводка').waitFor();
  await button('Сводка').click();
  assert.equal(normal(await page.locator('.fr-month-result .np-money').textContent()),'0 ₽');
  await back();

  await menu('Настройки и помощь','Управление данными');
  await section('backup-restore').click();
  await page.locator('input[type=file]').setInputFiles({name:'test.json',mimeType:'application/json',buffer:await (await import('node:fs/promises')).readFile(localCopy)});
  await fill('password','wrong-password-for-test');
  await submit();
  await page.getByRole('alert').filter({hasText:'Проверьте пароль'}).waitFor();
  await page.locator('input[type=file]').setInputFiles({name:'test.json',mimeType:'application/json',buffer:await (await import('node:fs/promises')).readFile(localCopy)});
  await fill('password',somePassword);
  await submit();
  await button('Сводка').waitFor();
  await button('Сводка').click();
  assert.equal(normal(await page.locator('.fr-month-result .np-money').textContent()),'7 300 ₽');
  await back();
  await menu('Планы и отчёты','Планы доходов');
  const planRow=section('income-source').filter({hasText:'Зарплата'});
  await planRow.click();
  await section('income-stop').click();
  await section('income-stop-keep').click();
  await section('income-restore').waitFor();
  await back();
  assert.equal(await planRow.count(),0);
  await checkSheet('income-plans-more');
  await section('income-plans-archive').click();
  await planRow.click();
  await section('income-restore').click();
  await title('Архив планов');
  assert.equal(await planRow.count(),0);
  await back();
  await planRow.waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS categories, edit and cancel, abandoned date, no-account plan, primary account, shortfall transfer, credit purchase, payment, savings, encrypted backup / wrong password / reset / restore');
}finally{
  await browser.close();
}
