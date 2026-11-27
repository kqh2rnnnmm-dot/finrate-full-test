import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import binary from '@sparticuz/chromium';

const appUrl=process.argv[2];
const browser=await chromium.launch({executablePath:await binary.executablePath(),args:binary.args.filter(arg=>arg!=='--single-process')});
try {
  for(const [colorScheme,dir] of [['light',-1],['dark',1]]) {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,colorScheme,reducedMotion:'no-preference'});
    await page.goto(appUrl);
    const button=name=>page.getByRole('button',{name,exact:true});
    await button('Сводка').click();
    const month=page.locator('.fr-month');
    const stack=await month.evaluate(node=>{
      const screen=node.closest('.fr-screen');
      const back=document.querySelector('.fr-back');
      return {
        fade:getComputedStyle(screen,'::before').maskImage,
        layer:Number(getComputedStyle(screen,'::before').zIndex),
        month:Number(getComputedStyle(node).zIndex),
        header:Number(getComputedStyle(back.closest('.fr-header')).zIndex)
      };
    });
    assert.match(stack.fade,/linear-gradient/);
    assert.ok(stack.layer<stack.month && stack.month<stack.header);
    const trigger=page.locator('[data-action=month-result-info]');
    const info=page.locator('.fr-info-dialog');
    for(let repeat=0;repeat<2;repeat++){
      await trigger.click();
      await info.waitFor();
      await page.waitForFunction(()=>document.querySelector('.fr-info-dialog').getAnimations().length>0);
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fr-info-dialog')).opacity==='1');
      await page.mouse.click(4,4);
      await info.waitFor({state:'hidden'});
    }
    await button('Назад').click();
    const knob=page.locator('.fr-knob');
    const box=await knob.boundingBox();
    const t=await page.context().newCDPSession(page);
    const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
    const touch=(type,offset)=>t.send('Input.dispatchTouchEvent',{type,touchPoints:offset===undefined?[]:[{x,y:y+offset}]});
    await touch('touchStart',0);
    await touch('touchMove',dir*60);
    const side=dir<0?'::before':'::after';
    await page.waitForFunction(side=>Number(getComputedStyle(document.querySelector('.fr-track-glow'),side).opacity)>.06,side);
    assert.equal(await knob.evaluate((node,side)=>getComputedStyle(node,side).opacity,side),'0');
    await touch('touchMove',dir*122);
    await page.waitForFunction(side=>getComputedStyle(document.querySelector('.fr-knob'),side).opacity==='1',side);
    await touch('touchEnd');
    await page.getByRole('heading',{name:dir<0?'Расход':'Доход',exact:true}).waitFor();
    await page.close();
  }
  console.log('PASS modal reopening, fade layer below controls and emulated touch drags in both directions');
} finally {
  await browser.close();
}
