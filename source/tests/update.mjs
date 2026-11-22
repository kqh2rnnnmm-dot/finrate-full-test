import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {appendFile,copyFile,cp,mkdir,mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const oldReleases={legacy:'0097d580584a6456f9ec9453d613bb17a420bbd2',published:'8fd14ef2dd5951069b03022751cf076738da8819',previous:'0a0fd28c7db8f2e50361b34ff4776f5a2d210cc6'};
const work=await mkdtemp(join(tmpdir(),'finrate-update-'));
const results=process.env.FINRATE_UPDATE_SCREENSHOTS || 'verification/visual-patch';
const readBuild=async path=>JSON.parse((await readFile(join(path,'sw.js'),'utf8')).match(/const build = (.*);/)[1]);
const A=await readBuild('site');
await cp('src',join(work,'src'),{recursive:true});
for(const file of ['build.mjs','package.json'])await copyFile(file,join(work,file));
await symlink(resolve('node_modules'),join(work,'node_modules'),'dir');
await appendFile(join(work,'src/styles.css'),'\n/* Same release, second test build. */\n');
execFileSync(process.execPath,['build.mjs'],{cwd:work,env:{...process.env,FINRATE_BUILD_DIR:join(work,'site')}});
const B=await readBuild(join(work,'site'));
assert.equal(B.release,A.release);
assert.notEqual(B.id,A.id);

let served='A';
let incomplete=false;
const oldBytes=new Map();
const mime={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(path,res))return;
  const name=path.slice(scope.length)||'index.html';
  if(!path.startsWith(scope)||!/^[a-z0-9-]+\.(html|js|css|png|webmanifest)$/.test(name))return res.writeHead(404).end();
  try{
    if(incomplete&&name==='styles-'+B.id+'.css')return res.writeHead(503).end();
    const revision=oldReleases[served],key=served+'/'+name;
    if(revision&&!oldBytes.has(key))oldBytes.set(key,execFileSync('git',['show',revision+':'+name],{stdio:['ignore','pipe','ignore']}));
    const data=revision?oldBytes.get(key):await readFile(join(served==='A'?'site':join(work,'site'),name));
    res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-store'}).end(data);
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+scope;
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
const options={viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'};
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const noOffer=async page=>assert.equal(await button(page,'Обновить').isVisible(),false);
const root=page=>page.locator('#finrate');
const ready=page=>page.waitForFunction(()=>!!navigator.serviceWorker.controller);
const update=page=>page.evaluate(async()=>{
  const r=await navigator.serviceWorker.ready;
  await r.update();
  if(r.installing)await new Promise(resolve=>{
    const worker=r.installing;
    worker.addEventListener('statechange',()=>{if(worker.state!=='installing')resolve();});
  });
});
const shot=(page,name)=>page.locator('.fr-app').screenshot({path:join(results,name+'.png'),animations:'disabled'});
async function coherent(page,info){
  assert.equal(await root(page).getAttribute('data-build'),info.id);
  assert.equal(await root(page).getAttribute('data-release'),info.release);
  assert.equal(await page.locator('script[src]').getAttribute('src'),'./app-'+info.id+'.js');
  assert.equal(await page.locator('link[rel=stylesheet]').getAttribute('href'),'./styles-'+info.id+'.css');
}
async function record(page,n,category,account){
  await page.locator('[data-entry=income]').click();await button(page,'Другой доход').click();
  for(const digit of String(n))await button(page,digit).click();
  await button(page,'Далее').click();
  await button(page,category).click();
  await button(page,'Сегодня').click();
  await page.locator('[data-account]').filter({hasText:account}).click();
  await page.locator('[data-action=account-next]').click();
  await button(page,'Сохранить').click();
}
try{
  await mkdir(results,{recursive:true});
  const context=await browser.newContext(options);
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(url);
  await ready(page);await button(page,'Сводка').waitFor();await noOffer(page);
  await shot(page,'V12-clean-home');
  await button(page,'Сводка').click();
  await page.getByText('0 ₽',{exact:true}).first().waitFor();
  await shot(page,'V12-clean-summary');
  const empty=await fixture(page,url);
  assert.deepEqual([empty.accounts,empty.categories,empty.operations,empty.events,empty.goals,empty.plans,empty.payments],[[],[],[],[],[],[],[]]);
  assert.equal(empty.total,0);

  await page.goto(url);
  await button(page,'Открыть меню').click();
  await page.getByText('Учёт',{exact:true}).click();
  await button(page,'Счета и кошельки').click();
  await page.getByText('Счетов пока нет.').waitFor();
  await shot(page,'V12-clean-accounts');
  await button(page,'Назад').click();
  await button(page,'Категории').click();
  await button(page,'Создать категорию').click();
  await button(page,'Доходная').click();
  await page.getByRole('textbox',{name:'Название'}).fill('Первый доход');
  await button(page,'Сохранить').click();
  await page.getByText('Первый доход',{exact:true}).waitFor();
  await button(page,'Назад').click();
  await button(page,'Закрыть меню').click();
  await page.locator('[data-entry=income]').click();await button(page,'Другой доход').click();
  await button(page,'3').click();await button(page,'2').click();
  await button(page,'Далее').click();await button(page,'Первый доход').click();await button(page,'Сегодня').click();
  await button(page,'Добавить счёт').click();
  await page.getByRole('textbox',{name:'Название'}).fill('Первый счёт');
  await button(page,'Сохранить').click();
  await page.locator('[data-action=account-next]').click();
  await page.getByRole('button',{name:'Выбрать счёт операции'}).waitFor();
  await button(page,'Сохранить').click();
  await button(page,'Сводка').waitFor();
  const stored=await fixture(page,url);
  assert.equal(stored.operations[0].amount,3200);
  assert.equal(stored.accounts.length,1);
  assert.equal(stored.categories.length,1);
  assert.equal(stored.datasetId,empty.datasetId);
  await page.goto(url);await coherent(page,A);await noOffer(page);
  await update(page);await noOffer(page);

  const other=await context.newPage();
  await other.goto(url);await coherent(other,A);
  await page.locator('[data-entry=income]').click();await button(page,'Другой доход').click();await button(page,'7').click();
  await other.locator('[data-entry=income]').click();await button(other,'Другой доход').click();await button(other,'8').click();

  served='B';incomplete=true;
  await update(page);
  await noOffer(page);await coherent(page,A);
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.ready).waiting),false);
  incomplete=false;
  await update(page);
  await page.getByText('Доступна версия '+B.release+' · '+B.id.slice(0,8),{exact:true}).waitFor();
  await coherent(page,A);
  await shot(page,'V11-update-waiting');
  const offlineTab=await context.newPage();
  await context.setOffline(true);
  await offlineTab.goto(url);
  await coherent(offlineTab,A);
  await button(offlineTab,'Сводка').waitFor();
  await context.setOffline(false);
  await offlineTab.close();

  await button(page,'Обновить').click();
  await page.getByRole('heading',{name:'Выйти без сохранения?'}).waitFor();
  await shot(page,'V11-update-draft');
  await button(page,'Вернуться к редактированию').click();
  assert.match(await page.locator('output').innerText(),/7/);
  await coherent(page,A);
  await button(page,'Обновить').click();
  await button(page,'Выйти без сохранения').click();
  await page.getByText('Обновлено до '+B.release+' · '+B.id.slice(0,8),{exact:true}).waitFor();
  await coherent(page,B);
  await shot(page,'V11-update-applied');
  await button(page,'Открыть меню').click();
  assert.match(await page.locator('.fr-version').innerText(),new RegExp(B.id.slice(0,8)));
  await coherent(other,A);
  assert.match(await other.locator('output').innerText(),/8/);
  await button(other,'Обновить').click();
  await button(other,'Выйти без сохранения').click();
  await button(other,'Сводка').waitFor();
  await coherent(other,B);
  await context.setOffline(true);
  await page.reload();await button(page,'Сводка').waitFor();await coherent(page,B);await noOffer(page);
  await button(page,'Сводка').click();
  await page.locator('[data-section-action=received]').click();
  assert.match(await page.locator('[data-operation]').innerText(),/32/);
  await context.setOffline(false);
  await page.goto(url);
  await record(page,5,'Первый доход','Первый счёт');
  await button(page,'Сводка').waitFor();
  await record(other,6,'Первый доход','Первый счёт');
  await other.getByRole('alert').filter({hasText:'Данные изменились в другой вкладке.'}).waitFor();
  const after=await fixture(page,url);
  assert.deepEqual(after.operations.map(o=>o.amount),[3200,500]);
  await context.close();
  console.log('PASS V11 and V12: empty vault, first account/category/operation, failed install, same release, two tabs, draft, restart, offline, stale write');

  served='published';
  const upgrade=await browser.newContext(options);
  const published=await upgrade.newPage();
  await fixture(published,url,'regression');
  await published.goto(url);
  await ready(published);
  await record(published,41,'Аванс','Копилка');
  await button(published,'Сводка').waitFor();
  const existing=await fixture(published,url);
  await published.goto(url);
  served='A';
  await update(published);
  await published.getByText('Доступна версия '+A.release+' · '+A.id.slice(0,8),{exact:true}).waitFor();
  assert.equal(await root(published).getAttribute('data-release'),'0.2.0-test.2');
  await button(published,'Обновить').click();
  await published.getByText('Обновлено до '+A.release+' · '+A.id.slice(0,8),{exact:true}).waitFor();
  await coherent(published,A);
  assert.deepEqual(await fixture(published,url),existing);
  await upgrade.close();
  console.log('PASS published 8fd14ef: manual update preserves accounts, categories, and own operation');

  served='previous';
  const upgradeGoals=await browser.newContext(options);
  const goalsPage=await upgradeGoals.newPage();
  await goalsPage.clock.setFixedTime(new Date('2026-11-19T12:00:00Z'));
  await fixture(goalsPage,url,'visual');
  await goalsPage.goto(url);
  await ready(goalsPage);
  assert.equal(await root(goalsPage).getAttribute('data-release'),'0.2.0-test.3');
  const goalButton=name=>button(goalsPage,name);
  await goalButton('Сводка').click();
  await goalButton('Накопления').click();
  for(const id of ['holiday','notebook']){
    await goalsPage.locator(`[data-section-action=goal][data-id=${id}]`).click();
    await goalButton('Цель достигнута').click();
    await goalButton('Цель достигнута').click();
    await goalsPage.getByRole('heading',{name:'Накопления',exact:true}).waitFor();
  }
  const oldGoals=await fixture(goalsPage,url);
  assert.ok(oldGoals.goals.every(g=>g.closed && !('operationRefs' in g.closed)));
  await goalsPage.goto(url);
  served='A';
  await update(goalsPage);
  await goalsPage.getByText('Доступна версия '+A.release+' · '+A.id.slice(0,8),{exact:true}).waitFor();
  await goalButton('Обновить').click();
  await goalsPage.getByText('Обновлено до '+A.release+' · '+A.id.slice(0,8),{exact:true}).waitFor();
  await coherent(goalsPage,A);
  await goalButton('Сводка').click();
  await goalButton('Накопления').click();
  await goalButton('История накоплений').click();
  for(const [id,status,amount] of [['holiday','Накоплено и потрачено','50 000'],['notebook','Накоплено','10 000']]){
    await goalsPage.locator(`[data-section-action=closed-goal][data-id=${id}]`).click();
    const total=goalsPage.locator('.fr-goal-total');
    assert.ok((await total.innerText()).replace(/\s/g,' ').includes(amount));
    assert.ok((await total.innerText()).includes(status+' · 19 нояб. 2026'));
    assert.equal(await goalsPage.locator('[data-closed-expenses]').count(),0);
    await goalButton('Назад').click();
  }
  assert.deepEqual(await fixture(goalsPage,url),oldGoals);
  await upgradeGoals.close();
  console.log('PASS published 0a0fd28: closed goals from test.3 open after manual update, with original snapshots');

  for(const ownData of [false,true]){
    served='legacy';
    const context=await browser.newContext(options);
    const page=await context.newPage();
    await page.goto(url);
    await button(page,'Сводка').waitFor();
    await ready(page);
    if(ownData){
      await record(page,77,'Аванс','Копилка');
      await button(page,'Сводка').waitFor();
    }
    const before=await fixture(page,url);
    assert.deepEqual(before.accounts.map(a=>a.name),['Карта','Копилка','Запасная карта']);
    assert.equal(before.operations.length,Number(ownData));
    await page.goto(url);
    served='A';
    await update(page);
    assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.ready).waiting),true);
    assert.equal(await root(page).getAttribute('data-build'),null);
    await page.reload();
    await button(page,'Сводка').waitFor();
    await coherent(page,A);
    await page.waitForFunction(async()=>{
      const service=navigator.serviceWorker;
      const r=await service.ready;
      return !!service.controller && !r.waiting && !r.installing;
    });
    await noOffer(page);
    const after=await fixture(page,url);
    assert.deepEqual(after,before);
    await context.close();
    console.log('PASS legacy 0097d58:',ownData?'own operation preserved':'untouched samples preserved');
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await rm(work,{recursive:true,force:true});
}
