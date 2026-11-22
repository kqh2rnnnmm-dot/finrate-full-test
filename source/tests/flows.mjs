import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {budgetBar} from '../src/screens.mjs';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const location=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(location,res))return;
  if(!location.startsWith(scope))return res.writeHead(404).end();
  const name=location.slice(scope.length)||'index.html';
  if(!/^[a-z0-9-]+\.(html|js|css|webmanifest|png)$/.test(name))return res.writeHead(404).end();
  try{
    const bytes=await readFile('site/'+name);
    res.writeHead(200,{'Content-Type':mime[name.slice(name.lastIndexOf('.'))]}).end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+scope;
let browser;
try{
  browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
  for(const [width,height] of [[320,568],[390,844]])for(const mode of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,colorScheme:mode,reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(6000);
    await fixture(page,url,'regression');
    await page.goto(url);
    const button=name=>page.getByRole('button',{name,exact:true});
    const title=name=>page.getByRole('heading',{name,exact:true}).waitFor();
    const back=()=>button('Назад').click();
    async function geometry() {
      const overflow=await page.locator('.fr-screen').evaluate(el=>({
        x:el.scrollWidth-el.clientWidth,
        outer:document.documentElement.scrollWidth-innerWidth
      }));
      assert.ok(overflow.x<=1&&overflow.outer<=1,JSON.stringify(overflow));
    }
    await button('Сводка').waitFor();
    await geometry();
    await page.screenshot({path:'/tmp/finrate-restart-home-'+width+'.png'});
    await button('Открыть меню').click();
    await page.getByText('Учёт',{exact:true}).click();
    await button('Категории').click();
    await title('Категории');
    await back();
    assert.equal(await page.locator('details[open]').getAttribute('data-menu-group'),'Учёт');
    await button('Закрыть меню').click();

    if(mode==='dark'){
      const knob=await page.locator('.fr-knob').boundingBox();
      const x=knob.x+knob.width/2,y=knob.y+knob.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-106,{steps:10});await page.mouse.up();
    }else await page.locator('[data-entry=expense]').tap();
    await title('Расход');
    assert.equal(await button('Далее').isDisabled(),true);
    for(const key of ['1','2','Запятая','5'])await button(key).click();
    await button('Далее').click();
    await title('Категория');
    await page.getByRole('searchbox').fill('супермаркет');
    await button('Супермаркеты').click();
    await button('Сегодня').click();
    await title('Счёт');
    await page.locator('[data-account=card]').click();
    await page.locator('[data-action=account-next]').click();
    await title('Расход');
    await geometry();
    await page.screenshot({path:'/tmp/finrate-restart-review-'+width+'.png'});
    await button('Добавить заметку').click();
    await page.getByRole('textbox',{name:'Текст заметки'}).fill('Две строки\nПродолжение');
    await button('Готово').click();
    await button('Сохранить').click();
    await button('Сводка').waitFor();

    if(width===390){
      const knob=await page.locator('.fr-knob').boundingBox();
      const x=knob.x+knob.width/2,y=knob.y+knob.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+106,{steps:10});await page.mouse.up();
    }else await page.locator('[data-entry=income]').tap();
    await title('Записать доход');
    await button('Другой доход').click();
    await title('Доход');
    await page.keyboard.type('500');
    await button('Далее').click();
    await button('Аванс').click();
    await button('Сегодня').click();
    await page.locator('[data-account=cash]').click();
    await page.locator('[data-action=account-next]').click();
    await button('Изменить сумму').click();
    await button('Удалить цифру').click();
    await button('Далее').click();
    await button('Сохранить').click();
    await button('Сводка').waitFor();

    await button('Сводка').click();
    assert.match(await page.locator('.fr-month-result').innerText(),/37,5/);
    await button('Ещё').click();
    await page.locator('[data-section-action=received]').click();
    assert.equal(await page.locator('[data-operation]').count(),1);
    assert.match(await page.locator('[data-operation]').innerText(),/Аванс/);
    await page.locator('[data-operation]').click();
    await button('Изменить сумму').click();
    await button('1').click();
    await button('Далее').click();
    await back();
    await title('Выйти без сохранения?');
    await button('Выйти без сохранения').click();
    await title('Получено');
    assert.match(await page.locator('[data-operation]').innerText(),/50/);
    await back();
    await button('Закрыть').click();
    await back();

    await button('Открыть меню').click();
    await button('Операции').click();
    await page.getByRole('searchbox').fill('Продолжение');
    assert.equal(await page.locator('[data-operation]').count(),1);
    await page.locator('[data-operation]').click();
    await button('Отменить операцию').click();
    await button('Отменить операцию').click();
    await title('Операции');
    assert.match(await page.locator('[data-operation]').innerText(),/отменена/);
    await back();
    await button('Закрыть меню').click();
    await button('Сводка').click();
    assert.match(await page.locator('.fr-month-result').innerText(),/50/);

    const existing=await page.evaluate(async()=> (await indexedDB.databases()).map(db=>db.name).sort());
    assert.deepEqual(existing,['finrate-full-test-restart-v1']);
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await context.setOffline(true);
    await page.reload();
    await button('Сводка').click();
    await button('Ещё').click();
    await page.locator('[data-section-action=received]').click();
    assert.equal(await page.locator('[data-operation]').count(),1);
    assert.deepEqual(errors,[]);
    await back();
    await button('Закрыть').click();
    const resultFont=await page.locator('.fr-month-result strong').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(resultFont>=28,'Monthly result is the largest amount');
    const meter=page.locator('[data-test-meter] .fr-category-meter');
    await page.locator('[data-section-scroll]').evaluate((el,markup)=>{
      el.insertAdjacentHTML('afterbegin', '<div data-test-meter>'+markup+'</div>');
    },budgetBar(10000,20000,10000));
    const marker=await meter.evaluate(el=>{
      const bar=el.getBoundingClientRect();
      const spent=el.lastElementChild.getBoundingClientRect();
      return {width:bar.width,height:bar.height,spentWidth:spent.width,
        left:spent.left-bar.left,color:getComputedStyle(el).backgroundColor};
    });
    assert.equal(marker.left,0);
    assert.equal(marker.height,20);
    assert.ok(Math.abs(marker.spentWidth-marker.width/2)<1);
    assert.equal(marker.color,mode==='dark'?'rgb(243, 116, 124)':'rgb(191, 66, 76)');
    await page.locator('[data-test-meter]').evaluate(el=>el.remove());
    const monthBefore=await page.locator('.fr-month-title').innerText();
    const nextMonth=button('Следующий месяц');
    const nextMonthBox=await nextMonth.boundingBox();
    await button('Как считается результат месяца').click();
    await page.getByRole('dialog').waitFor();
    await page.touchscreen.tap(nextMonthBox.x+nextMonthBox.width/2,nextMonthBox.y+nextMonthBox.height/2);
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('.fr-month-title').innerText(),monthBefore);
    await nextMonth.click();
    assert.notEqual(await page.locator('.fr-month-title').innerText(),monthBefore);
    await back();
    await page.locator('[data-entry=expense]').tap();
    for(const key of ['1','0','0'])await button(key).tap();
    await button('Далее').click();
    await page.getByRole('searchbox').fill('супермаркет');
    await button('Супермаркеты').click();
    await button('Сегодня').click();
    const accountNext=page.locator('[data-action=account-next]');
    assert.equal(await accountNext.isEnabled(),true);
    await page.locator('[data-account=spare]').tap();
    assert.equal(await accountNext.isDisabled(),true);
    await button('Сделать перевод').click();
    await title('Откуда');
    await page.locator('[data-section-action=transfer-pick][data-id=card]').click();
    const destination=page.locator('[data-section-action=transfer-target]');
    assert.equal(await destination.isDisabled(),true);
    assert.match(await destination.innerText(),/Запасная карта/);
    await page.locator('[data-section-action=transfer-next]').click();
    await page.locator('[data-action=transfer-accept]').click();
    await button('Перевести').click();
    await title('Счёт');
    assert.equal(await page.locator('[data-account=spare]').getAttribute('aria-pressed'),'true');
    await accountNext.click();
    await button('Сохранить').click();
    await button('Сводка').waitFor();
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS',width,height,mode,'оба ввода, редактирование, отмена, сводка, сохранение без сети');
  }
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
