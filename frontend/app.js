// ======== API 설정 (A안: Django in-memory) ========
const API_BASE = "http://127.0.0.1:8000/api";

// ======== 유틸 ========
const Tools = { SELECT:'SELECT', NODE:'NODE', LINK:'LINK', ARROW:'ARROW', POLYGON:'POLYGON', RECT:'RECT', MOVE_NODE:'MOVE_NODE', PICK_START:'PICK_START' };
const MIN_FLOOR=1, MAX_FLOOR=12;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2,10);

function fileToDataURL(file){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
}

// ======== 프로젝트 상태 ========
function emptyFloor(){ return { bg:null, nodes:[], links:[], arrows:[], polygons:[], rects:[], startPoint:null }; }
function emptyProject(floors=4,startFloor=1,scale=0.33167){
  return { id: undefined, name:'새 프로젝트', floors, startFloor, scale, currentFloor:startFloor, floorData:Array.from({length:floors},()=>emptyFloor()), modified:false };
}
let project = emptyProject();

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
let view = { x:0, y:0, scale:1 };
let isPanning=false; let panStart={x:0,y:0,vx:0,vy:0};
let tool = Tools.SELECT; let hoverId=null; let selectedId=null;
let temp = { linkFrom:null, arrowFrom:null, polygonPts:[], rectStart:null };
let lockedBg=false;

function cfIndex(){ return project.currentFloor-1; }
function curFloor(){ return project.floorData[cfIndex()] || emptyFloor(); }
function markModified(v=true){ project.modified=!!v; updateSaveState(); }

// ======== 캔버스 ========
function updateCanvasSize(){ canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; }
window.addEventListener('resize', ()=>{ updateCanvasSize(); draw(); });

function toWorld(px,py){ return { x:(px*devicePixelRatio - view.x)/view.scale, y:(py*devicePixelRatio - view.y)/view.scale } }
function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function nearestNode(pt,rad=8){ const f=curFloor(); let best=null, dmin=1e9; f.nodes.forEach(n=>{ const d=distance(pt,n); if(d<rad && d<dmin){best=n; dmin=d} }); return best; }
function drawArrow(from,to,head=10){
  const ang = Math.atan2(to.y-from.y, to.x-from.x);
  ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(to.x,to.y);
  ctx.lineTo(to.x - head*Math.cos(ang-Math.PI/6), to.y - head*Math.sin(ang-Math.PI/6));
  ctx.lineTo(to.x - head*Math.cos(ang+Math.PI/6), to.y - head*Math.sin(ang+Math.PI/6));
  ctx.closePath(); ctx.fill();
}

function draw(){
  const f = curFloor();
  ctx.save();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);

  if(f.bg){ const img=new Image(); img.src=f.bg; if(img.complete){ ctx.imageSmoothingEnabled=false; ctx.drawImage(img,0,0); } else { img.onload=()=>draw(); } }

  // links
  ctx.lineWidth=2; ctx.strokeStyle='#2563eb';
  f.links.forEach(l=>{ const a=f.nodes.find(n=>n.id===l.a), b=f.nodes.find(n=>n.id===l.b); if(a&&b){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }});

  // arrows
  ctx.lineWidth=2; ctx.strokeStyle='#16a34a'; ctx.fillStyle='#16a34a';
  f.arrows.forEach(ar=>{ const a=f.nodes.find(n=>n.id===ar.a), b=f.nodes.find(n=>n.id===ar.b); if(a&&b) drawArrow(a,b,10); });

  // polygons
  ctx.lineWidth=2; ctx.strokeStyle='#9333ea'; ctx.fillStyle='rgba(147,51,234,.15)';
  f.polygons.forEach(pg=>{ if(pg.points.length<2) return; ctx.beginPath(); ctx.moveTo(pg.points[0].x,pg.points[0].y); for(let i=1;i<pg.points.length;i++) ctx.lineTo(pg.points[i].x,pg.points[i].y); ctx.closePath(); ctx.fill(); ctx.stroke(); });

  // rects
  ctx.lineWidth=2; ctx.strokeStyle='#f59e0b'; ctx.fillStyle='rgba(245,158,11,.15)';
  f.rects.forEach(rc=>{ ctx.beginPath(); ctx.rect(rc.x,rc.y,rc.w,rc.h); ctx.fill(); ctx.stroke(); });

  // nodes
  f.nodes.forEach(n=>{ const r=5; ctx.beginPath(); ctx.fillStyle=(n.id===hoverId)?'#ef4444':'#0f172a'; ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fill(); if(n.id===selectedId){ ctx.lineWidth=2; ctx.strokeStyle='#ef4444'; ctx.stroke(); }});

  if(f.startPoint){ const s=f.startPoint; ctx.fillStyle='#dc2626'; ctx.beginPath(); ctx.arc(s.x,s.y,6,0,Math.PI*2); ctx.fill(); }

  if(tool===Tools.POLYGON && temp.polygonPts.length>0){ ctx.lineWidth=1.5; ctx.strokeStyle='#9333ea'; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(temp.polygonPts[0].x,temp.polygonPts[0].y); for(let i=1;i<temp.polygonPts.length;i++) ctx.lineTo(temp.polygonPts[i].x,temp.polygonPts[i].y); ctx.stroke(); ctx.setLineDash([]); }

  ctx.restore();
}

