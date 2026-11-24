import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const baseline='8fd14ef2dd5951069b03022751cf076738da8819';
const results=process.env.FINRATE_UX_SCREENSHOTS || 'verification/ux-audit';
const cached=new Map();
const formats={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
let before=false;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(path,res))return;
  const name=path.slice(scope.length)||'index.html';
  if(!path.startsWith(scope)||!/^[a-z0-9-]+\.(html|js|css|png|webmanifest)$/.test(name))return res.writeHead(404).end();
  try{
    if(before&&!cached.has(name))cached.set(name,execFileSync('git',['show',baseline+':'+name],{stdio:['ignore','pipe','ignore']}));
    const bytes=before?cached.get(name):await readFile(join('site',name));
    res.writeHead(200,{'Content-Type':formats[name.split('.').at(-1)]}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+scope;

function contrast(a,b){
  const luminance=css=>{
    const values=css.match(/\d+/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
    return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
  };
  const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (values[0]+0.05)/(values[1]+0.05);
}
async function audit(browser,view,theme,version){
  const context=await browser.newContext({viewport:view,colorScheme:theme,isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'UTC'});
  try{
    const page=await context.newPage();
    page.setDefaultTimeout(7500);
    await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
    await fixture(page,url,'audit');
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    const button=name=>page.getByRole('button',{name,exact:true});
    const heading=name=>page.getByRole('heading',{name,exact:true}).waitFor();
    const section=(action,id)=>page.locator(`[data-section-action="${action}"]${id===undefined?'':`[data-id="${id}"]`}`);
    const back=()=>button('Назад').click();
    const menu=async(group,item)=>{
      await button('Открыть меню').click();
      const summary=page.locator(`[data-menu-group="${group}"] summary`);
      if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();
      if(item)await button(item).click();
    };
    let shots=0;
    async function shot(name){
      const surface=page.locator('.fr-app');
      const geometry=await surface.evaluate(node=>({
        width:node.clientWidth,height:node.clientHeight,overflow:node.scrollWidth-node.clientWidth,
        pageOverflow:document.documentElement.scrollWidth-innerWidth
      }));
      assert.deepEqual(geometry,{...view,overflow:0,pageOverflow:0},name+' '+version);
      await surface.screenshot({path:join(results,`${view.width}-${theme}-${name}-${version}.png`),animations:'disabled'});
      shots++;
    }
    await page.goto(url);
    await button('Сводка').waitFor();
    assert.equal(page.url(),url);
    assert.equal(await page.title(),'FinRate Full');
    await shot('home');
    await button('Сводка').click();
    await shot('summary');
    if(!before){
      const contrastColors=await page.locator('.fr-summary-category .fr-muted').first().evaluate(label=>[
        getComputedStyle(label).color,getComputedStyle(label.closest('.fr-app')).backgroundColor
      ]);
      assert.ok(contrast(...contrastColors)>=4.5);
      assert.ok(await page.locator('.fr-month-result .np-money').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>
        await section('received').locator('.np-money').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)));
    }
    await section('month','-1').click();
    if(!before){
      const fills=await page.locator('.fr-summary-category .fr-category-meter span').evaluateAll(items=>items.map(item=>item.style.width));
      assert.ok(fills.length>0&&fills.every(width=>width==='0%'));
    }
    await shot('summary-zero');
    if(!before)await button('Ещё').click();
    await section('received').click();await heading('Получено');
    if(!before)assert.equal(await page.getByText('Получено',{exact:true}).count(),1);
    await back();if(!before)await button('Закрыть').click();await section('month','1').click();
    if(!before)await button('Ещё').click();
    await section('received').click();await heading('Получено');
    await shot('received');
    await back();
    if(!before)await button('Закрыть').click();
    await section('share','home').click();
    await shot('category-share');
    if(!before){
      assert.equal(await page.locator('.fr-budget-bar').count(),1);
      assert.match(await page.locator('[data-share-room]').innerText(),/Для категории доступно/);
    }
    await back();
    if(!before){
      await section('budget-settings').click();
      for(const action of ['distribution','income-plans','slider-step'])assert.equal(await section(action).count(),0);
      await back();
      await button('Ещё').click();
      assert.ok(await section('summary-accounts').isVisible());
    }else{
      await section('budget-settings').click();
      await section('money').locator('svg').click();await heading('Можно тратить');
    }
    await shot('available');
    await section('savings').click();
    await shot('savings');
    await section('goal','holiday').click();
    await shot('goal');
    if(!before){
      await page.getByText('Доступно потратить',{exact:true}).waitFor();
      await page.getByText('До цели',{exact:true}).waitFor();
    }
    await back();await back();
    if(before){
      await back();await back();
    }else await button('Закрыть').click();
    await back();

    await menu('Планы и отчёты');
    if(!before)assert.equal(await button('Распределение плана').count(),0);
    await shot('menu');
    await button('Планы доходов').click();
    await shot('income-plans');
    if(!before){
      const event=section('income-occurrence','salary-plan:2026-11');
      assert.match(await event.innerText(),/Получено частично[\s\S]*Осталось получить[\s\S]*60.000/);
      assert.match(await section('income-source','salary-plan').innerText(),/По плану[\s\S]*85.000/);
    }
    await section('distribution').click();
    await shot('distribution');
    const shares=page.locator('[data-share-input]');
    for(let i=0;i<await shares.count();i++)await shares.nth(i).fill('0');
    assert.match(await page.locator('[data-share-free]').innerText(),/100%/);
    await shot('distribution-zero');
    await shares.first().fill('100');
    assert.match(await page.locator('[data-share-free]').innerText(),/0%/);
    assert.ok(await button('Сохранить').isEnabled());
    await shot('distribution-full');
    await back();
    if(!before){
      const actions=page.locator('.fr-unsaved-actions button');
      assert.equal(await actions.count(),2);
      assert.ok(await actions.first().evaluate(el=>el.classList.contains('fr-primary')));
    }
    await button('Выйти без сохранения').click();
    await heading('Планы доходов');
    await back();
    await button('Платежи').click();
    for(const [key,variant] of [['due','due'],['paid','paid'],['planned','planned']]){
      await section('tab',key).click();
      await shot('payments-'+variant);
      if(!before){
        const label=key==='planned'?'План платежей':'Состояние оплаты';
        assert.ok(await page.getByRole('group',{name:label}).locator('[aria-pressed=true]').isVisible());
        if(key==='planned')await page.getByText('Приостановленные',{exact:true}).waitFor();
      }
    }
    await section('tab','due').click();await section('month','-1').click();
    await page.getByText('Платежей пока нет.',{exact:true}).waitFor();
    await shot('payments-empty');
    await back();
    await button('Закрыть меню').click();

    await menu('Учёт','Категории');
    const rows=page.locator('[data-section-scroll]');
    const searchIsland=page.getByRole('searchbox');
    const typeIsland=page.getByRole('slider',{name:'Тип категорий'});
    const beforeScroll=!before&&await Promise.all([searchIsland.boundingBox(),typeIsland.boundingBox()]);
    await rows.evaluate(el=>el.scrollTop=el.scrollHeight);
    if(!before){
      assert.deepEqual(await Promise.all([searchIsland.boundingBox(),typeIsland.boundingBox()]),beforeScroll);
      assert.equal(await typeIsland.evaluate(el=>getComputedStyle(el).position),'absolute');
      const sizes=await rows.evaluate(el=>({list:el.getBoundingClientRect().bottom,view:el.parentElement.getBoundingClientRect().bottom}));
      assert.equal(sizes.list,sizes.view);
    }
    const last=section('category','zz-long-expense');
    const visible=await last.evaluate(el=>({
      item:el.getBoundingClientRect().bottom,tab:document.querySelector('.fr-category-carousel, .fr-category-tab-island').getBoundingClientRect().top
    }));
    if(!before)assert.ok(visible.item<=visible.tab,JSON.stringify(visible));
    await shot('categories-last');
    await page.getByRole('searchbox').fill('Продукты');
    await section('category','food').click();
    if(!before){
      const subcategories=page.getByRole('region',{name:'Подкатегории',exact:true});
      await subcategories.getByRole('button',{name:'Супермаркеты',exact:true}).click();
      await heading('Супермаркеты');
      await back();
      await subcategories.waitFor();
    }
    await section('share','food').click();
    await heading('Продукты');
    await page.getByRole('textbox',{name:'Процент Продукты'}).waitFor();
    await back();await heading('Продукты');
    await back();
    assert.equal(await page.getByRole('searchbox').inputValue(),'Продукты');
    await back();await button('Счета и кошельки').click();
    await section('account','sample-credit').click();
    await shot('credit');
    if(!before)await page.locator('.fr-account-total').getByText('Можно потратить',{exact:true}).waitFor();
    await back();await section('account','sample-zero').click();
    await shot('credit-zero');
    if(!before){
      assert.ok(await button('Погасить долг').isDisabled());
    }
    await back();await section('account','card').click();
    if(!before)await button('Ещё').click();
    await section('account-history').click();
    const cancelled=page.locator('[data-operation=audit-cancelled]');
    await cancelled.scrollIntoViewIfNeeded();
    await shot('account-history');
    if(!before){
      assert.equal(await cancelled.locator('.fr-operation-name').innerText(),'Расход');
      assert.equal(await cancelled.locator('.fr-operation-status').innerText(),'Операция отменена');
      assert.match(await cancelled.locator('.fr-operation-category').innerText(),/Ярмарка/);
    }
    await cancelled.click();
    await button('Заметка').click();
    assert.match(await page.getByRole('textbox',{name:'Текст заметки'}).inputValue(),/\nВторая строка заметки\./);
    await back();await back();await back();
    if(!before)await page.keyboard.press('Escape');
    await back();await back();
    await button('Операции').click();
    const query='Сценарий поиска и проверки короткого экрана';
    const search=page.getByRole('searchbox');
    await search.fill(query);
    await button('Фильтры').click();
    await page.locator('[name=kind]').selectOption('expense');
    await button('Показать').click();
    assert.equal(await search.inputValue(),query);
    const filters=button('Фильтры · 1');
    await search.focus();await page.keyboard.press('Tab');
    assert.equal(await filters.evaluate(el=>el===document.activeElement),true);
    if(!before){
      assert.ok(await search.evaluate(el=>el.getBoundingClientRect().width)>=150);
      assert.ok(await filters.evaluate(el=>el.getBoundingClientRect().height)>=44);
      assert.equal(await filters.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      assert.equal(await filters.locator('.fr-filter-count').innerText(),'1');
    }
    await shot('operations-search');
    await back();
    await button('Перевод').click();
    assert.ok(await button('Далее').isDisabled());
    await section('transfer-source').click();
    {const option=section('transfer-pick','long-account');await (before?option.locator('svg'):option).click();}
    await section('transfer-target').click();
    {const option=section('transfer-pick','long-target');await (before?option.locator('svg'):option).click();}
    await section('transfer-swap').click();
    await shot('transfer-selected');
    await button('Далее').click();
    await page.keyboard.type('123456789,99');
    await button('Далее').click();
    await shot('transfer-review');
    if(!before)await page.getByRole('button',{name:'Изменить сумму перевода'}).waitFor();

    await page.goto(url);
    await page.locator('[data-entry=income]').click();
    if(before){
      await heading('Ожидаемые доходы');
      await section('income-occurrence','salary-plan:2026-11').click();
      await heading('Зарплата');
      await back();await heading('Ожидаемые доходы');
    }else{
      await button('Записать запланированный доход').click();
      await heading('Запланированные доходы');
      await section('income-due-pick','salary-plan:2026-11').click();
      await heading('Записать поступление');
      await back();await heading('Запланированные доходы');
    }
    assert.deepEqual(errors,[]);
    console.log('PASS UX',version,view.width,theme,shots,'captures, navigation, focus and console');
  }finally{
    await context.close();
  }
}

let browser;
try{
  await mkdir(results,{recursive:true});
  browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
  for(const [width,height] of [[320,568],[390,844]])for(const theme of ['light','dark']){
    for(const version of ['before','after']){
      before=version==='before';
      await audit(browser,{width,height},theme,version);
    }
  }
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
