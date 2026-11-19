import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const references=process.env.FINRATE_REFERENCES;
assert.ok(references,'Set FINRATE_REFERENCES to the extracted UI_Lab directory');
const results=process.env.FINRATE_PATCH04_SCREENSHOTS || 'verification/patch-04';
const samples={layout:'LAYOUT_FOLLOWUP_CANDIDATE.html',credit:'CREDIT_ARCHIVE_CANDIDATE.html'};
const layout=await readFile(join(references,samples.layout),'utf8');
assert.equal(createHash('sha256').update(layout).digest('hex'),'62666e36b71b71d7c0de474f36a645178e4b137bdbb2822f2bc815805f17d705');
const credit=await readFile(join(references,samples.credit),'utf8');
const types={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};

const layoutHarness=`window.sample={
  goal(screen){
    const g={id:'holiday',categoryId:'holiday',name:'Отпуск',targetMinor:15000000,accumulatedMinor:5000000,spentMinor:2000000};
    demoOperations.splice(0,demoOperations.length,{id:'spent-holiday',type:'expense',date:'2026-11-19',amount:'20000',account:'Карта',
      category:{type:'expense',parentId:'holiday',parentName:'Отпуск'}});
    if(screen==='quick-goal-history-detail'){
      g.closedAt='2026-11-19T12:00:00Z';
      g.closure={name:g.name,date:'2026-11-19',targetMinor:g.targetMinor,accumulatedMinor:g.accumulatedMinor,spentMinor:g.spentMinor,
        releasedMinor:3000000,operationIds:['spent-holiday'],records:[{id:'spent-holiday',amount:'20000',date:'2026-11-19',account:'Карта',cancelled:false}]};
    }
    quickSavingsGoals.splice(0,quickSavingsGoals.length,g);
    quickGoalId=g.id;route=screen;render();
  },
  share(){
    categoryCatalog.expense.splice(0,categoryCatalog.expense.length,{id:'other',name:'Прочие расходы',percent:0,children:[]},{id:'rest',name:'Остальные',percent:95,children:[]});
    expectedIncomePlans.splice(0,expectedIncomePlans.length,{schedules:[{amount:'85000'}]});
    npSelected='other';npTrail=[{route:'np-summary'}];npDraft={other:'',rest:'95'};npInitial=JSON.stringify(npDraft);route='np-detail';render();
  }
};`;
const creditHarness=`window.sample={credit(){
  const card=accountOptions.find(a=>a.type==='credit');
  Object.assign(card,{name:'Покупки по выписке',limit:'50000',available:'50000',debt:'0',own:'250',dueParts:[]});
  openAccountDetail(card.name);
}};`;

function instrument(html,harness){
  const marker='})();\n</script>';
  assert.ok(html.includes(marker));
  return html.replace(marker,()=>harness+marker);
}

const prior='8fd14ef2dd5951069b03022751cf076738da8819';
const priorFiles=new Map();
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(path,res))return;
  try{
    if(path==='/layout'||path==='/credit'){
      const body=path==='/layout'?instrument(layout,layoutHarness):instrument(credit,creditHarness);
      return res.writeHead(200,{'Content-Type':types.html}).end(body);
    }
    const legacy=path.startsWith('/before/');
    const name=path.slice(legacy?'/before/'.length:scope.length)||'index.html';
    if((!legacy&&!path.startsWith(scope))||!/^[a-z0-9-]+\.(html|js|css|png|webmanifest)$/.test(name))return res.writeHead(404).end();
    if(legacy&&!priorFiles.has(name))priorFiles.set(name,execFileSync('git',['show',prior+':'+name]));
    res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)]}).end(legacy?priorFiles.get(name):await readFile(join('site',name)));
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
const url=origin+scope;
await mkdir(results,{recursive:true});
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
const date=new Date('2026-11-19T12:00:00Z');

