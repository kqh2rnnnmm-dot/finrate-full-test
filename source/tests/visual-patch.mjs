import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';
import {scope,serveFixture,fixture} from './fixture-server.mjs';

const references=process.env.FINRATE_REFERENCES;
assert.ok(references,'Set FINRATE_REFERENCES to the extracted UI_Lab directory');
const results=process.env.FINRATE_VISUAL_SCREENSHOTS || 'verification/visual-patch';
const unified='LAYOUT_FOLLOWUP_CANDIDATE.html';
const referenceHash=createHash('sha256').update(await readFile(join(references,unified))).digest('hex');
assert.equal(referenceHash,'62666e36b71b71d7c0de474f36a645178e4b137bdbb2822f2bc815805f17d705');
const inputs=new Set([unified,'TRANSFER_FINAL_CANDIDATE.html','TRANSFER_AMOUNT_CANDIDATE.html','CREDIT_ARCHIVE_CANDIDATE.html']);
const mime={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
function alignSample({d,kind}) {
  if(kind==='unified'){
    const shares=d.rates.at(-1).shares;
    for(const c of d.categories.filter(c=>!c.parentId)){
      const list=categoryCatalog[c.type];
      let row=list.find(row=>row.name===c.name);
      if(!row){row={id:c.id,name:c.name};list.push(row);}
      row.percent=(shares[c.id]||0)/100;
      row.futurePercent=row.percent;
      row.children=d.categories.filter(child=>child.parentId===c.id).map(child=>child.name);
    }
    for(const type of ['expense','income']){
      const names=new Set(d.categories.filter(c=>c.type===type).map(c=>c.name));
      categoryCatalog[type]=categoryCatalog[type].filter(c=>names.has(c.name));
    }
    demoOperations.splice(0,demoOperations.length,...d.operations.map(o=>{
      const child=d.categories.find(c=>c.id===o.allocations[0]?.categoryId);
      const parent=d.categories.find(c=>c.id===child?.parentId)||child;
      const refParent=categoryCatalog[o.kind]?.find(c=>c.name===parent?.name);
      return {id:o.id,type:o.kind,amount:String(o.amount/100),date:o.date,account:'Карта',budgetTracked:true,
        category:{type:o.kind,parentId:refParent?.id,parentName:parent?.name,childName:child!==parent?child?.name:''}};
    }));
    for(const p of paymentDemoRows){
      const match=d.payments.find(plan=>plan.id===p.id);
      if(!match)continue;
      p.subcategory=match.versions[0].name;
      p.name=p.subcategory;
      if(p.id==='utilities')p.pausedByPlan=true;
    }
  }
  for(const account of accountOptions){
    const accountData=d.accounts.find(a=>a.name===account.name);
    if(!accountData)continue;
    account.balance=String(d.balances[accountData.id]/100);
    if(accountData.financeType==='credit'){
      account.debt=String(Math.max(0,-d.balances[accountData.id])/100);
      account.available=String((accountData.credit.limit-Math.max(0,-d.balances[accountData.id]))/100);
      account.own=String(Math.max(0,d.balances[accountData.id])/100);
      account.dueParts=accountData.credit.openingLots?.map(lot=>({date:lot.due,amount:String(lot.amount/100)}))||[];
    }
  }
  if(kind==='unified')for(let i=accountOptions.length-1;i>=0;i--){
    if(!d.accounts.some(a=>a.name===accountOptions[i].name))accountOptions.splice(i,1);
  }
  render();
}
const harness=`window.finrateReference={
  align: (${alignSample.toString()}),
  openCredit:name=>openAccountDetail(name||accountOptions.find(a=>a.type==='credit').name),
  startTransfer:()=>startTransferAccounts(),
  target:()=>{openTransferAccountPicker('target');chooseTransferAccount(availableTransferAccounts().find(a=>a.name==='Копилка').id);},
  transferAmount:()=>openTransferAmount(),
  enterAmount:value=>{buffer=value;render();},
  confirmAmount:()=>acceptTransferAmount()
};`;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(serveFixture(path,res))return;
  try{
    if(path.startsWith('/reference/')&&inputs.has(path.slice(11))){
      const html=await readFile(join(references,path.slice(11)),'utf8');
      const marker='})();\n</script>';
      if(!html.includes(marker))throw new Error('Reference closure missing');
      res.writeHead(200,{'Content-Type':mime.html}).end(html.replace(marker,()=>harness+marker));
    }else if(path.startsWith(scope)){
      const name=path.slice(scope.length)||'index.html';
      if(!/^[a-z0-9-]+\.(html|js|css|png|webmanifest)$/.test(name))return res.writeHead(404).end();
      res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)]}).end(await readFile(join('site',name)));
    }else res.writeHead(404).end();
  }catch{res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
await mkdir(results,{recursive:true});
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});

