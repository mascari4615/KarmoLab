import {entryKinds,recordStates,records,recordByKey,updateRecord,recoverRecordDraft} from './lore.mjs';

const kindNames={place:'장소',...entryKinds};
const kindMarks={place:'◇',person:'♙',event:'◷',lore:'≡',faction:'⚑'};
const templates={place:['지형과 환경','생활과 문화','갈등과 사건','아직 정하지 않은 것'],person:['역할','성격과 목표','관계','아직 정하지 않은 것'],event:['시점','원인','경과','영향'],lore:['규칙','예외','세계에 미치는 영향'],faction:['목적','구성원','활동 지역','다른 세력과의 관계']};

export function createWorkspace(initial,callbacks){
  let world=initial,key=null,filter='all',dirty=false,timer,revision=0,selfChange=false,opening=0,saving=Promise.resolve(true),draftLinks=[];
  const main=document.querySelector('main');document.body.classList.add('writing-workspace');
  const outline=document.createElement('aside');outline.id='world-outline';outline.setAttribute('aria-label','세계관 목록');
  outline.innerHTML=`<div class="outline-heading"><div><small>WORLD BUILDER</small><h1></h1><p class="celestial-summary"></p></div><button type="button" class="outline-close" aria-label="세계관 목록 닫기">×</button></div>
    <label class="record-search"><span>⌕</span><input type="search" aria-label="설정 전체 검색" placeholder="이름이나 설정 내용 검색"></label>
    <div class="record-filters" role="group" aria-label="설정 분류"><button data-kind="all" aria-pressed="true">전체</button><button data-kind="place">장소</button><button data-kind="person">인물</button><button data-kind="event">사건</button><button data-kind="lore">설정</button></div>
    <div class="outline-list"></div><div class="outline-new"><label class="sr-only" for="new-record-kind">새 기록 분류</label><select id="new-record-kind"><option value="place">장소</option><option value="person">인물</option><option value="event">사건</option><option value="lore">설정</option><option value="faction">세력</option></select><button id="new-record">＋ 새로 만들기</button></div>
    <div class="workspace-file"><button data-file="save">저장</button><button data-file="export">백업</button><button data-file="import">불러오기</button></div>`;
  const pane=document.createElement('aside');pane.id='world-document';pane.setAttribute('aria-label','설정 작성');
  pane.innerHTML=`<header class="document-toolbar"><span class="document-kind">설정</span><div><button id="record-undo" title="설정 실행 취소" aria-label="설정 실행 취소">↶</button><button id="record-redo" title="설정 다시 실행" aria-label="설정 다시 실행">↷</button><button id="record-save">저장</button></div></header>
    <div class="document-empty"><span>◇</span><h2>지도의 한 곳에서 시작</h2><p>장소를 선택해 설정을 쓰거나,<br>인물과 사건을 새로 만드세요.</p><button id="empty-place">지도에 장소 추가</button></div>
    <form class="record-form" hidden><div class="document-heading"><label class="sr-only" for="record-title">설정 이름</label><input id="record-title" maxlength="100" required placeholder="이름"><div class="record-meta"><label><span>상태</span><select id="record-state"><option value="draft">초안</option><option value="confirmed">확정</option><option value="question">미정</option></select></label><label class="record-area"><span>지역</span><input id="record-area" maxlength="100" placeholder="아직 정하지 않음"></label></div><button id="record-focus" type="button">지도에서 위치 보기 ↗</button></div>
    <div class="document-writing"><div class="writing-heading"><label for="record-body">설정</label><button id="record-template" type="button">작성 항목 넣기</button></div><textarea id="record-body" maxlength="30000" spellcheck="false" placeholder="이곳에서 떠오르는 설정을 자유롭게 적으세요."></textarea></div>
    <section class="record-connections"><header><h2>연결된 설정</h2><button id="link-toggle" type="button" aria-expanded="false">＋ 연결</button></header><div class="connection-list"></div><div class="link-picker" hidden><label>연결할 항목<input id="link-query" placeholder="이름 검색" autocomplete="off"></label><label>관계<input id="link-label" maxlength="100" placeholder="예: 살고 있는 곳"></label><div class="link-results"></div></div><div class="backlinks"></div></section>
    <details class="record-source"><summary>원본 기록</summary><p></p></details><button class="record-remove" type="button">이 항목 삭제</button></form>
    <footer class="document-status"><span role="status" id="record-status">이 브라우저에 저장</span><span id="record-count"></span></footer>`;
  main.append(outline,pane);
  const q=s=>pane.querySelector(s),list=outline.querySelector('.outline-list'),search=outline.querySelector('input[type=search]');
  const deleteConfirm=document.createElement('div');deleteConfirm.className='record-delete-confirm';deleteConfirm.hidden=true;deleteConfirm.innerHTML='<p></p><button type="button" id="record-delete-cancel">취소</button><button type="button" id="record-delete-confirm">삭제</button>';q('.record-remove').after(deleteConfirm);
  const locationButton=document.createElement('button');locationButton.type='button';locationButton.id='record-location';locationButton.textContent='위치와 분류 수정';q('.document-heading').append(locationButton);
  const menu=document.createElement('button');menu.id='workspace-menu';menu.textContent='목록';menu.setAttribute('aria-label','세계관 목록 열기');document.querySelector('.header-actions').prepend(menu);
  menu.onclick=()=>document.body.classList.toggle('outline-open');outline.querySelector('.outline-close').onclick=()=>document.body.classList.remove('outline-open');
  const draftKey=(record=key)=>`wm.writing-draft.v2.${world.id}.${encodeURIComponent(record)}`;
  const lastKey=()=>`wm.writing-open.v1.${world.id}`;
  const status=text=>{q('#record-status').textContent=text;};
  function values(){return {title:q('#record-title').value.trim(),body:q('#record-body').value,state:q('#record-state').value,area:q('#record-area').value,links:structuredClone(draftLinks)};}
  function remember(){
    dirty=true;revision++;status('저장 중');q('#record-count').textContent=`${q('#record-body').value.length.toLocaleString()}자`;
    try{localStorage.setItem(draftKey(),JSON.stringify({key,values:values()}));}catch{status('초안 보관 공간 부족. 저장이나 백업 필요');}
    clearTimeout(timer);timer=setTimeout(flush,700);
  }
  function flush(){
    clearTimeout(timer);if(!dirty||!key)return saving;
    const current=values(),savedKey=key,worldId=world.id,version=revision,storageKey=draftKey();
    if(!current.title){status('이름을 입력해야 저장 가능');return Promise.resolve(false);}
    dirty=false;
    saving=saving.then(async()=>{
      selfChange=true;let ok=false;
      try{ok=await callbacks.writeRecord(savedKey,current);}finally{selfChange=false;}
      if(world.id===worldId&&key===savedKey&&revision===version){
        if(ok){try{localStorage.removeItem(storageKey);}catch{}status('저장됨, 이 브라우저');renderOutline();}
        else{dirty=true;status('저장 실패. 초안 유지, 저장 버튼으로 재시도');}
      }
      return ok;
    }).catch(()=>{dirty=true;status('저장 실패. 초안 유지');return false;});
    return saving;
  }
  async function prepareExport(){
    if(await flush())return null;
    // Merge the live draft into the export independently of durable storage.
    try{if(dirty&&key){const current=values();updateRecord(world,key,current);return {key,values:current};}return null;}catch{status('이름과 설정 내용을 확인한 뒤 백업해 주세요.');return false;}
  }
  function renderOutline(){
    outline.querySelector('h1').textContent=world.name;list.replaceChildren();
    outline.querySelector('.celestial-summary').textContent=`항성 ${world.star}, ${world.moon?'위성 '+world.moon:'위성 없음'}`;
    const history=callbacks.history();q('#record-undo').disabled=!history.undo;q('#record-redo').disabled=!history.redo;
    const needle=search.value.trim().toLocaleLowerCase(),all=records(world),found=all.filter(r=>(filter==='all'||r.kind===filter||filter==='lore'&&r.kind==='faction')&&`${r.title} ${r.body} ${r.area}`.toLocaleLowerCase().includes(needle));
    for(const kind of Object.keys(kindNames)){
      const group=found.filter(r=>r.kind===kind);if(!group.length)continue;
      const heading=document.createElement('h2');heading.textContent=`${kindNames[kind]} ${group.length}`;list.append(heading);
      for(const record of group){const button=document.createElement('button');button.className='record-row';button.dataset.key=record.key;button.setAttribute('aria-pressed',String(key===record.key));
        const mark=document.createElement('span');mark.className='record-mark';mark.textContent=kindMarks[record.kind];
        const title=document.createElement('span');title.textContent=record.title;const badge=document.createElement('small');badge.textContent=recordStates[record.state];badge.dataset.state=record.state;
        try{if(localStorage.getItem(draftKey(record.key))){badge.textContent='미저장';badge.dataset.state='question';}}catch{}
        button.append(mark,title,badge);button.onclick=()=>open(record.key,true);list.append(button);
      }
    }
    if(!found.length){const empty=document.createElement('p');empty.className='outline-empty';empty.textContent=needle?'일치하는 설정이 없습니다.':'아직 작성한 기록이 없습니다.';list.append(empty);}
  }
  function renderConnections(){
    const container=q('.connection-list');container.replaceChildren();const all=records(world);
    for(const [index,link] of draftLinks.entries()){
      const target=all.find(r=>r.key===link.to);if(!target)continue;
      const row=document.createElement('div');row.className='connection-row';const button=document.createElement('button');button.type='button';button.textContent=`${kindMarks[target.kind]} ${target.title}`;button.onclick=()=>open(target.key,true);
      const label=document.createElement('small');label.textContent=link.label;const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`${target.title} 연결 해제`);remove.onclick=()=>{draftLinks.splice(index,1);remember();renderConnections();};row.append(button,label,remove);container.append(row);
    }
    if(!draftLinks.length){const empty=document.createElement('p');empty.className='connection-empty';empty.textContent='장소, 인물, 사건을 연결해 함께 찾아보세요.';container.append(empty);}
    const back=q('.backlinks');back.replaceChildren();const incoming=all.filter(r=>r.key!==key&&r.links.some(l=>l.to===key));
    if(incoming.length){const label=document.createElement('h3');label.textContent='이 설정을 참조하는 곳';back.append(label);for(const record of incoming){const b=document.createElement('button');b.type='button';b.textContent=`${kindMarks[record.kind]} ${record.title}`;b.onclick=()=>open(record.key,true);back.append(b);}}
  }
  function renderDocument(){
    deleteConfirm.hidden=true;
    const record=recordByKey(world,key);q('.document-empty').hidden=Boolean(record);q('.record-form').hidden=!record;if(!record){q('.document-kind').textContent='설정';q('#record-count').textContent='';return;}
    q('.document-kind').textContent=kindNames[record.kind];q('#record-title').value=record.title;q('#record-body').value=record.body;q('#record-state').value=record.state;q('#record-area').value=record.area;draftLinks=structuredClone(record.links);
    q('.record-area span').textContent=record.kind==='event'?'시점':record.kind==='place'?'지역':'분류 메모';
    q('#record-area').maxLength=record.kind==='place'?5000:100;
    q('#record-focus').hidden=record.kind!=='place';q('#record-location').hidden=record.kind!=='place';q('.record-source').hidden=!record.source;q('.record-source p').textContent=record.source;
    q('.link-picker').hidden=true;q('#link-toggle').setAttribute('aria-expanded','false');q('#record-count').textContent=`${record.body.length.toLocaleString()}자`;status('이 브라우저에 저장');renderConnections();
    try{const draft=JSON.parse(localStorage.getItem(draftKey()));if(draft?.key===key){
      const restored=recoverRecordDraft(world,key,draft.values),values=restored.values;
      q('#record-title').value=values.title;q('#record-body').value=values.body;q('#record-state').value=values.state;q('#record-area').value=values.area;draftLinks=values.links;dirty=true;revision++;q('#record-count').textContent=`${values.body.length.toLocaleString()}자`;
      status(restored.removedLinks?`초안 복구, 사라진 연결 ${restored.removedLinks}개 제외. 저장 필요`:'저장되지 않은 초안 복구. 저장 버튼으로 반영');renderConnections();
    }}catch{status('초안 복구 실패. 원본 초안은 브라우저에 유지됩니다.');}
  }
  async function open(next,selectMap=false){
    if(next===key){if(selectMap&&next.startsWith('place:'))callbacks.selectPlace(next.slice(6));return true;}
    const attempt=++opening;if(!await flush()||attempt!==opening)return false;
    if(!recordByKey(world,next))return false;
    key=next;dirty=false;renderDocument();q('.record-form').scrollTop=0;renderOutline();document.body.classList.remove('outline-open');
    try{localStorage.setItem(lastKey(),key);}catch{}
    callbacks.opened(key);
    if(selectMap&&next.startsWith('place:'))callbacks.selectPlace(next.slice(6));
    return true;
  }
  function renderLinkPicker(){
    const target=q('.link-results'),term=q('#link-query').value.trim().toLocaleLowerCase();target.replaceChildren();
    const found=records(world).filter(r=>r.key!==key&&!draftLinks.some(l=>l.to===r.key)&&`${r.title} ${r.area}`.toLocaleLowerCase().includes(term)).slice(0,12);
    for(const record of found){const button=document.createElement('button');button.type='button';button.textContent=`${kindNames[record.kind]} / ${record.title}`;button.onclick=()=>{draftLinks.push({to:record.key,label:q('#link-label').value.trim()||'관련 항목'});remember();renderConnections();q('.link-picker').hidden=true;q('#link-toggle').setAttribute('aria-expanded','false');};target.append(button);}
    if(!found.length){const empty=document.createElement('p');empty.textContent='연결할 항목이 없습니다. 왼쪽에서 새 기록을 만드세요.';target.append(empty);}
  }
  q('.record-form').onsubmit=e=>{e.preventDefault();flush();};
  for(const field of ['#record-title','#record-body','#record-area'])q(field).addEventListener('input',remember);
  q('#record-state').onchange=remember;q('#record-save').onclick=()=>flush();q('#record-undo').onclick=async()=>{if(await flush())callbacks.undo();};q('#record-redo').onclick=async()=>{if(await flush())callbacks.redo();};
  q('#record-template').onclick=()=>{const record=recordByKey(world,key),addition=(q('#record-body').value?'\n\n':'')+templates[record.kind].map(h=>`## ${h}\n`).join('\n');if(q('#record-body').value.length+addition.length>30000){status('설정은 30,000자까지 작성 가능');return;}q('#record-body').value+=addition;remember();q('#record-body').focus();};
  q('#record-focus').onclick=()=>callbacks.focusPlace(key.slice(6));
  q('#record-location').onclick=async()=>{if(await flush())callbacks.editPlace(key.slice(6));};
  q('#empty-place').onclick=()=>callbacks.newPlace();
  q('#link-toggle').onclick=()=>{q('.link-picker').hidden=!q('.link-picker').hidden;q('#link-toggle').setAttribute('aria-expanded',String(!q('.link-picker').hidden));if(!q('.link-picker').hidden){q('#link-query').value='';renderLinkPicker();q('#link-query').focus();}};
  q('#link-query').oninput=renderLinkPicker;
  search.oninput=renderOutline;
  function setFilter(value){filter=value;outline.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===value)));renderOutline();}
  outline.querySelectorAll('[data-kind]').forEach(button=>button.onclick=()=>setFilter(button.dataset.kind));
  outline.querySelector('#new-record').onclick=async()=>{if(!await flush())return;const kind=outline.querySelector('select').value;if(kind==='place'){callbacks.newPlace();return;}const button=outline.querySelector('#new-record');button.disabled=true;selfChange=true;let result;try{result=await callbacks.addEntry(kind,`새 ${kindNames[kind]}`,key);}finally{selfChange=false;button.disabled=false;}if(result){setFilter('all');await open(result,true);q('#record-title').focus();q('#record-title').select();}else status('새 기록 저장 실패. 저장 공간을 확인해 주세요.');};
  q('.record-remove').onclick=()=>{deleteConfirm.querySelector('p').textContent=`"${recordByKey(world,key).title}" 삭제 시 연결도 해제됩니다. 실행 취소로 복구할 수 있습니다.`;deleteConfirm.hidden=false;q('#record-delete-cancel').focus();};
  q('#record-delete-cancel').onclick=()=>{deleteConfirm.hidden=true;};
  q('#record-delete-confirm').onclick=async()=>{const removing=key;if(!await flush()||removing!==key)return;const ok=await callbacks.removeRecord(removing);if(ok){key=null;callbacks.opened(null);renderDocument();renderOutline();status('삭제됨. 실행 취소로 복구 가능');}else status('삭제 내용 저장 실패. 저장이나 백업 필요');};
  outline.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{if(b.dataset.file!=='export'&&!await flush())return;callbacks.file(b.dataset.file);});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flush();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  renderOutline();
  return {flush,prepareExport,recoveryKey(){try{return localStorage.getItem(lastKey());}catch{return null;}},openRecord:open,openPlace:id=>open(`place:${id}`),show(kind){setFilter(kind);document.body.classList.add('outline-open');const first=records(world).find(r=>kind==='all'||r.kind===kind||kind==='lore'&&r.kind==='faction');if(first&&!matchMedia('(max-width:780px)').matches)open(first.key,true);},update(next){const changed=world.id!==next.id;world=next;renderOutline();if(changed){key=null;dirty=false;saving=Promise.resolve(true);clearTimeout(timer);const first=records(world)[0];if(first)open(first.key);else renderDocument();}else if(!selfChange&&!dirty)renderDocument();}};
}