try{
  for(const [width,height] of [[320,568],[390,844]])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,colorScheme:theme,reducedMotion:'reduce'});
    const app=await context.newPage();
    const errors=[];
    app.on('pageerror',error=>errors.push(error.message));
    await app.clock.setFixedTime(date);
    app.setDefaultTimeout(6500);
    await fixture(app,url,'patch04');
    await app.goto(url);
    const button=name=>app.getByRole('button',{name,exact:true});
    const title=name=>app.getByRole('heading',{name,exact:true,level:1}).waitFor();
    const control=(action,id)=>app.locator(`[data-section-action="${action}"]${id?'[data-id="'+id+'"]':''}`);
    const back=()=>button('Назад').click();
    const openManage=()=>button('Управление накоплением').click();
    const capture=width===390&&theme==='light';
    const shot=(page,name)=>capture?page.locator('.fr-app').screenshot({path:join(results,name+'.png'),animations:'disabled'}):Promise.resolve();

    await button('Сводка').click();
    const scroll=app.locator('[data-section-scroll]');
    const category=control('share','other');
    await category.evaluate(el=>el.scrollIntoView({block:'center'}));
    const summaryScroll=await scroll.evaluate(el=>el.scrollTop);
    await category.click();
    const available=app.locator('[data-share-room]');
    const input=app.getByRole('textbox',{name:'Процент Прочие расходы'});
    const slider=app.getByRole('slider',{name:'Ползунок Прочие расходы'});
    assert.equal(await available.innerText(),'Для категории доступно 5%');
    await shot(app,'03-share-result');
    await input.fill('3');
    assert.equal(await slider.inputValue(),'3');
    assert.equal(await available.innerText(),'Для категории доступно 5%');
    await slider.press('ArrowRight');
    assert.equal(await input.inputValue(),'4');
    await back();
    await button('Выйти без сохранения').click();
    await title('Сводка');
    assert.equal(await scroll.evaluate(el=>el.scrollTop),summaryScroll);
    await category.evaluate(el=>el.scrollIntoView({block:'center'}));
    const saveScroll=await scroll.evaluate(el=>el.scrollTop);
    await category.click();
    assert.ok(['','0'].includes(await input.inputValue()));
    await input.fill('2');
    await button('Сохранить').click();
    await title('Сводка');
    assert.equal(await scroll.evaluate(el=>el.scrollTop),Math.min(saveScroll,await scroll.evaluate(el=>el.scrollHeight-el.clientHeight)));
    await category.click();
    assert.equal(await input.inputValue(),'2');
    assert.equal(await available.innerText(),'Для категории доступно 5%');
    await back();

    await button('Накопления').click();
    await control('goal','holiday').click();
    assert.equal(await app.locator('progress').getAttribute('value'),'5000000');
    for(const label of ['Доступно потратить','До цели'])await app.getByText(label,{exact:true}).waitFor();
    assert.equal(await control('goal-close').count(),0);
    await shot(app,'02a-goal-result');
    await button('Расходы цели').click();
    await title('Расходы');
    await app.locator('[data-operation=spent-holiday]').waitFor();
    await back();
    await openManage();
    await title('Управление');
    assert.deepEqual(await app.locator('.fr-goal-management button').allTextContents(),
      ['Пополнить','Добавить расход','Изменить категорию','Цель достигнута']);
    await shot(app,'02b-management-result');
    await button('Пополнить').click();await title('Пополнить');await back();await title('Управление');
    await button('Добавить расход').click();await back();await title('Управление');
    await button('Изменить категорию').click();
    await app.locator('[name=target]').fill('160000');
    await button('Сохранить').click();await title('Управление');
    await button('Изменить категорию').click();
    assert.equal(await app.locator('[name=target]').inputValue(),'160000');
    await app.locator('[name=target]').fill('150000');
    await button('Сохранить').click();await title('Управление');
    await button('Цель достигнута').click();await back();await title('Управление');
    await button('Цель достигнута').click();await button('Цель достигнута').click();
    await title('История накоплений');
    await control('closed-goal','holiday').click();
    for(const value of ['Накоплено и потрачено · 19 нояб. 2026','50 000 ₽','20 000 ₽','30 000 ₽'])await app.getByText(value,{exact:true}).first().waitFor();
    const disclosure=app.locator('[data-closed-expenses]');
    const operation=app.locator('[data-operation=spent-holiday]');
    assert.equal(await operation.isVisible(),false);
    await disclosure.locator('summary').click();
    await operation.waitFor();
    await shot(app,'01-history-result');
    await operation.click();
    await button('Отменить операцию').waitFor();
    await back();
    await operation.waitFor();
    await back();
    await control('closed-goal','old-1').evaluate(el=>el.scrollIntoView({block:'center'}));
    const historyScroll=await scroll.evaluate(el=>el.scrollTop);
    assert.ok(historyScroll>0);
    await control('closed-goal','old-1').click();
    assert.equal(await app.locator('[data-closed-expenses]').count(),0);
    await back();
    assert.equal(await scroll.evaluate(el=>el.scrollTop),historyScroll);
    await back();
    await control('goal','notebook').click();await openManage();
    await button('Цель достигнута').click();await button('Цель достигнута').click();
    await control('closed-goal','notebook').click();
    await app.getByText('Накоплено · 19 нояб. 2026',{exact:true}).waitFor();
    assert.equal(await app.locator('[data-closed-expenses]').count(),0);
    const saved=await fixture(app,url);
    assert.deepEqual(saved.goals.find(g=>g.categoryId==='holiday').closed.operationRefs.map(ref=>ref.id),['spent-holiday']);
    assert.deepEqual(saved.goals.find(g=>g.categoryId==='notebook').closed.operationRefs,[]);

    async function accounts(page){
      await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
      await page.getByText('Учёт',{exact:true}).click();
      await page.getByRole('button',{name:'Счета и кошельки',exact:true}).click();
    }
    await app.goto(url);
    await accounts(app);
    await control('account','sample-zero').click();
    assert.equal(await app.getByText('Долга нет',{exact:true}).count(),1);
    assert.equal(await control('credit-repay').count(),0);
    await shot(app,'04-credit-result');
    await button('Указать сумму по выписке').click();await title('Сумма по выписке');await back();
    await back();await control('account','sample-credit').click();
    assert.ok(await button('Погасить').isEnabled());
    assert.ok(await button('Указать сумму по выписке').isEnabled());
    await back();await button('Архив').click();await control('account','archived-credit').click();
    assert.equal(await control('credit-statement').count(),0);
    assert.equal(await control('credit-repay').count(),0);
    assert.deepEqual(errors,[]);

    if(capture){
      const ref=await context.newPage();
      await ref.clock.setFixedTime(date);
      await ref.addInitScript({path:'node_modules/lucide/dist/umd/lucide.min.js'});
      await ref.goto(origin+'/layout');
      await ref.addStyleTag({content:'html{color-scheme:light}body{margin:0}[data-fr-ui]{padding:0!important}[data-fr-ui] .fr-app{height:100dvh!important;border-radius:0!important}'});
      await ref.evaluate(()=>window.sample.goal('quick-goal-history-detail'));
      await ref.locator('summary').filter({hasText:'Расходы'}).click();
      await shot(ref,'01-history-reference');
      await ref.evaluate(()=>window.sample.goal('quick-savings-detail'));
      await shot(ref,'02a-goal-reference');
      await ref.evaluate(()=>window.sample.goal('quick-goal-actions'));
      await shot(ref,'02b-management-reference');
      await ref.evaluate(()=>window.sample.share());
      await shot(ref,'03-share-reference');
      await ref.goto(origin+'/credit');
      await ref.addStyleTag({content:'html{color-scheme:light}body{margin:0}[data-fr-ui]{padding:0!important}[data-fr-ui] .fr-app{height:100dvh!important;border-radius:0!important}'});
      await ref.evaluate(()=>window.sample.credit());
      await shot(ref,'04-credit-reference');
      await ref.goto(origin+'/before/');
      await accounts(ref);
      await ref.locator('[data-section-action=account][data-id=sample-zero]').click();
      await ref.getByRole('button',{name:'Указать сумму по выписке',exact:true}).waitFor();
      await shot(ref,'04-credit-before-pr3');
    }
    await context.close();
    console.log(`PASS patch 04 ${width} ${theme}: closed history, management, category share, credit`);
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
