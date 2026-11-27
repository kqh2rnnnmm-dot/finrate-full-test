import {esc,icon} from './screens.mjs';
import {animatePopover,closeAnimatedDialog} from './popovers.mjs';

export const topics={
  operations:{
    title:'Доходы, расходы и категории', summary:'Записывайте покупки и поступления. Категории покажут, на что ушли деньги.',
    queries:'как начать куда ушли деньги первый запуск без счета аванс зарплата история заметка ошибка покупка',
    steps:['На главном экране потяните ползунок вверх для расхода или вниз для дохода. Можно нажать на подпись или использовать клавиши ↑ и ↓ на ползунке.',
      'Введите сумму, отметьте категорию и нажмите «Далее». Достаточно одной категории. Если хотите уточнить запись, выберите подкатегорию или добавьте её через «+».',
      'Проверьте дату, добавьте заметку при необходимости и сохраните запись. В меню «Операции» можно открыть запись, исправить её или отменить.'],
    example:'Аванс можно добавить как подкатегорию «Зарплаты». Первый расход можно записать сразу, даже если доходов ещё нет.',
    faq:['Можно ли указать подкатегорию позднее?','Да. Откройте запись, нажмите «Выбрать категорию», отметьте подкатегорию и сохраните изменения.'],
    related:['summary','accounts','income-plans']
  },
  accounts:{
    title:'Счета и кошельки', summary:'Добавьте карты и наличные, если хотите видеть, сколько денег у вас на каждом счёте.',
    empty:'Добавьте карту или кошелёк, чтобы начать учёт остатков.',
    queries:'остаток карта кошелек наличные деньги банк основной без счета куда делись старые записи',
    steps:['Нажмите «Добавить счёт», отметьте тип и нажмите «Далее».',
      'Введите название и сумму, которая фактически есть на счёте сейчас. Сохраните.',
      'В меню «Ещё» раздела можно выбрать основной счёт. Он будет предложен в новой операции. При необходимости выберите другой счёт или «Без счёта».'],
    example:'На карте уже есть 10 000 ₽. Укажите их при создании. Сводка покажет учтённый остаток, а сумма доходов за месяц сохранится прежней.',
    faq:['Что будет с записями, сделанными до создания счёта?','Они останутся в истории и сводке. Их суммы не прибавляются к остатку счёта.'],
    related:['operations','transfer','credit']
  },
  'income-plans':{
    title:'Планы доходов',summary:'Укажите, сколько денег ожидаете и когда. Когда они поступят, запишите получение по этому плану.',
    empty:'Добавьте первое ожидаемое поступление.',
    queries:'будущий доход зарплата когда придут деньги ожидание поступление частично получил связать',
    steps:['Нажмите «Создать план дохода». Укажите сумму, категорию, дату начала и повторение.',
      'Когда получите деньги, выберите конкретное ожидание при записи дохода или откройте его из «Планов доходов». Проверьте сумму и дату.',
      'Если пришла часть суммы, отметьте «Получен частично» и нажмите «Далее». Оставшаяся сумма будет видна в плане.'],
    example:'Ожидается 50 000 ₽, пришло 20 000 ₽. После записи фактический доход увеличится на 20 000 ₽, ещё 30 000 ₽ останутся в ожидании.',
    faq:['Доход уже есть в истории. Как добавить его в план?','В «Планах доходов» нажмите «Связать записанный доход», выберите запись и ожидание. Повторного зачисления не будет.'],
    related:['distribution','operations','summary']
  },
  distribution:{
    title:'Распределение плана',summary:'Распределите ожидаемый доход по категориям. Так будет видно, сколько запланировано на каждую и сколько уже потрачено.',
    empty:'Укажите доли категорий для выбранного месяца.',
    queries:'проценты деньги ползунки свободно к распределению бюджет конверты 100 сумма месяц',
    steps:['Выберите месяц с ожидаемым доходом.',
      'Передвиньте ползунок нужной категории или введите процент. Оставшаяся доля видна сверху.',
      'Нажмите «Сохранить» и выберите, для какого периода применить изменения. В сводке появятся шкалы настроенных категорий.'],
    example:'При плане 50 000 ₽ доля 20% даёт 10 000 ₽ на категорию. Ожидаемые деньги станут фактическими только после записи поступления.',
    faq:['Почему ползунок остановился?','Свободный процент исчерпан. Уменьшите долю другой категории или оставьте текущие значения.'],
    related:['income-plans','summary','savings']
  },
  summary:{
    title:'Сводка',summary:'Посмотрите, сколько получили и потратили за выбранный месяц и на что ушли деньги.',
    queries:'итог баланс почему минус чем отличается доход расход остаток статистика отчет',
    steps:['Откройте «Сводку» с главного экрана. Стрелками выберите месяц.',
      'Нажмите на сумму результата, чтобы увидеть, как она считается. Откройте «Ещё», чтобы увидеть доходы и расходы.',
      'По мере настройки появятся учтённые остатки, план поступлений и бюджетные шкалы. Остатки на счетах здесь показываются на текущий момент.'],
    example:'Получили 50 000 ₽, потратили 32 500 ₽. Результат месяца — 17 500 ₽, даже если на карте сейчас другая сумма.',
    faq:['Почему результат отрицательный?','В выбранном месяце записано больше расходов, чем доходов. Проверьте даты операций и наличие пропущенных записей.'],
    related:['operations','accounts','income-plans','distribution']
  },
  payments:{
    title:'Платежи',summary:'Запланируйте регулярные и разовые платежи. Проверяйте, что осталось оплатить, и отмечайте оплату.',
    empty:'Добавьте первый платёж, чтобы увидеть его в расписании.',
    queries:'жкх коммуналка аренда подписка когда оплатить оплачено просрочен',
    steps:['Добавьте обычный счёт для оплаты, если его ещё нет.',
      'В «Платежах» создайте платёж, укажите сумму, дату, повторение и категорию.',
      'Откройте платёж и запишите фактическую оплату. Оплата попадёт в расходы и уменьшит остаток выбранного счёта.'],
    example:'Создайте ежемесячную оплату интернета. Каждый месяц открывайте новый платёж и отмечайте фактическую оплату.',
    faq:['Приложение само отправит деньги?','Оплату выполняете вы. FinRate помогает её запланировать и записать.'],
    related:['accounts','operations']
  },
  savings:{
    title:'Накопления',summary:'Поставьте денежную цель и следите, сколько уже отложено и сколько ещё нужно.',
    empty:'Создайте первую цель.',
    queries:'копить накопить отложить отпуск цель резерв',
    steps:['Добавьте цель и введите её сумму.',
      'В разделе «Планы доходов» откройте «Распределить план доходов» и задайте долю для цели. Она применяется к поступлениям, связанным с планом.',
      'Откройте цель, чтобы посмотреть накопленное, записать расход цели или отметить её достижение.'],
    example:'Создайте цель «Отпуск» на 60 000 ₽. Долю дохода для неё можно изменить позже.',
    faq:['Почему цель есть, а накоплений пока нет?','Целевая сумма задаёт ориентир. Накопление по доле появляется после получения соответствующего дохода.'],
    related:['distribution','income-plans','summary']
  },
  credit:{
    title:'Кредитные карты',summary:'Добавьте кредитку, чтобы видеть долг, доступный лимит и сроки погашения.',
    empty:'Добавьте первую кредитную карту.',
    queries:'кредитка долг погашение льготный беспроцентный срок лимит выписка',
    steps:['При создании кредитки введите лимит и срок погашения по правилам вашей карты.',
      'Если долг уже есть, укажите сумму и дату погашения. Покупки можно записывать с этой карты.',
      'Кнопка «Погасить» открывает перевод с обычного счёта. Если счёта для погашения ещё нет, добавьте его в «Счетах и кошельках».'],
    example:'Из лимита 100 000 ₽ вы потратили 15 000 ₽. По кредитному лимиту доступно 85 000 ₽.',
    faq:['Лимит карты прибавится к остаткам?','В учтённых остатках учитываются собственные деньги. Лимит и долг видны отдельно в карточке кредитки.'],
    related:['accounts','transfer']
  },
  transfer:{
    title:'Перевод',summary:'Запишите перемещение денег между своими счетами. FinRate обновит оба остатка.',
    empty:'Выберите счета, между которыми перевели деньги.',
    queries:'перекинуть деньги с карты на карту снять наличные пополнить не хватает средств',
    steps:['Добавьте два действующих обычных счёта, если их пока нет.',
      'Выберите, откуда и куда перевели деньги. Каждый выбор подтвердите кнопкой «Далее».',
      'Введите сумму, проверьте счета и дату, затем сохраните. Для погашения кредитки начните из карточки карты.'],
    example:'Перевод 1 000 ₽ с карты в кошелёк уменьшит остаток карты на 1 000 ₽ и увеличит остаток кошелька на ту же сумму.',
    faq:['Где перевод в доходах и расходах?','Перевод между своими счетами меняет их остатки. Результат месяца сохраняется прежним.'],
    related:['accounts','credit','summary']
  },
  'data-management':{
    title:'Управление данными',summary:'Сохраните зашифрованную копию, чтобы восстановить записи или перенести их в этот образец на другом устройстве.',
    queries:'резервная копия экспорт импорт бэкап восстановить сбросить удалить скачать где хранятся данные новый телефон',
    steps:['В «Управлении данными» выберите «Сохранить резервную копию». Задайте пароль длиной от 12 символов и скачайте файл.',
      'Для восстановления выберите этот файл и введите пароль. Копия заменит текущие данные FinRate.',
      'Чтобы заново пройти первый запуск, нажмите «Начать проверку заново» и подтвердите сброс.'],
    example:'Сохраните копию перед проверкой сброса, чтобы потом вернуть свои тестовые записи.',
    faq:['Что делать, если копия не открывается?','Проверьте, что выбран нужный файл и введён пароль именно от него.'],
    related:['operations','accounts']
  }
};
topics['distribution-offer']={...topics.distribution,title:'Распределение плана'};

