import {selectionMark} from './screens.mjs';

const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function animatePopover(panel,closing=false){
  if(!panel||reducedMotion())return Promise.resolve();
  const compact={opacity:0,transform:'scale(.87)'},full={opacity:1,transform:'scale(1)'};
  return panel.animate(closing?[full,compact]:[compact,full],{
    duration:closing?145:220,easing:closing?'ease-in':'cubic-bezier(.17,.86,.29,1)',fill:closing?'forwards':'none'
  }).finished.catch(()=>{});
}
export function pressFeedback(trigger){
  if(trigger&&!reducedMotion())trigger.animate([
    {transform:'scale(1)'},{transform:'scale(.975)'},{transform:'scale(1)'}
  ],{duration:165});
}
export function anchorPopover(panel,trigger){
  const at=trigger.getBoundingClientRect(), frame=trigger.closest('.fr-screen').getBoundingClientRect();
  const pad=12, width=Math.min(frame.width-2*pad,Math.max(at.width,panel.offsetWidth));
  const left=Math.max(frame.left+pad,Math.min(at.right-width,frame.right-width-pad));
  panel.style.width=width+'px';
  panel.style.maxHeight=Math.max(90,Math.min(frame.bottom,innerHeight)-Math.max(frame.top,0)-2*pad)+'px';
  const bottom=Math.min(frame.bottom,innerHeight)-pad;
  const top=Math.max(frame.top+pad,Math.min(at.bottom+5,bottom-panel.offsetHeight));
  panel.style.left=left+'px';
  panel.style.top=top+'px';
  panel.style.transformOrigin=Math.max(0,Math.min(width,at.x+at.width/2-left))+'px '+Math.max(0,Math.min(panel.offsetHeight,at.bottom-top))+'px';
}
export function bindSelectPopovers(host){
  host.addEventListener('invalid',event=>{
    event.target.closest('.fr-select-field')?.querySelector('[data-select-trigger]')?.focus();
  },true);
  host.addEventListener('input',event=>{
    const field=event.target.closest('.fr-select-field');
    if(field&&event.target.matches('select'))field.querySelector('[data-select-caption]').textContent=event.target.selectedOptions[0]?.textContent||'Выбрать';
  });
  host.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-select-trigger]');
    if(!trigger)return;
    const field=trigger.closest('.fr-select-field'), select=field.querySelector('select');
    if(select.disabled||field.querySelector('dialog'))return;
    const panel=document.createElement('dialog');
    panel.className='fr-select-popover';
    panel.setAttribute('aria-label',select.getAttribute('aria-label'));
    const options=[...select.options].filter(option=>!option.disabled&&(!select.required||option.value));
    if(!options.length)return;
    const close=async option=>{
      if(panel.dataset.closing)return;
      panel.dataset.closing='true';
      await animatePopover(panel,true);
      if(!panel.isConnected)return;
      panel.close();panel.remove();trigger.setAttribute('aria-expanded','false');
      if(option&&select.value!==option.value){
        select.value=option.value;
        select.dispatchEvent(new Event('input',{bubbles:true}));
        if(select.isConnected)select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      if(trigger.isConnected)trigger.focus({preventScroll:true});
    };
    for(const option of options){
      const button=document.createElement('button');
      button.type='button';
      const label=document.createElement('span');
      label.textContent=option.textContent;
      button.append(label);
      button.insertAdjacentHTML('beforeend',selectionMark(option.selected));
      button.setAttribute('aria-pressed',String(option.selected));
      button.onclick=()=>close(option);
      panel.append(button);
    }
    panel.onclick=event=>{if(event.target===panel)close();};
    panel.oncancel=event=>{event.preventDefault();close();};
    field.append(panel);trigger.setAttribute('aria-expanded','true');
    pressFeedback(trigger);
    panel.showModal();anchorPopover(panel,trigger);
    animatePopover(panel);
  });
}
