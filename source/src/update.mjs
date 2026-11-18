const pendingKey = 'finrate-confirmed-update';
const title = build => build.release+' · '+build.id.slice(0,8);

function buildInfo(worker) {
  if(!worker)return Promise.resolve(null);
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const end=value=>{clearTimeout(timeout);channel.port1.close();channel.port2.close();resolve(value);};
    const timeout=setTimeout(()=>end(null),1200);
    channel.port1.onmessage=event=>end(event.data);
    try{worker.postMessage({type:'FINRATE_BUILD_INFO'},[channel.port2]);}
    catch{end(null);}
  });
}

export function bindUpdate(root, requestExit) {
  const running={id:root.dataset.build,release:root.dataset.release};
  const banner=root.querySelector('.fr-update-banner');
  const notice=banner.querySelector('[role=status]');
  const button=banner.querySelector('button');
  const details=root.querySelector('.fr-version');
  const stage=root.querySelector('.fr-stage');
  details.textContent='Версия '+title(running);
  let request=null;
  try{
    request=sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
  }catch{}
  if(request===running.id){
    banner.hidden=false;
    notice.textContent='Обновлено до '+title(running);
    setTimeout(()=>{if(button.hidden)banner.hidden=true;},9000);
  }

  if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
  const service=navigator.serviceWorker;
  let registration,candidate,requested,sequence=0,applyTimer,observedWorker;

  function observe() {
    const worker=registration?.installing;
    if(!worker||worker===observedWorker)return;
    observedWorker=worker;
    worker.addEventListener('statechange',refresh);
  }

  async function refresh() {
    if(!registration)return;
    observe();
    const attempt=++sequence;
    const active=service.controller;
    const waiting=registration.waiting;
    const [activeBuild,waitingBuild]=await Promise.all([buildInfo(active),buildInfo(waiting)]);
    if(attempt!==sequence)return;
    if(requested&&activeBuild?.id===requested){
      clearTimeout(applyTimer);
      try{sessionStorage.setItem(pendingKey,requested);}catch{}
      location.reload();
      return;
    }
    // A legacy worker can fetch this shell from the network before the new
    // worker controls it. In that case this version is already on screen.
    if(!requested&&waitingBuild?.id===running.id && activeBuild?.id!==running.id){
      waiting.postMessage({type:'FINRATE_APPLY_UPDATE',id:running.id});
      return;
    }
    candidate=activeBuild&&activeBuild.id!==running.id ? {worker:active,build:activeBuild}
      : waitingBuild&&waitingBuild.id!==running.id ? {worker:waiting,build:waitingBuild} : null;
    if(!candidate){
      if(!button.hidden){banner.hidden=true;button.hidden=true;}
      return;
    }
    banner.hidden=false;
    button.hidden=false;
    if(!requested)notice.textContent='Доступна версия '+title(candidate.build);
  }

  button.addEventListener('click',()=>{
    if(!candidate||requested)return;
    const id=candidate.build.id;
    requestExit(()=>{
      if(!candidate||candidate.build.id!==id||requested)return;
      requested=id;
      button.disabled=true;
      stage.inert=true;
      notice.textContent='Обновляем до '+title(candidate.build)+'…';
      const failed=()=>{
        clearTimeout(applyTimer);
        requested=null;
        button.disabled=false;
        stage.inert=false;
        notice.textContent='Не удалось переключить версию. Повторите обновление.';
      };
      applyTimer=setTimeout(failed,12000);
      if(candidate.worker===service.controller)refresh();
      else try{candidate.worker.postMessage({type:'FINRATE_APPLY_UPDATE',id});}
      catch{failed();}
    });
  });

  service.addEventListener('controllerchange',refresh);
  service.register('./sw.js',{updateViaCache:'none'}).then(result=>{
    registration=result;
    registration.addEventListener('updatefound',refresh);
    refresh();
    const check=()=>{if(document.visibilityState==='visible')registration.update().catch(()=>{});};
    document.addEventListener('visibilitychange',check);
    window.addEventListener('online',check);
    setInterval(check,60000);
  }).catch(()=>{});
}