topics['income-choice']={...topics['income-plans'],title:'Записать доход',
  summary:'Выберите ожидаемое поступление или запишите другой доход.'};

export function attachHelp(title,key) {
  if(!title)return;
  title.setAttribute('aria-label',title.textContent);
  title.insertAdjacentHTML('afterend',helpButton(key));
  const group=document.createElement('div');
  group.className='fu-title-group';
  title.before(group);
  group.append(title,title.nextElementSibling);
}

function helpButton(key) {
  return `<button type="button" class="fu-help-trigger " aria-label="Помощь по разделу" data-help="${key}" data-help-brief>${icon('info')}</button>`;
}
const keys=Object.keys(topics).filter(key=>key!=='distribution-offer');

export function openHelp(initial='',brief=false, page=null, onExit=null, onLayout=null) {
  const previous=document.activeElement;
  const dialog=page||document.createElement('dialog');
  dialog.classList.add(page?'fu-help-page':'fu-help-dialog');
  if(!page)dialog.setAttribute('aria-labelledby','fu-help-title');
  let view=initial,query='';
  const history=[];
  function searchMarkup(){
    const tokens=query.toLocaleLowerCase('ru').replaceAll('ё','е').match(/[а-яa-z0-9]+/g)?.filter(word=>word.length>2&&!['как','для','что','где','мне','можно','это','если','почему','финрейт'].includes(word))||[];
    const results=keys.map(key=>{
      const t=topics[key];
      const text=[t.title,t.summary,t.queries,...t.steps,t.example,...t.faq].join(' ').toLocaleLowerCase('ru').replaceAll('ё','е');
      return {key,score:tokens.reduce((score,word)=>score+(text.includes(word.slice(0,word.length>4?-1:undefined))?1:0),0)};
    }).filter(row=>!tokens.length||row.score).sort((a,b)=>b.score-a.score);
    return results.map(({key})=>topicButton(key,true)).join('')||'<p>Попробуйте поискать по словам «остаток», «зарплата» или «резервная копия».</p>';
  }
  function topicButton(key,detail=false){
    const t=topics[key];
    return `<button type="button" class="fu-topic-card" data-fu-topic="${key}"><span><strong>${esc(t.title)}</strong>${detail?`<small class="fr-muted">${esc(t.summary)}</small>`:''}</span></button>`;
  }
  function render(){
    const topic=topics[view];
    dialog.classList.toggle('fu-help-compact',brief);
    const header=page?`<header class="fr-header"><button type="button" class="fr-back" data-fu-back aria-label="Назад">${icon('back')}</button>
      <h1 class="fr-title" id="fu-help-title" tabindex="-1">Знакомство с FinRate</h1></header>`:`<header class="fu-help-head">
      ${topic&&!brief?`<button type="button" data-fu-back aria-label="К темам справки">${icon('back')}</button>`:''}
      <h2 id="fu-help-title" tabindex="-1" autofocus>${brief?esc(topic.title):'Как это работает'}</h2>
      ${brief?'':'<button type="button" data-fu-close aria-label="Закрыть справку">×</button>'}</header>`;
    const bodyClass=page?'fu-help-body np-body':'fu-help-body';
    dialog.innerHTML=header+
      (brief?`<div class="${bodyClass}"><p>${esc(topic.summary)}</p><button type="button" class="fu-help-link" data-fu-more>Подробнее</button></div>`:topic?`<article class="${bodyClass}"><h3>${esc(topic.title)}</h3><p>${esc(topic.summary)}</p>
        <ol>${topic.steps.map(step=>'<li>'+esc(step)+'</li>').join('')}</ol>
        <p class="fr-section-panel"><strong>Пример</strong><br>${esc(topic.example)}</p>
        <h4>${esc(topic.faq[0])}</h4><p>${esc(topic.faq[1])}</p>
        <h4>Связанные темы</h4>${topic.related.map(key=>topicButton(key)).join('')}</article>`:
        `<label class="fu-help-search"><span class="fr-visually-hidden">Поиск в справке</span><input type="search"
          aria-label="Поиск в справке" placeholder="Поиск в справке" value="${esc(query)}"></label>
          <div class="${bodyClass}" data-fu-results>${searchMarkup()}</div>`);
    onLayout?.();
  }
  render();
  dialog.onclick=event=>{
    if(!page&&(event.target===dialog||event.target.closest('[data-fu-close]')))return closeAnimatedDialog(dialog);
    if(event.target.closest('[data-fu-more]')){
      brief=false;
    }else if(event.target.closest('[data-fu-back]')){
      if(page&&!view)return onExit();
      view=history.pop()||'';
    }else{
      const key=event.target.closest('[data-fu-topic]')?.dataset.fuTopic;
      if(!key)return;
      history.push(view);
      view=key;
    }
    render();
    dialog.querySelector('#fu-help-title').focus({preventScroll:true});
  };
  dialog.oninput=event=>{
    query=event.target.value;
    dialog.querySelector('[data-fu-results]').innerHTML=searchMarkup();
  };
  if(page){
    dialog.querySelector('#fu-help-title').focus({preventScroll:true});
    return;
  }
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(previous?.isConnected)previous.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.oncancel=event=>{event.preventDefault();closeAnimatedDialog(dialog);};
  dialog.showModal();
  dialog.querySelector('#fu-help-title').focus({preventScroll:true});
  animatePopover(dialog);
}
