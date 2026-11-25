import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const mime={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',webmanifest:'application/manifest+json',png:'image/png'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(path,res))return;
  const name=path.slice(scope.length)||'index.html';
  try {
    if(!path.startsWith(scope)||!/^[a-z0-9-]+\.(html|js|css|webmanifest|png)$/.test(name))return res.writeHead(404).end();
    const bytes=await readFile('site/'+name);
    res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)]}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+scope;
let browser;
try {
  browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
  for(const [width,height,colorScheme] of [[320,568,'light'],[390,844,'dark']]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true,colorScheme});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(5000);
    await page.clock.setFixedTime(new Date(2026,10,25,12));
    const seeded=await fixture(page,url,'audit');
    await page.goto(url);
    const button=name=>page.getByRole('button',{name,exact:true});
    const section=action=>page.locator('[data-section-action="'+action+'"]');
    const knob=page.locator('.fr-knob');
    for(const [direction,pseudo] of [[-1,'::before'],[1,'::after']]){
      const box=await knob.boundingBox();
      const x=box.x+box.width/2,y=box.y+box.height/2;
      await page.mouse.move(x,y);
      await page.mouse.down();
      await page.mouse.move(x,y+direction*73,{steps:5});
      await page.waitForFunction(side=>Number(getComputedStyle(document.querySelector('.fr-track-glow'),side).opacity)>.08,pseudo);
      assert.equal(await knob.evaluate((el,side)=>getComputedStyle(el,side).opacity,pseudo),'0');
      await page.mouse.move(x,y+direction*115);
      await page.waitForFunction(side=>getComputedStyle(document.querySelector('.fr-knob'),side).opacity==='1',pseudo);
      await page.mouse.move(x,y);
      assert.equal(await knob.evaluate((el,side)=>getComputedStyle(el,side).opacity,pseudo),'0');
      await page.mouse.up();
    }

    await button('Сводка').tap();
    const gear=page.locator('.fr-summary-settings path');
    const shape=await gear.evaluate(el=>{const {width,height}=el.getBBox();return {width,height};});
    assert.ok(Math.abs(shape.width-shape.height)<.02);
    const info=page.locator('.fr-info-dialog');
    for(let i=0;i<3;i++){
      await button('Как считается результат месяца').tap();
      await info.waitFor({state:'visible'});
      await page.touchscreen.tap(2,2);
      await info.waitFor({state:'hidden'});
    }
    await button('Ещё').tap();
    await section('summary-plans').tap();
    await button('Распределение плана').tap();
    assert.match(await page.locator('.fr-plan-basis').innerText(),/85\s000/);
    const sliders=page.locator('[data-share-slider]:not([data-id=home])');
    const neighbors=()=>sliders.evaluateAll(elements=>elements.map(el=>[el.dataset.id,el.value,el.max]));
    const initial=await neighbors();
    const slider=page.locator('[data-share-slider][data-id=home]');
    await slider.scrollIntoViewIfNeeded();
    const rect=await slider.boundingBox();
    await page.mouse.move(rect.x+rect.width*.25,rect.y+rect.height/2);
    await page.mouse.down();
    for(const portion of [.15,.32,.22]){
      await page.mouse.move(rect.x+rect.width*portion,rect.y+rect.height/2,{steps:3});
      assert.deepEqual(await neighbors(),initial);
    }
    await page.mouse.up();
    const share=page.locator('[data-share-input][data-id=home]');
    assert.notEqual(await share.inputValue(),'25');
    await share.fill('50');
    assert.ok(await button('Сохранить').isDisabled());
    assert.deepEqual(await neighbors(),initial);
    await share.fill('25');
    assert.equal(await page.locator('[data-share-total]').innerText(),'95%');
    await button('Назад').tap();
    await button('Назад').tap();
    await section('savings').tap();
    await button('Новая цель').tap();
    await page.locator('[data-goal-share]').press('End');
    assert.equal(await page.locator('[data-goal-chosen]').innerText(),'5%');
    assert.equal(await page.locator('[data-goal-free]').innerText(),'0%');
    await page.locator('[name=name]').fill('Резерв');
    await page.locator('[name=target]').fill('30000');
    await button('Сохранить').tap();
    await page.getByRole('button',{name:/Резерв/}).waitFor();
    const persisted=await fixture(page,url);
    const goal=persisted.categories.find(category=>category.name==='Резерв');
    const after=persisted.rates.find(rate=>rate.month==='2026-11').shares;
    const {[goal.id]:added,...previous}=after;
    assert.equal(added,500);
    assert.deepEqual(previous,seeded.rates.find(rate=>rate.month==='2026-11').shares);
    assert.deepEqual(persisted.balances,seeded.balances);
    assert.deepEqual(persisted.operations,seeded.operations);
    await page.goto(url);
    await button('Сводка').tap();
    await button('Ещё').tap();
    await section('summary-accounts').tap();
    await button('Добавить счёт').tap();
    await page.locator('[data-select-trigger=kind]').tap();
    const options=page.locator('.fr-select-popover');
    assert.equal(await options.evaluate(el=>document.activeElement===el),true);
    await button('Кредитная карта').tap();
    await page.getByLabel('Количество месяцев').waitFor();
    await page.locator('[data-select-trigger=mode]').tap();
    await button('Дней после покупки').tap();
    await page.getByLabel('Количество дней').waitFor();
    await page.locator('[data-select-trigger=mode]').tap();
    await button('По выписке').tap();
    await page.locator('[name=days]').waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    console.log('PASS',width,height,colorScheme,'isolated sliders, plan, goal, glow and popover');
    await page.close();
  }
}finally{await browser?.close();server.close();}