function onWheel(e){ e.preventDefault();
  const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const prev={...view}, factor=Math.exp((-e.deltaY)*0.001);
  const newScale=Math.min(6, Math.max(0.2, prev.scale*factor));
  const wx=(mx*devicePixelRatio - prev.x)/prev.scale;
  const wy=(my*devicePixelRatio - prev.y)/prev.scale;
  const nx=wx*newScale + prev.x; const ny=wy*newScale + prev.y;
  view.scale=newScale; view.x += (prev.x - nx); view.y += (prev.y - ny); draw();
}
function onMouseDown(e){
  const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const world=toWorld(mx,my);
  if(e.button===2 || (!lockedBg && e.button===1)){ isPanning=true; panStart={x:world.x,y:world.y,vx:view.x,vy:view.y}; return; }
  const f=curFloor();
  if(tool===Tools.SELECT){ const n=nearestNode(world); selectedId = n? n.id : null; }
  else if(tool===Tools.NODE){ const n={id:uid('n'), x:world.x, y:world.y}; f.nodes.push(n); selectedId=n.id; markModified(); }
  else if(tool===Tools.MOVE_NODE){ const n=nearestNode(world); if(n) selectedId=n.id; }
  else if(tool===Tools.LINK){ const n=nearestNode(world); if(n){ if(!temp.linkFrom) temp.linkFrom=n.id; else if(temp.linkFrom!==n.id){ f.links.push({id:uid('lk'), a:temp.linkFrom, b:n.id}); temp.linkFrom=null; markModified(); } } }
  else if(tool===Tools.ARROW){ const n=nearestNode(world); if(n){ if(!temp.arrowFrom) temp.arrowFrom=n.id; else if(temp.arrowFrom!==n.id){ f.arrows.push({id:uid('ar'), a:temp.arrowFrom, b:n.id}); temp.arrowFrom=null; markModified(); } } }
  else if(tool===Tools.POLYGON){ temp.polygonPts.push(world); }
  else if(tool===Tools.RECT){ temp.rectStart = world; /* 단순화*/ }
  else if(tool===Tools.PICK_START){ f.startPoint={x:world.x,y:world.y}; setStartInputs(); tool=Tools.SELECT; markModified(); }
  draw();
}
function onMouseMove(e){
  const rect=canvas.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const world=toWorld(mx,my);
  if(isPanning){ const dx=world.x-panStart.x, dy=world.y-panStart.y; view.x = panStart.vx + dx*view.scale; view.y = panStart.vy + dy*view.scale; draw(); return; }
  const n=nearestNode(world); hoverId = n? n.id : null;
  if(tool===Tools.MOVE_NODE && selectedId){ const f=curFloor(); const idx=f.nodes.findIndex(n=>n.id===selectedId); if(idx>=0){ f.nodes[idx].x=world.x; f.nodes[idx].y=world.y; markModified(); } }
  draw();
}
function onMouseUp(){ isPanning=false; }
function onDblClick(){ view={x:0,y:0,scale:1}; draw(); }
function onContextMenu(e){ e.preventDefault(); }

