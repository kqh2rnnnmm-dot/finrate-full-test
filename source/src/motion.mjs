const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function bindMenuGlyph(button) {
  const glyph = button.querySelector('.fr-menu-bars');
  let progress=0, target=0, frame=0, stamp;
  function paint(){
    const easing = x => x*x*(3-2*x);
    const first=easing(Math.min(progress*2,1)), second=easing(Math.max(progress*2-1,0));
    for (const [key,value] of Object.entries({width:20-18*first,upperLeft:18*first,height:2+8*second,lowerTop:8-8*second})) {
      glyph.style.setProperty('--'+key,value+'px');
    }
  }
  function tick(now){
    frame=0;
    progress+=Math.sign(target-progress)*Math.min(Math.abs(target-progress),(now-stamp)/480);
    stamp=now;
    paint();
    if(progress!==target)frame=requestAnimationFrame(tick);
  }
  return route=>{
    const open=route==='menu';
    button.hidden=route!=='home'&&!open;
    button.setAttribute('aria-expanded',String(open));
    button.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
    target=Number(open);
    if(reduced.matches){cancelAnimationFrame(frame);frame=0;progress=target;paint();}
    else if(!frame&&target!==progress){stamp=performance.now();frame=requestAnimationFrame(tick);}
  };
}

export function bindTrack(track, open) {
  const knob=track.querySelector('.fr-knob');
  let pointer=null, startY=0, selected=null, timer;
  const reset=()=>{
    selected=null;pointer=null;track.classList.remove('fr-dragging');
    track.style.setProperty('--y','0px');track.dataset.stage='neutral';
  };
  function select(kind){
    if(timer)return;
    track.dataset.stage=kind;
    track.style.setProperty('--y', (kind==='expense'?-1:1)*Math.min(113,track.clientHeight*.33)+'px');
    timer=setTimeout(()=>{if(track.isConnected)open(kind);},reduced.matches?0:220);
  }
  function drag(y){
    const distance=y-startY, threshold=Math.min(92,track.clientHeight*.27), limit=Math.min(113,track.clientHeight*.33);
    selected=distance<=-threshold?'expense':distance>=threshold?'income':null;
    track.style.setProperty('--y',Math.max(-limit,Math.min(limit,distance))+'px');
    track.dataset.stage=selected||'neutral';
  }
  track.querySelectorAll('[data-entry]').forEach(button=>button.onclick=()=>select(button.dataset.entry));
  knob.onpointerdown=event=>{
    if(!event.isPrimary||event.button!==0||timer)return;
    startY=event.clientY;pointer=event.pointerId;
    knob.setPointerCapture(pointer);track.classList.add('fr-dragging');
  };
  knob.onpointermove=event=>{if(event.pointerId===pointer)drag(event.clientY);};
  knob.onpointerup=event=>{
    if(event.pointerId!==pointer)return;
    drag(event.clientY);pointer=null;track.classList.remove('fr-dragging');
    if(selected)select(selected);else reset();
  };
  knob.onpointercancel=reset;
  knob.onlostpointercapture=()=>{if(pointer!==null)reset();};
  knob.onkeydown=event=>{
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();select(event.key==='ArrowUp'?'expense':'income');}
  };
}
