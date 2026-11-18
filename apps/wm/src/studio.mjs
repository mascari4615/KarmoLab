const icons={
  move:'<path d="m9 3 3-2 3 2M12 1v22m-3-2 3 2 3-2M3 9l-2 3 2 3M1 12h22m-2-3 2 3-2 3"/>',
  land:'<path d="m3 18 5-7 4 3 4-9 5 13M2 21h20M14 9l3 1"/>',
  water:'<path d="M2 8q3-4 6 0t6 0 8 0M2 14q3-4 6 0t6 0 8 0M2 20q3-4 6 0t6 0 8 0"/>',
  mountain:'<path d="m2 21 8-18 6 13 3-5 4 10ZM7 10l3 2 2-2M10 3l3 18"/>',
  forest:'<path d="m8 2-5 8h3l-4 7h5v5h2v-5h5l-4-7h3ZM16 6l5 8h-2l3 5h-8M17 19v3"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  book:'<path d="M12 5Q6 1 2 4v16q5-3 10 1 5-4 10-1V4q-4-3-10 1Zm0 0v16"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  settings:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  undo:'<path d="M4 10h10a6 6 0 1 1 0 12M4 10l5-5M4 10l5 5"/>',
  redo:'<path d="M20 10H10a6 6 0 1 0 0 12M20 10l-5-5M20 10l-5 5"/>',
};
const svg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
const tools=[
  {id:'navigate',label:'이동',key:'V',icon:'move',hint:'드래그로 이동 · 휠로 확대'},
  {id:'raise',label:'육지',key:'B',icon:'land',radius:.045,strength:.14,hint:'드래그하여 육지 만들기'},
  {id:'lower',label:'바다',key:'E',icon:'water',radius:.045,strength:.14,hint:'드래그하여 땅을 깎고 바다 만들기'},
  {id:'mountain',label:'산맥',key:'M',icon:'mountain',radius:.018,strength:.28,hint:'능선이 이어질 방향으로 드래그'},
  {id:'forest',label:'환경',key:'F',icon:'forest',radius:.035,strength:.09,hint:'숲, 초원, 사막, 빙하를 선택하여 칠하기'},
  {id:'place',label:'장소',key:'P',icon:'pin',hint:'지도에서 장소를 만들 위치 선택'},
];