canvas.addEventListener('wheel', onWheel, {passive:false});
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('dblclick', onDblClick);
canvas.addEventListener('contextmenu', onContextMenu);
window.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){ temp={linkFrom:null,arrowFrom:null,polygonPts:[],rectStart:null}; selectedId=null; draw(); }
  if(e.key==='Enter' && tool===Tools.POLYGON && temp.polygonPts.length>=3){ curFloor().polygons.push({id:uid('pg'), points:temp.polygonPts.slice(), closed:true}); temp.polygonPts=[]; markModified(); draw(); }
  if(e.key==='Delete' && selectedId){ const f=curFloor(); f.nodes = f.nodes.filter(n=>n.id!==selectedId); f.links = f.links.filter(l=>l.a!==selectedId && l.b!==selectedId); f.arrows = f.arrows.filter(a=>a.a!==selectedId && a.b!==selectedId); selectedId=null; markModified(); draw(); }
});

// ======== 좌측/우측 패널 ========
const toolList=[ ['선택','V',Tools.SELECT],['노드','N',Tools.NODE],['링크','L',Tools.LINK],['화살표','A',Tools.ARROW],['폴리곤','P',Tools.POLYGON],['직사각형','R',Tools.RECT],['노드 이동','',Tools.MOVE_NODE],['시작점 찍기','',Tools.PICK_START] ];
function renderTools(){ const wrap=$('#toolGrid'); wrap.innerHTML=''; toolList.forEach(([label, hk, val])=>{ const b=document.createElement('button'); b.className='toolbtn'+(tool===val?' active':''); b.textContent=label + (hk?` (${hk})`: ''); b.onclick=()=>{ tool=val; renderTools(); }; wrap.appendChild(b); }); }

function renderFloorSelect(){ const sel=$('#floorSelect'); sel.innerHTML = Array.from({length:project.floors}, (_,i)=>`<option value="${i+1}">${i+1}층</option>`).join(''); sel.value=project.currentFloor; sel.onchange=()=>{ project.currentFloor=Number(sel.value); updateStartInputs(); draw(); renderStats(); } }
function setBgForFloor(idx, dataUrl){ project.floorData[idx].bg=dataUrl; markModified(); draw(); }
$('#bgLoader').addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if(!f) return; const du=await fileToDataURL(f); setBgForFloor(cfIndex(), du); e.target.value=''; });
$('#bgClear').addEventListener('click', ()=>{ setBgForFloor(cfIndex(), null); });
$('#lockBg').addEventListener('change', (e)=>{ lockedBg = e.target.checked; });

function setStartInputs(){ const f=curFloor(); $('#startX').value = f.startPoint?.x ?? ''; $('#startY').value = f.startPoint?.y ?? ''; }
function updateStartInputs(){ setStartInputs(); }
$('#startX').addEventListener('change', (e)=>{ const x=Number(e.target.value); const f=curFloor(); f.startPoint = { x, y: f.startPoint?.y ?? 0 }; markModified(); draw(); });
$('#startY').addEventListener('change', (e)=>{ const y=Number(e.target.value); const f=curFloor(); f.startPoint = { x: f.startPoint?.x ?? 0, y }; markModified(); draw(); });
$('#btnPickStart').addEventListener('click', ()=>{ tool=Tools.PICK_START; renderTools(); });

function floorStats(fd){ return { nodes:fd.nodes.length, links:fd.links.length, arrows:fd.arrows.length, polygons:fd.polygons.length, rects:fd.rects.length } }
function renderStats(){
  const cs = floorStats(curFloor());
  const ts = project.floorData.reduce((acc,fd)=>{ const s=floorStats(fd); acc.nodes+=s.nodes; acc.links+=s.links; acc.arrows+=s.arrows; acc.polygons+=s.polygons; acc.rects+=s.rects; return acc; }, {nodes:0,links:0,arrows:0,polygons:0,rects:0});
  const toHtml = (title,val) => `<div class="row" style="justify-content:space-between"><span class="muted">${title}</span><strong>${val}</strong></div>`;
  $('#curStats').innerHTML = ['노드','링크','화살표','폴리곤','직사각형'].map((k,i)=>toHtml(k,[cs.nodes,cs.links,cs.arrows,cs.polygons,cs.rects][i])).join('');
  $('#totalStats').innerHTML = ['노드','링크','화살표','폴리곤','직사각형'].map((k,i)=>toHtml(k,[ts.nodes,ts.links,ts.arrows,ts.polygons,ts.rects][i])).join('');
}