try{
  for(const [width,height] of [[320,568],[390,844]])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,colorScheme:theme,reducedMotion:'reduce'});
    const app=await context.newPage(), ref=await context.newPage();
    const date=new Date('2026-11-18T12:00:00Z');
    await app.clock.setFixedTime(date);await ref.clock.setFixedTime(date);
    const errors=[];
    app.on('pageerror',error=>errors.push(error.message));
    app.setDefaultTimeout(6500);ref.setDefaultTimeout(6500);
    const snapshot=await fixture(app,origin+scope,'visual');
    await app.goto(origin+scope);
    await ref.addInitScript({path:'node_modules/lucide/dist/umd/lucide.min.js'});
    await ref.addInitScript(()=>{
      document.addEventListener('DOMContentLoaded',()=>lucide.createIcons({attrs:{width:16,height:16}}));
    });

    async function openReference(file=unified){
      await ref.goto(origin+'/reference/'+file);
      await ref.addStyleTag({content:`html{color-scheme:${theme}}body{margin:0}
        [data-fr-ui]{padding:0!important} [data-fr-ui] .fr-app{height:100dvh!important;border-radius:0!important}`});
      await ref.locator('.fr-screen').waitFor();
    }

    // Apply the same fictional names, balances, shares, and postings to the
    // reference's in-memory data. Its original templates and handlers render them.
    async function alignReference(d,kind){
      await ref.evaluate(args=>window.finrateReference.align(args),{d,kind});
    }
    const button=(page,name)=>page.getByRole('button',{name,exact:true});
    const section=(name,id)=>app.locator(`[data-section-action="${name}"]${id===undefined?'':`[data-id="${id}"]`}`);
    const back=page=>button(page,'Назад').click();
    async function openMenu(page,group,item){
      await button(page,'Открыть меню').click();
      const entry=page.getByText(group,{exact:true});
      const open=await entry.evaluate(el=>el.closest('details')?.open||el.getAttribute('aria-expanded')==='true');
      if(!open)await entry.click();
      await button(page,item).click();
    }
    let pairs=0;
    async function pair(name){
      pairs++;
      for(const [page,side] of [[ref,'reference'],[app,'app']]){
        const surface=page.locator('.fr-app');
        const geometry=await surface.evaluate(el=>({width:el.clientWidth,height:el.clientHeight,overflow:el.scrollWidth-el.clientWidth}));
        assert.deepEqual(geometry,{width,height,overflow:0},name+' '+side);
        await surface.screenshot({path:join(results,`${width}-${theme}-${name}-${side}.png`),animations:'disabled'});
      }
    }

    await openReference();await alignReference(snapshot,'unified');
    await button(app,'Сводка').waitFor();
    await pair('V10-home');
    for(const page of [app,ref])await button(page,'Сводка').click();
    assert.equal(await ref.locator('[data-np=settings] svg').count(),1);
    assert.equal(await ref.locator('.np-month svg').count(),2);
    await pair('V01-summary');
    assert.equal(await app.locator('.fr-budget-bar--wide').first().evaluate(el=>el.clientHeight),20);
    const appMonth=app.locator('.fr-month');
    const y=await appMonth.evaluate(el=>el.getBoundingClientRect().y);
    await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop=130);
    assert.equal(await appMonth.evaluate(el=>el.getBoundingClientRect().y),y);
    await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop=0);
    await section('month','-1').click();await ref.locator('[data-np=prev-month]').click();
    await pair('V01-zero');
    await section('month','1').click();await ref.locator('[data-np=next-month]').click();
    await section('share','home').click();
    await ref.locator('[data-np=detail]').filter({hasText:'Дом и коммунальные услуги'}).click();
    await pair('V02-share');
    const geometry=await app.locator('.fr-share-panel').evaluate(el=>{
      const field=el.querySelector('.fr-share-field').getBoundingClientRect();
      const slider=el.querySelector('input[type=range]').getBoundingClientRect();
      const sum=el.querySelector('[data-share-amount]').getBoundingClientRect();
      return [sum.left,innerWidth-field.right,field.height,field.width,slider.left,innerWidth-slider.right];
    });
    assert.deepEqual(geometry.filter((_,i)=>[0,1,4,5].includes(i)),[24,24,24,24]);
    assert.ok(geometry[2]>=44&&geometry[3]<106);
    assert.match(await app.locator('[data-share-room]').innerText(),/Для категории доступно/);
    await app.getByRole('textbox',{name:'Процент Дом и коммунальные услуги'}).fill('20');
    await ref.locator('[data-np-percent]').fill('20');
    await back(app);await back(ref);
    await pair('V10-unsaved');
    const warning=await app.locator('.fr-unsaved-actions').evaluate(el=>{
      const r=[...el.children].map(button=>button.getBoundingClientRect());
      return [r[0].width,r[1].width,r[1].top-r[0].bottom];
    });
    assert.equal(warning[0],warning[1]);assert.equal(warning[2],12);
    for(const page of [app,ref])await button(page,'Выйти без сохранения').click();
    await section('savings').click();await ref.locator('[data-np=savings]').click();
    await pair('V04-savings');
    await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop=el.scrollHeight);
    const savingsScroll=await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop);
    await button(app,'История накоплений').click();await back(app);
    assert.equal(await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop),savingsScroll);
    for(const page of [app,ref]){await back(page);await back(page);await openMenu(page,'Учёт','Категории');}
    await pair('V03-categories');
    for(const page of [app,ref]){await back(page);await button(page,'Счета и кошельки').click();}
    await pair('V05-accounts');
    await app.locator('[data-section-scroll]').evaluate(el=>el.scrollTop=el.scrollHeight);
    await ref.locator('.fr-accounts-list').evaluate(el=>el.scrollTop=el.scrollHeight);
    await pair('V05-accounts-scroll');
    await section('account','sample-credit').click();
    await openReference('CREDIT_ARCHIVE_CANDIDATE.html');await alignReference(snapshot,'credit');
    await ref.evaluate(()=>window.finrateReference.openCredit());
    await pair('V07-credit');
    assert.equal(await app.locator('.fr-credit-due-row').count(),2);
    const creditTitle=app.locator('.fr-title');
    assert.ok(await creditTitle.evaluate(el=>el.scrollWidth>el.clientWidth));
    await creditTitle.click();
    assert.ok(await creditTitle.evaluate(el=>el.classList.contains('fr-full-name')));
    await back(app);await section('account','sample-zero').click();
    await ref.evaluate(()=>window.finrateReference.openCredit('Покупки по выписке'));
    await pair('V07-credit-zero');
    assert.equal(await button(app,'Погасить').count(),0);
    await app.getByText('Долга нет',{exact:true}).waitFor();
    await back(app);await back(app);
    await button(app,'Перевод').click();
    await openReference('TRANSFER_FINAL_CANDIDATE.html');await alignReference(snapshot,'transfer');
    await ref.evaluate(()=>window.finrateReference.startTransfer());
    await pair('V06-transfer');
    await section('transfer-target').click();await section('transfer-pick','cash').click();
    await ref.evaluate(()=>window.finrateReference.target());
    await pair('V06-transfer-selected');
    await button(app,'Далее').click();
    await openReference('TRANSFER_AMOUNT_CANDIDATE.html');await alignReference(snapshot,'transfer');
    await ref.evaluate(()=>{
      const controls=window.finrateReference;
      controls.startTransfer();controls.target();controls.transferAmount();
    });
    await app.keyboard.type('999999999,99');
    const max=app.locator('output');
    assert.match(await max.innerText(),/999.999.999,99/);
    assert.ok(await max.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
    for(let i=0;i<12;i++)await app.keyboard.press('Backspace');
    await app.keyboard.type('10,25');await ref.evaluate(()=>window.finrateReference.enterAmount('10,25'));
    await pair('V06-transfer-amount');
    await button(app,'Далее').click();await ref.evaluate(()=>window.finrateReference.confirmAmount());
    await pair('V06-transfer-review');
    await button(app,'Перевести').click();await button(app,'Операции').waitFor();
    await button(app,'Закрыть меню').click();
    await openReference();await alignReference(snapshot,'unified');
    for(const page of [app,ref])await openMenu(page,'Планы и отчёты','Платежи');
    for(const [tab,name] of [['due','due'],['paid','paid'],['planned','planned']]){
      await section('tab',tab).click();
      await ref.locator(`[data-payments-tab="${tab}"]`).click();
      const gradient=await app.locator('.fr-payment-screen').evaluate(el=>getComputedStyle(el).backgroundImage);
      assert.equal(gradient.includes('gradient'),tab==='planned');
      if(tab==='due')assert.ok(await app.getByText('Просрочено',{exact:true}).count());
      if(tab==='planned')assert.equal(await app.getByText('Приостановленные',{exact:true}).count(),1);
      await pair('V08-payments-'+name);
    }
    await button(app,'Календарь').click();await ref.locator('[data-action=payment-calendar-toggle]').click();
    await section('payment-day','2026-11-18').click();
    await ref.locator('[data-payment-calendar-day="2026-11-18"]').click();
    await pair('V08-payments-calendar');
    for(const page of [app,ref]){await back(page);await button(page,'Планы доходов').click();}
    await pair('V09-income-plans');
    await section('tab','archive').click();
    await ref.locator('[data-expected-plan-view=archive]').click();
    await pair('V09-income-archive');
    await section('tab','active').click();
    await ref.locator('[data-expected-plan-view=active]').click();
    await section('distribution').click();await ref.getByRole('button',{name:'Распределение плана',exact:true}).click();
    await pair('V02-share-all');
    assert.deepEqual(errors,[]);
    console.log('PASS visual',width,height,theme,pairs,'same-size screenshot pairs');
    await context.close();
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
