import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import binary from "@sparticuz/chromium";

const executablePath=process.env.FINRATE_CHROMIUM||await binary.executablePath();
const appUrl=process.argv[2];
const browser=await chromium.launch({executablePath,args:binary.args.filter(arg=>arg!=='--single-process')});
const cases=[[320,568,'light',true],[390,844,'dark',true],[1100,840,'light',false]];
const normalize=s=>s.replace(/[\u00a0\u202f]/g,' ');
try {
  for(const [width,height,colorScheme,mobile] of cases){
    const context=await browser.newContext({viewport:{width,height},colorScheme,hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];
    const requests=[];
    page.on('pageerror',error=>errors.push(error.stack));
    page.on('request',req=>{if(/^https?:/.test(req.url())&&new URL(req.url()).origin!==new URL(appUrl).origin)requests.push(req.url());});
    page.setDefaultTimeout(4500);
    page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text());});
    const button=name=>page.getByRole('button',{name,exact:true});
    const section=(name,id)=>page.locator(`[data-section-action="${name}"]${id===undefined?'':`[data-id="${id}"]`}`);
    const action=name=>page.locator(`[data-action="${name}"]`);
    const title=name=>page.getByRole('heading',{name,exact:true}).waitFor();
    const back=()=>button('Назад').click();
    const fill=(field,value)=>page.locator(`input[name="${field}"]`).fill(value);
    async function menu(group,item){
      if(await page.locator('[data-screen=home]').count())await button('Открыть меню').click();
      const details=page.locator(`[data-menu-group="${group}"]`);
      if(await details.getAttribute('open')===null)await details.locator('summary').click();
      await button(item).click();
    }
    async function selectField(key,label){
      await page.locator(`[data-select-trigger="${key}"]`).click();
      const dialog=page.locator('dialog[open]');
      await dialog.getByRole('button',{name:label,exact:true}).click();
      assert.equal(await dialog.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
      await dialog.getByRole('button',{name:'Далее',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
    }
    async function enterAmount(value){
      for(const digit of value)await page.keyboard.press(digit);
      await action('next').click();
    }
    async function pickCategory(name){
      const category=page.locator('[data-category]').filter({hasText:name}).first();
      await category.click();
      await title('Категория');
      assert.equal(await page.locator('[data-category][aria-pressed=true]').count(),1);
      await action('category-next').click();
    }
    async function setDate(){
      await button('Сегодня').click();
      await page.locator('.fr-calendar').waitFor();
      await action('date-next').click();
    }
    async function summary(result,{income,expense,accounts,plan,remaining,bars=false}={}){
      await button('Сводка').click();
      const card=page.locator('.fr-month-result .np-money');
      await card.waitFor();
      assert.equal(normalize(await card.textContent()),result+' ₽');
      assert.equal(await page.locator('.fr-month-result .fr-muted').count(),0);
      assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
      assert.equal(await page.locator('.np-body > .fr-section-panel .np-link').count(),0);
      await section('summary-more').click();
      await page.locator('.fr-summary-details').waitFor();
      for(const [label,money] of [['Фактические доходы',income],['Фактические расходы',expense],['Учтённые остатки',accounts],['Планы доходов',plan]]){
        const row=page.locator('.fr-summary-details .np-link').filter({hasText:label});
        if(money===undefined)assert.equal(await row.count(),0,label);
        else assert.match(normalize(await row.textContent()),new RegExp(money+' ₽'));
      }
      if(remaining!==undefined){
        const planGroup=page.locator('.fr-summary-group').filter({hasText:'Планы доходов'});
        assert.equal(await planGroup.locator('.np-row').count(),3);
        assert.match(normalize(await planGroup.locator('.np-row').filter({hasText:'Осталось получить'}).textContent()),new RegExp(remaining+' ₽'));
      }
      await back();
      assert.equal(await page.locator('.fr-summary-category .fr-budget-bar').count()>0,bars);
      const overflow=await page.locator('.fr-screen').evaluate(node=>node.scrollWidth-node.clientWidth);
      assert.ok(overflow<=1,'summary overflow '+overflow);
      await back();
    }
    async function newAccount(name,opening,kind){
      await section('account-new').click();
      await section('account-type-set',kind).click();
      await title('Тип счёта');
      await section('account-type-next').click();
      await fill('name',name);
      await fill('opening',opening);
      await page.locator('button[type=submit]').click();
      await title(name);
    }
    await page.clock.setFixedTime(new Date(2026,10,25,12));
    await page.goto(appUrl);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await button('Сводка').waitFor();
    await context.setOffline(false);
    await button('Сводка').waitFor();
    await summary('0');
    await button('Сводка').click();
    assert.equal(await button('Настройки сводки').count(),0);
    await action('month-result-info').click();
    await page.locator('.fr-info-dialog[open]').waitFor();
    assert.doesNotMatch(await page.locator('.fr-info-dialog').textContent(),/накоплен/i);
    assert.equal(await page.locator('.fr-info-dialog [role=switch]').count(),0);
    await page.mouse.click(4,4);
    await page.locator('.fr-info-dialog[open]').waitFor({state:'hidden'});
    await back();
    if(mobile)await page.locator('[data-entry=expense]').tap();
    else{
      const box=await page.locator('.fr-knob').boundingBox();
      const x=box.x+box.width/2,y=box.y+box.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-118,{steps:6});await page.mouse.up();
    }
    await title('Расход');
    await enterAmount('32500');
    await pickCategory('Продукты');
    await setDate();
    assert.equal(await page.locator('[data-edit=account]').count(),0);
    await button('Добавить заметку').click();
    assert.equal(await page.getByLabel('Текст заметки').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
    await page.getByLabel('Текст заметки').fill('Первая запись\nПроверка перехода');
    await button('Готово').click();
    assert.equal(await button('Помощь по разделу').count(),0);
    await button('Заметка').click();
    assert.equal(await page.getByLabel('Текст заметки').inputValue(),'Первая запись\nПроверка перехода');
    await button('Готово').click();
    await action('save').click();
    await summary('−32 500'.replace('−','-'),{income:'0',expense:'32 500'});
    await button('Сводка').click();
    const fit=page.locator('[data-fit-money]');
    await fit.evaluate(el=>{el.textContent='−999 999 999,99 ₽';});
    await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));});
    const originalSize=await page.viewportSize();
    await page.setViewportSize({width:originalSize.width===320?321:originalSize.width>480?479:originalSize.width-1,height:originalSize.height});
    await page.waitForFunction(()=>{const el=document.querySelector('[data-fit-money]');return el.scrollWidth<=el.clientWidth+1;});
    await page.setViewportSize(originalSize);
    await section('category-ops').filter({hasText:'Продукты'}).click();
    await title('Продукты');
    assert.equal(await page.locator('.fr-operation-name').count(),0);
    assert.equal(await page.locator('.fr-operation-account').textContent(),'Без счёта');
    await section('category-history-more').click();
    await section('category-history-browse').click();
    await title('Категории');
    await back();
    await title('Продукты');
    await back();await back();
    await page.locator('.fr-knob').focus();
    await page.keyboard.press('ArrowDown');
    await title('Доход');
    await enterAmount('50000');
    await pickCategory('Зарплата');
    await setDate();
    await action('save').click();
    await summary('17 500',{income:'50 000',expense:'32 500'});

    await menu('Учёт','Счета и кошельки');
    await button('Как это работает').click();
    await button('К темам справки').click();
    assert.equal(await page.locator('dialog input:focus').count(),0);
    await button('Закрыть справку').focus();
    assert.equal(await button('Закрыть справку').evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
    await button('Закрыть справку').click();
    await button('Позже').click();
    assert.equal(await page.locator('[data-menu-group="Учёт"]').getAttribute('open'),'');
    await button('Счета и кошельки').click();
    assert.equal(await button('Как это работает').count(),1);
    assert.equal(await button('Помощь по разделу').count(),0);
    await newAccount('Моя карта','10000','bank');
    await back();
    const helpGeometry=await page.locator('.fr-header').evaluate(el=>{
      const info=el.querySelector('.fu-help-trigger').getBoundingClientRect();
      const title=el.querySelector('.fr-title').getBoundingClientRect();
      return [info.left-title.right,Math.abs((info.top+info.bottom-title.top-title.bottom)/2),info.width];
    });
    assert.ok(helpGeometry[0]>=0 && helpGeometry[1]<=1 && helpGeometry[2]>=44, String(helpGeometry));
    await button('Помощь по разделу').click();
    assert.equal(await page.locator('.fu-help-compact [data-fu-close]').count(),0);
    await page.keyboard.press('Escape');
    await back();await back();
    await summary('17 500',{income:'50 000',expense:'32 500',accounts:'10 000'});

    async function spend(amount,unlinked=false){
      await page.locator('[data-entry=expense]').click();
      await title('Расход');
      await enterAmount(amount);
      await pickCategory('Продукты');
      await setDate();
      if(unlinked)await page.locator('[data-account=""]').click();
      await action('account-next').click();
      await action('save').click();
    }
    await spend('500');
    await spend('200',true);
    await summary('16 800',{income:'50 000',expense:'33 200',accounts:'9 500'});

    await menu('Планы и отчёты','Планы доходов');
    await section('income-new').click();
    await fill('amount','50000');
    await selectField('categoryId','Зарплата');
    assert.equal(await button('Помощь по разделу').count(),0);
    assert.equal(await page.locator('input[name=amount]').inputValue(),'50000');
    await page.locator('button[type=submit]').click();
    await section('distribution-start').click();
    await title('Распределение плана');
    const share=name=>page.getByRole('textbox',{name:'Процент '+name,exact:true});
    await share('Жильё').fill('60');
    await share('Продукты').fill('30');
    const slider=page.getByRole('slider',{name:'Ползунок Транспорт',exact:true});
    await slider.focus();
    await page.keyboard.press('End');
    assert.equal(await share('Жильё').inputValue(),'60');
    assert.equal(await share('Продукты').inputValue(),'30');
    assert.equal(await share('Транспорт').inputValue(),'10');
    assert.equal(await page.locator('[data-share-free]').textContent(),'0%');
    assert.match(normalize(await slider.locator('..').locator('[data-share-amount]').textContent()),/5 000 ₽/);
    await action('section-save-share').click();
    await section('share-scope-pick','month').click();
    await section('share-scope-next').click();
    await button('Позже').click();
    await back();await back();
    await summary('16 800',{income:'50 000',expense:'33 200',accounts:'9 500',plan:'50 000',remaining:'50 000',bars:true});
    await menu('Планы и отчёты','Планы доходов');
    assert.equal(await page.locator('.fr-header [data-section-action=income-new]').count(),0);
    const layout=page.locator('.fr-screen');
    assert.equal(await layout.locator(':scope > .fr-header + .fr-month').count(),1);
    await layout.getByRole('heading',{name:'По плану',exact:true}).waitFor();
    await layout.getByRole('heading',{name:'Ожидаемые поступления',exact:true}).waitFor();
    const monthTitle=layout.locator('.fr-month-title');
    const currentMonth=await monthTitle.textContent();
    await button('Следующий месяц').click();
    assert.notEqual(await monthTitle.textContent(),currentMonth);
    await button('Предыдущий месяц').click();
    assert.equal(await monthTitle.textContent(),currentMonth);
    await section('income-plans-more').click();
    assert.equal(await page.locator('.fu-action-sheet[open] [data-section-action=income-new]').count(),1);
    assert.equal(await button('Закрыть').evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
    assert.equal(await page.locator('.fu-action-sheet[open] [data-section-action=income-link-source]').count(),1);
    const plansTitle=page.getByRole('heading',{name:'Планы доходов',exact:true});
    assert.equal(await plansTitle.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
    assert.ok(await plansTitle.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    assert.equal(await button('Действующие').count(),0);
    await section('income-plans-archive').click();
    await title('Архив планов');
    await back();
    await title('Планы доходов');
    await back();await back();

    await page.locator('[data-entry=income]').click();
    await title('Записать доход');
    assert.equal(await page.getByText('Выберите ожидаемое поступление или запишите другой доход.',{exact:true}).count(),0);
    await button('Помощь по разделу').click();
    await page.getByText('Выберите ожидаемое поступление или запишите другой доход.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Подробнее'}).click();
    await button('Закрыть справку').click();
    await section('income-pick').filter({hasText:'Зарплата'}).click();
    await title('Записать доход');
    await section('income-pick-next').click();
    await fill('amount','20000');
    await page.locator('button[type=submit]').click();
    await section('receipt-account-next').click();
    await section('income-receipt-part').click();
    await title('Доход получен полностью?');
    await section('income-completion-next').click();
    await section('income-review-save').click();
    await summary('36 800',{income:'70 000',expense:'33 200',accounts:'29 500',plan:'50 000',remaining:'30 000',bars:true});

    await page.locator('[data-entry=income]').click();
    await section('income-pick').filter({hasText:'Зарплата'}).click();
    await section('income-pick-next').click();
    await page.locator('button[type=submit]').click();
    await section('receipt-account-select').filter({hasText:'Без счёта'}).click();
    await section('receipt-account-next').click();
    await section('income-review-save').click();
    await summary('66 800',{income:'100 000',expense:'33 200',accounts:'29 500',plan:'50 000',remaining:'0',bars:true});
    await page.locator('[data-entry=income]').click();
    await page.locator('[data-screen=amount]').waitFor();
    await back();

    await button('Сводка').click();
    await button('Следующий месяц').click();
    assert.equal(await page.locator('.fr-summary-category .fr-budget-bar').count(),0);
    await section('summary-more').click();
    assert.match(normalize(await page.locator('.fr-summary-details .np-link').filter({hasText:'Планы доходов'}).textContent()),/50 000 ₽/);
    await back();
    await button('Предыдущий месяц').click();
    assert.equal(await page.locator('.fr-summary-category .fr-budget-bar').count(),3);
    await page.locator('.fr-summary-category [data-section-action=share]').filter({hasText:'Продукты'}).click();
    const history=page.locator('.fr-share-history');
    await history.locator('[data-operation]').first().waitFor();
    const historyHeader=()=>history.evaluate(body=>{
      const screen=body.parentElement;
      const header=screen.querySelector('.fr-header');
      const back=header.querySelector('.fr-back');
      const center=node=>{const {top,height}=node.getBoundingClientRect();return top+height/2;};
      const month=screen.querySelector('.fr-month');
      const mask=getComputedStyle(screen,'::before');
      return {arrow:center(back),title:center(header.querySelector('.fr-title')),month:center(month),
        topLayer:Number(getComputedStyle(header).zIndex),monthLayer:Number(getComputedStyle(month).zIndex),
        blurLayer:Number(mask.zIndex),maskHeight:parseFloat(mask.height),
        monthBottom:month.getBoundingClientRect().bottom-screen.getBoundingClientRect().top,
        arrowClickable:back.contains(document.elementFromPoint(back.getBoundingClientRect().left+24,center(back)))};
    });
    const beforeScroll=await historyHeader();
    assert.ok(Math.abs(beforeScroll.arrow-beforeScroll.title)<1,'back arrow aligns with category title');
    assert.ok(beforeScroll.topLayer>beforeScroll.monthLayer&&beforeScroll.monthLayer>beforeScroll.blurLayer);
    assert.ok(beforeScroll.maskHeight>beforeScroll.monthBottom,'blur covers the whole month control');
    assert.equal(beforeScroll.arrowClickable,true);
    await history.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    if(mobile)assert.ok(await history.evaluate(el=>el.scrollTop)>0);
    assert.deepEqual(await historyHeader(),beforeScroll);
    await back();
    assert.equal(await page.locator('.fr-summary-category .fr-budget-bar').count(),3);
    await back();

    await menu('Настройки и помощь','Знакомство с FinRate');
    const help=page.locator('[data-screen=help]');
    await help.waitFor();
    assert.equal(await page.getByRole('dialog').count(),0);
    await help.getByRole('heading',{name:'Знакомство с FinRate',exact:true}).waitFor();
    assert.equal(await help.locator(':scope > .np-body.fu-underlap-body').count(),1);
    const card=help.locator('.fu-topic-card').first();
    assert.ok(await card.evaluate(node=>{
      const text=node.querySelector('.fr-muted');
      return getComputedStyle(text).textAlign==='left'&&text.clientWidth>node.clientWidth*.8;
    }));
    await page.getByLabel('Поиск в справке').fill('почему итог отрицательный');
    await help.getByRole('button',{name:/Сводка/}).first().click();
    await help.getByRole('heading',{name:'Сводка',exact:true}).waitFor();
    assert.equal(await help.locator('article.fu-underlap-body .fu-topic-card').count(),4);
    await back();
    assert.equal(await page.getByLabel('Поиск в справке').inputValue(),'почему итог отрицательный');
    await back();
    assert.equal(await page.locator('[data-menu-group="Настройки и помощь"]').getAttribute('open'),'');
    await back();
    await page.reload();
    await summary('66 800',{income:'100 000',expense:'33 200',accounts:'29 500',plan:'50 000',remaining:'0',bars:true});
    assert.deepEqual(requests,[]);
    assert.deepEqual(errors,[]);
    console.log('PASS',width,height,colorScheme,'offline FIRST USE from empty through linked plan and reload');
    await context.close();
  }
}finally{
  await browser.close();
}