$('#projName').addEventListener('change', (e)=>{ project.name = e.target.value; markModified(); });
$('#scaleBadge').textContent = `m/pixel: ${project.scale}`;
function updateSaveState(){ $('#saveState').textContent = project.modified? '수정됨' : '저장됨'; $('#stateText').textContent = $('#saveState').textContent; }

// ======== 로컬 Import/Export ========
$('#btnExport').addEventListener('click', ()=>{ const name=$('#fileName').value || 'project.json'; const data=JSON.stringify(project); const blob=new Blob([data],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); project.modified=false; updateSaveState(); });
$('#importFile').addEventListener('change', (e)=>{ const file=e.target.files?.[0]; if(!file) return; const fr=new FileReader(); fr.onload=()=>{ try{ const obj=JSON.parse(fr.result); if(!obj.floorData) throw new Error('Invalid project'); project=obj; $('#projName').value=project.name; $('#scaleBadge').textContent=`m/pixel: ${project.scale}`; renderFloorSelect(); setStartInputs(); renderStats(); draw(); updateSaveState(); }catch(err){ alert('프로젝트 파일을 읽을 수 없습니다.\n'+err.message); } }; fr.readAsText(file); e.target.value=''; });

// ======== 서버 연동(A안, 메모리 저장) ========
async function apiCreateProject(proj){
  const res = await fetch(`${API_BASE}/projects/`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(proj) });
  if(!res.ok) throw new Error('create failed'); return await res.json();
}
async function apiGetProject(id){
  const res = await fetch(`${API_BASE}/projects/${id}/`); if(!res.ok) throw new Error('get failed'); return await res.json();
}
async function apiUpdateProject(id, proj){
  const res = await fetch(`${API_BASE}/projects/${id}/`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(proj) });
  if(!res.ok) throw new Error('update failed'); return await res.json();
}

$('#btnSaveServer').addEventListener('click', async ()=>{
  try{
    const payload = {...project}; // dataURL 포함 상태로 통째 저장
    if(!project.id){
      const created = await apiCreateProject(payload);
      project = created;
      $('#serverProjectId').value = created.id;
      alert(`서버 저장 완료 (id=${created.id})`);
    }else{
      const updated = await apiUpdateProject(project.id, payload);
      project = updated;
      alert(`서버 업데이트 완료 (id=${updated.id})`);
    }
  }catch(e){ alert('서버 저장 실패: '+e.message); }
});

$('#btnLoadServer').addEventListener('click', async ()=>{
  try{
    const id = Number($('#serverProjectId').value);
    if(!id) return alert('project id 입력');
    const loaded = await apiGetProject(id);
    project = loaded;
    $('#projName').value=project.name; $('#scaleBadge').textContent=`m/pixel: ${project.scale}`;
    renderFloorSelect(); setStartInputs(); renderStats(); view={x:0,y:0,scale:1}; updateCanvasSize(); draw(); updateSaveState();
  }catch(e){ alert('불러오기 실패: '+e.message); }
});

// ======== 새 프로젝트 버튼 (간단 버전: 모달 없이 초기화) ========
$('#btnNew').addEventListener('click', ()=>{
  project = emptyProject(4,1,0.33167);
  project.id = undefined;
  $('#projName').value=project.name; $('#scaleBadge').textContent=`m/pixel: ${project.scale}`;
  renderFloorSelect(); setStartInputs(); renderStats(); view={x:0,y:0,scale:1}; updateCanvasSize(); draw(); updateSaveState();
});

// ======== 초기화 ========
const toolList=[ ['선택','V',Tools.SELECT],['노드','N',Tools.NODE],['링크','L',Tools.LINK],['화살표','A',Tools.ARROW],['폴리곤','P',Tools.POLYGON],['직사각형','R',Tools.RECT],['노드 이동','',Tools.MOVE_NODE],['시작점 찍기','',Tools.PICK_START] ];
function renderTools(){ const wrap=$('#toolGrid'); wrap.innerHTML=''; toolList.forEach(([label, hk, val])=>{ const b=document.createElement('button'); b.className='toolbtn'+(tool===val?' active':''); b.textContent=label + (hk?` (${hk})`: ''); b.onclick=()=>{ tool=val; renderTools(); }; wrap.appendChild(b); }); }

function init(){
  $('#projName').value=project.name; renderTools(); renderFloorSelect(); updateCanvasSize(); setStartInputs(); renderStats(); draw(); updateSaveState();
}
init();