export function createStudio(world,{editor,workspace,focusEditing}){
  document.body.classList.add('world-studio');
  const main=document.querySelector('main'),header=document.querySelector('.site-header');
  const rail=document.createElement('nav');rail.className='studio-tools';rail.setAttribute('aria-label','세계 제작 도구');
  rail.innerHTML=tools.map(t=>`<button data-studio-tool="${t.id}" aria-label="${t.label} 도구" aria-pressed="${t.id==='navigate'}" title="${t.label} (${t.key})">${svg(t.icon)}<span>${t.label}</span></button>`).join('')+`<span class="tool-divider"></span><button id="studio-records" aria-label="세계관 기록">${svg('book')}<span>기록</span></button><button id="studio-world" aria-label="천체 설정">${svg('globe')}<span>천체</span></button><div class="tool-spacer"></div><button id="studio-undo" aria-label="실행 취소" disabled>${svg('undo')}</button><button id="studio-redo" aria-label="다시 실행" disabled>${svg('redo')}</button>`;
  main.append(rail);
  const identity=document.createElement('div');identity.className='studio-identity';
  identity.innerHTML='<button id="studio-world-name" aria-label="현재 행성과 행성 목록"></button><span>세계 제작</span>';
  header.querySelector('.brand').after(identity);
  identity.querySelector('button').onclick=editor.openLibrary;
  header.append(document.querySelector('.mode-switch'));
  const save=document.createElement('button');save.id='studio-save';save.textContent='전체 저장';save.onclick=async()=>{if(await workspace.flush())await editor.save();};
  document.querySelector('.header-actions').prepend(save);
  const saveStatus=document.createElement('span');saveStatus.id='studio-status';saveStatus.setAttribute('role','status');saveStatus.textContent='이 브라우저에 저장';save.before(saveStatus);
  const saveProblem=document.createElement('div');saveProblem.id='studio-save-problem';saveProblem.hidden=true;saveProblem.innerHTML='<span></span><button>파일로 백업</button>';main.append(saveProblem);
  saveProblem.querySelector('button').onclick=()=>document.querySelector('#export-world').click();
  document.addEventListener('wm-status',event=>{const message=event.detail.message;if(message==='지도나 행성에서 새 장소의 위치를 누르세요.')return;saveStatus.textContent=message.includes('저장됨')?'저장됨':message;saveStatus.title=message;const failed=/실패|부족|차단|저장.*못|저장.*필요|입력해야/.test(message);saveStatus.dataset.problem=String(failed);saveProblem.hidden=!failed;saveProblem.querySelector('span').textContent=message;});
  const hint=document.createElement('div');hint.className='studio-hint';hint.innerHTML='<strong>이동</strong><span>드래그로 이동 · 휠로 확대</span><kbd>V</kbd>';main.append(hint);
  const refreshHints=()=>{if(rail.querySelector('[data-studio-tool=navigate]').getAttribute('aria-pressed')==='true')hint.querySelector('span').textContent=document.body.classList.contains('planet-mode')?'드래그로 회전 · 휠로 확대':tools[0].hint;};
  const caption=document.createElement('div');caption.className='studio-caption';caption.innerHTML='<strong></strong><span></span>';main.append(caption);
  const legacy=document.createElement('a');legacy.className='studio-legacy';legacy.href='?world=undo-atlas-v2';legacy.textContent='초기 저장본 · 새 지도 사본 열기 ↗';main.append(legacy);
  legacy.onclick=async event=>{event.preventDefault();if(await workspace.flush()&&await editor.save())location.assign(legacy.href);};
  const editorPanel=document.querySelector('#editor');
  for(const id of ['brush-size','brush-strength']){
    const input=document.querySelector('#'+id),output=document.createElement('output');input.setAttribute('aria-label',id==='brush-size'?'붓 반경':'붓 세기');if(id==='brush-size')input.parentElement.firstChild.textContent='붓 반경';output.htmlFor=id;output.className='brush-value';input.before(output);
    const refresh=()=>{output.textContent=id==='brush-size'?(Number(input.value)*1.8).toFixed(2)+'°':`${Number(input.value)} / ${input.max}`;};input.addEventListener('input',refresh);document.addEventListener('wm-tool',refresh);refresh();
  }
  const title=editorPanel.querySelector('h2');
  function activate(def){
    editor.chooseTool(def.id==='mountain'?'raise':def.id,def);
    rail.querySelectorAll('[data-studio-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioTool===def.id)));
    title.textContent=`${def.label} ${def.id==='navigate'?'':'그리기'}`;
    hint.querySelector('strong').textContent=def.label;hint.querySelector('span').textContent=def.hint;hint.querySelector('kbd').textContent=def.key;
    editorPanel.dataset.category=def.id;document.body.classList.remove('celestial-open');
    refreshHints();
  }
  rail.querySelectorAll('[data-studio-tool]').forEach(button=>button.onclick=async()=>{if(await workspace.flush())activate(tools.find(t=>t.id===button.dataset.studioTool));});
  rail.querySelector('#studio-records').onclick=async()=>{if(!await workspace.flush())return;const open=!document.body.classList.contains('outline-open');editor.chooseTool('navigate');document.body.classList.remove('celestial-open');document.body.classList.toggle('outline-open',open);};
  rail.querySelector('#studio-world').onclick=async()=>{if(!await workspace.flush())return;editor.openSettings();document.body.classList.add('celestial-open');document.body.classList.remove('outline-open','document-open');editorPanel.querySelectorAll('details').forEach(d=>d.open=true);title.textContent='천체 설정';};
  rail.querySelector('#studio-undo').onclick=async()=>{if(await workspace.flush())editor.undoEdit();};
  rail.querySelector('#studio-redo').onclick=async()=>{if(await workspace.flush())editor.redoEdit();};
  document.addEventListener('wm-history',event=>{rail.querySelector('#studio-undo').disabled=!event.detail.undo;rail.querySelector('#studio-redo').disabled=!event.detail.redo;});
  document.addEventListener('wm-tool',event=>{const def=tools.find(t=>t.id===event.detail.tool);if(def){rail.querySelectorAll('[data-studio-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.studioTool===def.id)));hint.querySelector('strong').textContent=def.label;hint.querySelector('span').textContent=def.hint;hint.querySelector('kbd').textContent=def.key;editorPanel.dataset.category=def.id;title.textContent=def.id==='navigate'?'세계 편집':`${def.label} 그리기`;}});
  editorPanel.querySelector('#editor-close').addEventListener('click',()=>{document.body.classList.remove('celestial-open');activate(tools[0]);});
  document.addEventListener('keydown',async event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable],dialog'))return;
    const def=tools.find(t=>t.key.toLowerCase()===event.key.toLowerCase());
    if(def){event.preventDefault();if(await workspace.flush())activate(def);}
    if(event.key==='Escape'){document.body.classList.remove('outline-open','document-open','celestial-open');activate(tools[0]);}
  });
  const update=next=>{world=next;identity.querySelector('button').textContent=next.name+' ▾';identity.querySelector('button').title=next.name;caption.querySelector('strong').textContent=next.name;caption.querySelector('span').textContent=`${next.star} · ${next.moon||'위성 없음'} · 동주기자전`;legacy.hidden=next.id!=='undo'||next.width>256;};
  document.addEventListener('wm-tool',refreshHints);
  document.querySelector('#record-save').textContent='기록 저장';document.querySelector('label[for=record-body]').textContent='설정 작성';
  document.addEventListener('wm-tool',event=>{if(event.detail.tool!=='navigate')focusEditing?.();});
  document.addEventListener('wm-status',event=>{if(event.detail.message.includes('저장됨'))save.textContent='저장됨';else if(event.detail.message==='저장 중')save.textContent='저장 중';else if(saveStatus.dataset.problem==='true')save.textContent='저장 확인';});
  update(world);refreshHints();return {update,refreshHints};
}
