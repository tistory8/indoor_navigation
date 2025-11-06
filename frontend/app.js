// --------------------------------------------------------------
// ------------------------- Django Proejct ---------------------
const API_BASE = "http://127.0.0.1:8000/api";

// 서버에 새 프로젝트 저장 (Instar JSON 그대로)
async function apiCreateProject(instarJson) {
  const res = await fetch(`${API_BASE}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(instarJson),
  });
  return res.json(); // { id, ...instarJson }
}

async function apiUpdateProject(id, instarJson) {
  const res = await fetch(`${API_BASE}/projects/${id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(instarJson),
  });
  return res.json();
}

async function apiGetProject(id) {
  const res = await fetch(`${API_BASE}/projects/${id}/`);
  return res.json();
}

async function apiListProjects() {
  const res = await fetch(`${API_BASE}/projects/`);
  return res.json();
}

// 프로젝트 삭제(DELETE /projects/:id)
async function apiDeleteProject(id) {
  const res = await fetch(`${API_BASE}/projects/${id}/`, { method: "DELETE" });
  return res.json();
}

function collectProjectSettingsFromForm() {
  // 실제 폼 id/name은 네 index.html에 맞춰 수정해.
  const name = document.querySelector('#projName').value?.trim() || '새 프로젝트';
  const floors = parseInt(document.querySelector('#floorCount').value || '1', 10);
  const startFloor = parseInt(document.querySelector('#startFloor').value || '1', 10);
  const scale = parseFloat(document.querySelector('#scale').value || '0') || 0;

  // 층별 이미지 초기화 (배경 이미지는 확인 후 업로드 기능 붙일 때 URL 채움)
  const images = Array.from({ length: floors }, () => null);

  // 에디터가 기대하는 Instar 포맷의 최소 구조
  return {
    meta: { projectName: name, projectAuthor: '' },
    scale,
    // 네가 이미 쓰는 내부 구조가 있다면 serialize 함수에서 덮어쓴다.
    nodes: {},
    connections: {},
    special_points: {},
    north_reference: null, // {from_node, to_node, azimuth} 붙일 예정이면 남겨둠
    images,
    // 선택: 초기 값들 (시작층 등)도 meta 아래에 보관해도 무방
    startFloor,
  };
}

// 확인 버튼 핸들러
async function onProjectCreateConfirm() {
  try {
    const payload = collectProjectSettingsFromForm();

    // ✅ 새 프로젝트를 DB에 즉시 저장
    const saved = await apiCreateProject(payload);

    // 발급된 id 보관
    state.projectId = saved.id;
    state.modified = false;

    // 에디터 화면을 초기화/세팅
    hydrateEditorFromInstar(saved); // 이미 있는 함수면 사용, 아니면 작성(아래 참고)

    // UI 상태 갱신(프로젝트명/저장됨 배지 등)
    updateProjectHeader(saved.meta?.projectName || '새 프로젝트', '저장됨');

    console.log('프로젝트 생성/저장 완료:', saved);
  } catch (err) {
    console.error('프로젝트 생성 실패:', err);
    alert('프로젝트 생성에 실패했습니다.');
  }
}

// --------------------------------------
// ------------ App State ---------------
const state = {
  projectId: null,
  modified: false,

  loaded: false,
  projectName: "새 프로젝트",
  projectAuthor: "",
  floors: 4,
  startFloor: 0,
  scale: 0.33167,
  images: {}, // { floorIndex: ObjectURL }
  currentFloor: 0,
  imageLocked: true,

  graph: { nodes: [], links: [] },
  view: { scale: 1, tx: 0, ty: 0 },
  tool: "select",
  selection: { type: null, id: null },

  snap: {
    active: true,
    tol: 10, // 스냅 허용 픽셀
    cand: { v: null, h: null }, // { v:{x,ax,ay,dx}, h:{y,ax,ay,dy} }
  },
  compass: { picking: null, tempA: null, tempB: null },
};
state.mouse = { x: 0, y: 0 };

// snapshot
state.keys = { shift: false };
state.snapGuide = null;
state.longPress = { active: false, timer: null, threshold: 220, anchor: null };
state.longPressMoveCancel = 6;

// save
state.northRef = state.northRef || {
  from_node: null,
  to_node: null,
  azimuth: 0,
};

// ------- Elements -------
const els = {
  btnNew: document.getElementById("btnNew"),
  btnOpen: document.getElementById("btnOpen"),
  btnSave: document.getElementById("btnSave"),
  btnExport: document.getElementById("btnExport"),
  floorSelect: document.getElementById("floorSelect"),
  btnLoadBg: document.getElementById("btnLoadBg"),
  btnClearBg: document.getElementById("btnClearBg"),
  btnLock: document.getElementById("btnLock"),
  bgName: document.getElementById("bgName"),
  canvas: document.getElementById("canvas"),
  stage: document.getElementById("stage"),
  bgImg: document.getElementById("bgImg"),
  empty: document.getElementById("emptyState"),
  status: document.getElementById("status"),
  projName: document.getElementById("projName"),
  projAuthor: document.getElementById("projAuthor"),
  projState: document.getElementById("projState"),
  floorLbl: document.getElementById("floorLbl"),
  selLbl: document.getElementById("selLbl"),
  layerInfo: document.getElementById("layerInfo"),
  totalInfo: document.getElementById("totalInfo"),

  // modal
  modalBack: document.getElementById("newModalBack"),
  closeModal: document.getElementById("closeModal"),
  projectName: document.getElementById("projectName"),
  projectAuthor: document.getElementById("projectAuthor"),
  floorCount: document.getElementById("floorCount"),
  startFloor: document.getElementById("startFloor"),
  scale: document.getElementById("scale"),
  floorFiles: document.getElementById("floorFiles"),
  modalOk: document.getElementById("btnModalOk"),
  modalReset: document.getElementById("btnModalReset"),
  startX: document.getElementById("startX"),
  startY: document.getElementById("startY"),
  btnPickStart: document.getElementById("btnPickStart"),
  overlay: document.getElementById("overlay"),

  // node props
  nodeGroup: document.getElementById("nodeGroup"),
  nodeId: document.getElementById("nodeId"),
  nodeName: document.getElementById("nodeName"),
  nodeX: document.getElementById("nodeX"),
  nodeY: document.getElementById("nodeY"),
  nodeType: document.getElementById("nodeType"),

  // link props
  linkGroup: document.getElementById("linkGroup"),
  linkId: document.getElementById("linkId"),
  linkFrom: document.getElementById("linkFrom"),
  linkTo: document.getElementById("linkTo"),

  // compass props
  compassPanel: document.getElementById("compassPanel"),
  compassFrom: document.getElementById("compassFrom"),
  compassTo: document.getElementById("compassTo"),
  compassAz: document.getElementById("compassAz"),
  btnCompassApply: document.getElementById("btnCompassApply"),
  btnCompassClear: document.getElementById("btnCompassClear"),
  compassInfo: document.getElementById("compassInfo"),
};

// ---------------------------------------
// ------------- Helpers -----------------
function setEnabled(enabled) {
  document.querySelectorAll(".toolbtn").forEach((b) => (b.disabled = !enabled));
  [
    els.floorSelect,
    els.btnLoadBg,
    els.btnClearBg,
    els.btnLock,
    els.startX,
    els.startY,
    els.btnPickStart,
  ].forEach((e) => {
    if (e) e.disabled = !enabled;
  });
  els.btnSave.disabled = !enabled;
  els.btnExport.disabled = !enabled;

  els.btnOpen?.removeAttribute("disabled");
  els.btnOpen.disabled = false;
}
function openModal() {
  els.modalBack.style.display = "flex";
  // seed selects
  buildStartFloorOptions(parseInt(els.floorCount.value || "1", 10));
  buildFloorFileRows();
}
function closeModal() {
  els.modalBack.style.display = "none";
}
function buildStartFloorOptions(n) {
  els.startFloor.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = i + 1 + "층";
    els.startFloor.appendChild(o);
  }
}
function buildFloorFileRows() {
  const n = parseInt(els.floorCount.value || "1", 10);
  els.floorFiles.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "floor-grid";
    const label = document.createElement("div");
    label.textContent = i + 1 + "층";
    const name = document.createElement("div");
    name.id = "fileName_" + i;
    name.className = "pill";
    name.textContent = "이미지 없음";
    const sel = document.createElement("button");
    sel.className = "btn";
    sel.textContent = "선택";
    const rem = document.createElement("button");
    rem.className = "btn";
    rem.textContent = "제거";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.className = "hidden";
    sel.onclick = () => {
      input.click();
    };
    input.onchange = () => {
      if (input.files[0]) {
        const url = URL.createObjectURL(input.files[0]);
        state.images[i] = url;
        name.textContent = input.files[0].name;
        if (state.loaded && state.currentFloor === i) renderFloor();
      }
    };
    rem.onclick = () => {
      if (state.images[i]) {
        URL.revokeObjectURL(state.images[i]);
        delete state.images[i];
        name.textContent = "이미지 없음";
        if (state.loaded && state.currentFloor === i) renderFloor();
      }
    };
    row.append(label, name, sel, rem, input);
    els.floorFiles.appendChild(row);
  }
}
function renderFloor() {
  const url = state.images[state.currentFloor];
  if (url) {
    els.bgImg.src = url;
    els.bgImg.style.display = "block";
    els.bgName.textContent =
      els.floorFiles.querySelector("#fileName_" + state.currentFloor)
        ?.textContent || "이미지";
  } else {
    els.bgImg.removeAttribute("src");
    els.bgImg.style.display = "none";
    els.bgName.textContent = "이미지 없음";
  }
  els.selLbl.textContent = els.floorLbl.textContent =
    "🏢 층: " + (state.currentFloor + 1);

  // redrawOverlay();
}

// ----------------------------------------------
// -------------- settings ----------------------
function sanitizeName(str) {
  const s = (str || "").trim() || "project";
  // 윈도우/맥에서 폴더명 불가 문자 제거
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function getProjectName() {
  const v =
    (window.els?.projName && els.projName.value) ||
    (window.els?.projectName && els.projectName.value) ||
    window.state?.projectName ||
    document.getElementById("projectName")?.value ||
    "새 프로젝트";
  return sanitizeName(v);
}

els.bgImg.addEventListener("load", () => {
  const natW = els.bgImg.naturalWidth || 1;
  const natH = els.bgImg.naturalHeight || 1;
  // stage/overlay를 자연 해상도 기준으로 맞추기
  els.stage.style.width = `${natW}px`;
  els.stage.style.height = `${natH}px`;
  // 초기도 살짝 가운데 보이게 하려면 tx/ty 조정 가능(옵션)
  applyViewTransform();
  redrawOverlay();
});

function populateFloorSelect() {
  els.floorSelect.innerHTML = "";
  for (let i = 0; i < state.floors; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = i + 1 + "층";
    els.floorSelect.appendChild(o);
  }
  els.floorSelect.value = String(state.currentFloor);
}
function activateProject() {
  state.loaded = true;
  setEnabled(true);
  els.empty.style.display = "none";
  els.status.textContent =
    "프로젝트가 로드되었습니다. 작업을 시작할 수 있습니다.";
  populateFloorSelect();
  renderFloor();
}

function populateCompassNodeSelects() {
  const make = (sel) => {
    sel.innerHTML = "";
    // 전체 노드 중 현재 층 것만 쓰고 싶으면 visibleNodes() 사용
    for (const n of state.graph.nodes) {
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = n.name && n.name.trim() ? `${n.name} (${n.id})` : n.id;
      sel.appendChild(opt);
    }
  };
  make(els.compassFrom);
  make(els.compassTo);

  // 기존 northRef가 있으면 기본 선택
  if (state.northRef.from_node)
    els.compassFrom.value = state.northRef.from_node;
  if (state.northRef.to_node) els.compassTo.value = state.northRef.to_node;
  if (typeof state.northRef.azimuth === "number")
    els.compassAz.value = state.northRef.azimuth;
  els.compassInfo.textContent =
    state.northRef.from_node && state.northRef.to_node
      ? `현재: ${state.northRef.from_node} → ${state.northRef.to_node}, ${state.northRef.azimuth}°`
      : "미설정";
}

// ------------------------------------------------------------
// -------------------- snap ----------------------------------
function collectSnapAnchors() {
  const a = [];
  // 1) 노드
  for (const n of state.graph.nodes) a.push({ x: n.x, y: n.y });

  // 2) (선택) 링크 끝점
  for (const l of state.graph.links || []) {
    const A = state.graph.nodes.find((n) => n.id === l.a);
    const B = state.graph.nodes.find((n) => n.id === l.b);
    if (A) a.push({ x: A.x, y: A.y });
    if (B) a.push({ x: B.x, y: B.y });
  }

  // 3) (있다면) 사각형/폴리곤 꼭짓점
  for (const r of state.graph.rects || []) {
    a.push({ x: r.x, y: r.y });
    a.push({ x: r.x + r.w, y: r.y });
    a.push({ x: r.x, y: r.y + r.h });
    a.push({ x: r.x + r.w, y: r.y + r.h });
  }
  for (const p of state.graph.polys || []) {
    for (const [x, y] of p.points) a.push({ x, y });
  }
  return a;
}

function getAxisSnapCandidates(px, py, tol = state.snap.tol) {
  const anchors = collectSnapAnchors();
  let v = null; // { x, ax, ay, dx }
  let h = null; // { y, ax, ay, dy }
  for (const p of anchors) {
    const dx = Math.abs(px - p.x);
    const dy = Math.abs(py - p.y);
    if (dx <= tol && (!v || dx < v.dx)) v = { x: p.x, ax: p.x, ay: p.y, dx };
    if (dy <= tol && (!h || dy < h.dy)) h = { y: p.y, ax: p.x, ay: p.y, dy };
  }
  return { v, h };
}

function drawSnapGuides(svg) {
  // 기존 가이드 제거
  const old = svg.querySelector("#snap-guides");
  if (old) old.remove();

  const { v, h } = state.snap.cand || {};
  if (!v && !h) return;

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", "snap-guides");
  g.setAttribute("pointer-events", "none");

  const W =
    state.imageSize?.width ?? svg.viewBox.baseVal.width ?? svg.clientWidth;
  const H =
    state.imageSize?.height ?? svg.viewBox.baseVal.height ?? svg.clientHeight;

  // 스타일 공통
  const mkLine = () => {
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("stroke", "#FF3B30"); // 보기 쉬운 빨강
    ln.setAttribute("stroke-width", "1.5");
    ln.setAttribute("stroke-dasharray", "6 6");
    ln.setAttribute("pointer-events", "none");
    return ln;
  };

  if (v) {
    const ln = mkLine();
    ln.setAttribute("x1", v.x);
    ln.setAttribute("y1", 0);
    ln.setAttribute("x2", v.x);
    ln.setAttribute("y2", H);
    g.appendChild(ln);
  }
  if (h) {
    const ln = mkLine();
    ln.setAttribute("x1", 0);
    ln.setAttribute("y1", h.y);
    ln.setAttribute("x2", W);
    ln.setAttribute("y2", h.y);
    g.appendChild(ln);
  }

  const mkDot = (cx, cy) => {
    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", cy);
    dot.setAttribute("r", 3);
    dot.setAttribute("fill", "#FF3B30");
    dot.setAttribute("pointer-events", "none");
    return dot;
  };

  if (v && h) {
    g.appendChild(mkDot(v.x, h.y));
  } else if (v) {
    const cy = v.ay != null ? v.ay : state.mouse?.y ?? 0;
    g.appendChild(mkDot(v.x, cy));
  } else if (h) {
    const cx = h.ax != null ? h.ax : state.mouse?.x ?? 0;
    g.appendChild(mkDot(cx, h.y));
  }

  svg.appendChild(g);
}

window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "_"].includes(e.key)) {
    e.preventDefault();
  }
});
// 휠로 확대/축소 (Ctrl 불필요) – 마우스 기준 줌
els.canvas.addEventListener(
  "wheel",
  (e) => {
    // 스크롤 페이지 이동 방지
    e.preventDefault();
    const { left, top } = els.canvas.getBoundingClientRect();
    const mx = e.clientX - left; // 캔버스 좌표
    const my = e.clientY - top;

    const prev = { ...state.view };
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12; // 줌 스텝
    const minScale = 0.2,
      maxScale = 8;
    const nextScale = Math.min(
      maxScale,
      Math.max(minScale, prev.scale * factor)
    );

    // 화면상 (mx,my)에 있는 이미지 좌표(자연 해상도 기준) 구하기
    const imgX = (mx - prev.tx) / prev.scale;
    const imgY = (my - prev.ty) / prev.scale;

    // 같은 이미지 점이 줌 후에도 같은 화면 위치에 오도록 tx,ty 보정
    state.view.scale = nextScale;
    state.view.tx = mx - imgX * nextScale;
    state.view.ty = my - imgY * nextScale;

    applyViewTransform();
  },
  { passive: false }
);
let isPanning = false;
let panStart = { x: 0, y: 0 };
let viewStart = { tx: 0, ty: 0 };

els.canvas.addEventListener("mousedown", (e) => {
  // 스페이스바를 누르고 드래그하면 화면 이동
  if (
    !e.button &&
    e.shiftKey === false &&
    e.altKey === false &&
    e.ctrlKey === false &&
    e.metaKey === false
  ) {
    // 기본은 툴 클릭 동작이 있으니, '스페이스'로만 팬하고 싶으면 아래 조건을 바꿔:
    // if (!e.button && e.code === 'Space') ...
  }
  if (
    e.button === 1 ||
    e.code === "Space" ||
    e.buttons === 4 ||
    e.which === 2
  ) {
    e.preventDefault();
  }
});

// 권장: 스페이스 누르면 팬모드
let spaceHeld = false;
let draggingNodeId = null;
let dragStart = null;
let nodeStart = null;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceHeld = true;
  if (e.key === "Shift") state.keys.shift = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
  if (e.key === "Shift") {
    state.keys.shift = false;
    state.snapGuide = null;
    redrawOverlay();
  }
});

els.canvas.addEventListener("pointerdown", (e) => {
  if (spaceHeld || e.button === 1) {
    // 스페이스 or 휠버튼
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    viewStart = { tx: state.view.tx, ty: state.view.ty };
    els.canvas.setPointerCapture(e.pointerId);
  }
});
els.canvas.addEventListener("pointermove", (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  state.view.tx = viewStart.tx + dx;
  state.view.ty = viewStart.ty + dy;
  applyViewTransform();
});
els.canvas.addEventListener("pointerup", (e) => {
  if (isPanning) {
    isPanning = false;
    els.canvas.releasePointerCapture(e.pointerId);
  }
});
function imagePointFromClient(ev) {
  const { left, top } = els.canvas.getBoundingClientRect();
  // const { scale, tx, ty } = state.view;
  const view = state.view || { scale: 1, tx: 0, ty: 0 };
  const cx = ev.clientX - left;
  const cy = ev.clientY - top;
  const x = (cx - view.tx) / view.scale;
  const y = (cy - view.ty) / view.scale;
  const natW = els.bgImg.naturalWidth || els.bgImg.width || 0;
  const natH = els.bgImg.naturalHeight || els.bgImg.height || 0;

  return {
    x,
    y,
    rect: { left: 0, top: 0, width: natW, height: natH },
  };
}

function snapToAxisOfExisting(px, py, tol = 8) {
  let outX = px,
    outY = py,
    best = Infinity;
  for (const n of state.graph.nodes) {
    const dx = Math.abs(px - n.x);
    const dy = Math.abs(py - n.y);
    if (dx <= tol && dx < best) {
      outX = n.x;
      best = dx;
    }
    if (dy <= tol && dy < best) {
      outY = n.y;
      best = dy;
    }
  }
  return { x: outX, y: outY };
}

function getNodeLabelById(id) {
  const n = state.graph.nodes.find((nn) => nn.id === id);
  const name = (n?.name || "").trim();
  return name ? name : id;
}

function redrawOverlay() {
  const svg = els.overlay;
  const natW = els.bgImg.naturalWidth || els.bgImg.width || 1;
  const natH = els.bgImg.naturalHeight || els.bgImg.height || 1;

  // ✅ 내부 좌표계를 '자연 해상도'로 고정
  // svg.style.left = `0px`;
  // svg.style.top = `0px`;
  svg.style.width = `${natW}px`;
  svg.style.height = `${natH}px`;
  svg.setAttribute("viewBox", `0 0 ${natW} ${natH}`);
  svg.setAttribute("width", natW);
  svg.setAttribute("height", natH);

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // links
  for (const lk of state.graph.links) {
    const a = state.graph.nodes.find((n) => n.id === lk.a);
    const b = state.graph.nodes.find((n) => n.id === lk.b);
    if (!a || !b) continue;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");

    hit.classList.add("link-hit");
    hit.setAttribute("x1", a.x);
    hit.setAttribute("y1", a.y);
    hit.setAttribute("x2", b.x);
    hit.setAttribute("y2", b.y);
    hit.setAttribute("pointer-events", "stroke");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "14"); // 넉넉한 히트박스
    hit.dataset.id = lk.id;
    hit.addEventListener(
      "pointerdown",
      (e) => {
        if (state.tool !== "select") return;
        e.stopPropagation();
        e.preventDefault();
        selectLink(lk.id);
      },
      { passive: false }
    );

    // ② 실제 보이는 라인
    const vis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    vis.classList.add("link-line");
    vis.setAttribute("x1", a.x);
    vis.setAttribute("y1", a.y);
    vis.setAttribute("x2", b.x);
    vis.setAttribute("y2", b.y);
    vis.dataset.id = lk.id;
    if (state.selection?.type === "link" && state.selection.id === lk.id) {
      vis.classList.add("selected");
    }

    g.appendChild(hit);
    g.appendChild(vis);
    svg.appendChild(g);
  }

  // nodes
  for (const n of state.graph.nodes) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", n.x);
    c.setAttribute("cy", n.y);
    c.setAttribute("r", 5);
    c.classList.add("node-dot");
    if (state.selection.type === "node" && state.selection.id === n.id) {
      c.classList.add("selected");
    }

    if (state.tool === "link" && pendingLinkFrom === n.id) {
      c.classList.add("selected-node");
    }

    c.dataset.id = n.id;
    c.addEventListener("click", (e) => {
      if (state.tool === "select") {
        e.stopPropagation();
        selectNode(n.id);
      } else if (state.tool === "link") {
        e.stopPropagation();
        handleLinkPick(n.id);
      } else if (state.tool === "compass") {
        e.stopPropagation();

        // first selection
        if (!state.compass.tempA) {
          state.compass.tempA = n.id;
          els.status.textContent = `나침반: 첫 노드 선택 → ${n.name || n.id}`;
          redrawOverlay?.();
          return;
        }

        // second selection
        if (!state.compass.tempB && n.id !== state.compass.tempA) {
          state.compass.tempB = n.id;
          const A = state.graph.nodes.find((x) => x.id === state.compass.tempA);
          const B = state.graph.nodes.find((x) => x.id === state.compass.tempB);
          if (A && B) {
            const az = 0;
            state.northRef = { from_node: A.id, to_node: B.id, azimuth: az };
            els.status.textContent = `나침반 저장: ${A.name || A.id} → ${
              B.name || B.id
            } (azimuth ${az}°)`;
            els.projState.textContent = "상태: 수정됨";
            els.projState.style.color = "#e67e22";
          }
          // 한 번 설정 후, 다음 측정 대비 초기화(원하면 유지해도 됨)
          state.compass.tempA = null;
          state.compass.tempB = null;
          redrawOverlay?.();
        }
      }
    });

    c.addEventListener("pointerdown", (e) => {
      if (state.tool !== "select") return;
      e.stopPropagation();
      e.preventDefault();
      selectNode(n.id);
      const { x, y } = imagePointFromClient(e);
      draggingNodeId = n.id;
      dragStart = { x, y };
      nodeStart = { x: n.x, y: n.y };
      els.overlay.setPointerCapture(e.pointerId);
    });

    svg.appendChild(c);
  }

  if (state.tool === "link" && pendingLinkFrom) {
    const startNode = state.graph.nodes.find((n) => n.id === pendingLinkFrom);
    if (startNode) {
      let px = state.mouse.x;
      let py = state.mouse.y;
      let orient = null;

      if (state.keys.shift) {
        const dx = Math.abs(px - startNode.x);
        const dy = Math.abs(py - startNode.y);
        orient = dx >= dy ? "h" : "v";
        if (orient === "h") py = startNode.y;
        else px = startNode.x;
        // 가이드 세팅 (redraw가 여러 번 불려도 문제 없음)
        state.snapGuide = {
          anchor: { x: startNode.x, y: startNode.y },
          orient,
        };
      } else {
        state.snapGuide = null;
      }

      const pl = document.createElementNS("http://www.w3.org/2000/svg", "line");
      pl.setAttribute("x1", startNode.x);
      pl.setAttribute("y1", startNode.y);
      pl.setAttribute("x2", px);
      pl.setAttribute("y2", py);
      pl.classList.add("preview-line");
      svg.appendChild(pl);
    }
  }

  drawSnapGuides(els.overlay);

  // 통계 갱신
  els.layerInfo.innerHTML = `🔵 노드: ${state.graph.nodes.length}<br/>🔗 링크: ${state.graph.links.length}`;
  els.totalInfo.innerHTML = els.layerInfo.innerHTML;

  updateLayersPanel();
}

window.addEventListener("resize", redrawOverlay);

function applyViewTransform() {
  const { scale, tx, ty } = state.view;
  els.stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function updateLayersPanel() {
  const panel = document.getElementById("layersList");
  if (!panel) return;

  panel.innerHTML = "";

  const items = [];

  // 1) Nodes
  for (const n of state.graph.nodes) {
    items.push({
      id: n.id,
      type: "node",
      label: `🔵 ${n.name || n.id}`,
      meta: `(${Math.round(n.x)}, ${Math.round(n.y)})`,
      active: state.selection?.type === "node" && state.selection?.id === n.id,
      onClick: () => selectNode(n.id),
    });
  }

  // 2) Links
  for (const l of state.graph.links) {
    const fromText = getNodeLabelById(l.a);
    const toText = getNodeLabelById(l.b);
    items.push({
      id: l.id,
      type: "link",
      label: `🔗 ${l.id}`,
      meta: `${fromText} → ${toText}`,
      active: state.selection?.type === "link" && state.selection?.id === l.id,
      onClick: () => selectLink(l.id),
    });
  }

  if (items.length === 0) {
    panel.innerHTML = '<div class="muted">아직 생성된 요소가 없습니다.</div>';
    return;
  }

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "layer-item" + (it.active ? " active" : "");
    const left = document.createElement("div");
    left.textContent = it.label;
    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = it.meta;
    div.append(left, right);
    div.addEventListener("click", it.onClick);
    panel.appendChild(div);
  }
}

function hasLinkBetween(a, b) {
  return state.graph.links.some(
    (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
  );
}

let pendingLinkFrom = null;
let lk_n = 0;

function handleLinkPick(nodeId) {
  if (!pendingLinkFrom) {
    pendingLinkFrom = nodeId;
    els.status.textContent = `링크 시작 노드 선택됨. 다음 노드를 선택하세요.`;
    redrawOverlay();
  } else {
    // 1) 자기 자신 클릭 방지
    if (pendingLinkFrom === nodeId) {
      els.status.textContent =
        "같은 노드를 두 번 선택할 수 없습니다. (선택 취소)";
      pendingLinkFrom = null;
      redrawOverlay();
      return;
    }

    // 2) 이미 존재하는 링크 방지(무방향 중복 체크)
    if (hasLinkBetween(pendingLinkFrom, nodeId)) {
      els.status.textContent = "이미 연결된 노드 쌍입니다.";
      // 원하면 기존 링크를 선택 상태로
      const existing = state.graph.links.find(
        (l) =>
          (l.a === pendingLinkFrom && l.b === nodeId) ||
          (l.a === nodeId && l.b === pendingLinkFrom)
      );
      if (existing) selectLink(existing.id);
      pendingLinkFrom = null;
      redrawOverlay();
      return;
    }

    const newLink = {
      id: `lk_${lk_n}`,
      floor: state.currentFloor,
      a: pendingLinkFrom,
      b: nodeId,
    };
    lk_n = lk_n + 1;

    state.graph.links.push(newLink);
    pendingLinkFrom = null;
    selectLink(newLink.id);
    redrawOverlay();
  }
}

function selectNode(id) {
  state.selection = { type: "node", id };
  const n = state.graph.nodes.find((x) => x.id === id);
  els.selLbl.textContent = `👆 선택: 노드 ${n?.name ? n.name : n.id}`;
  els.nodeGroup.style.display = "block";
  els.linkGroup.style.display = "none";
  els.nodeId.value = n.id;
  els.nodeName.value = n.name || "";
  els.nodeX.value = Math.round(n.x);
  els.nodeY.value = Math.round(n.y);
  els.nodeType.value = n.type || "일반";
  redrawOverlay();
}

function selectLink(id) {
  state.selection = { type: "link", id };
  const l = state.graph.links.find((x) => x.id === id);
  els.selLbl.textContent = `👆 선택: 링크 ${l?.id}`;
  els.nodeGroup.style.display = "none";
  els.linkGroup.style.display = "block";
  els.linkId.value = l.id;
  // 노드 목록 드롭다운 채우기
  const opts = state.graph.nodes
    .map(
      (n) =>
        `<option value="${n.id}">${
          n.name ? n.name + " (" + n.id + ")" : n.id
        }</option>`
    )
    .join("");
  els.linkFrom.innerHTML = opts;
  els.linkTo.innerHTML = opts;
  els.linkFrom.value = l.a;
  els.linkTo.value = l.b;
  redrawOverlay();
}
function clearSelection() {
  state.selection = { type: null, id: null };
  els.selLbl.textContent = "👆 선택: 없음";
  els.nodeGroup.style.display = "none";
  els.linkGroup.style.display = "none";
  redrawOverlay();
}

// ------- Events -------
els.btnNew.addEventListener("click", openModal);
els.closeModal.addEventListener("click", closeModal);
els.floorCount.addEventListener("input", () => {
  buildStartFloorOptions(parseInt(els.floorCount.value || "1", 10));
  buildFloorFileRows();
});

els.modalReset.addEventListener("click", () => {
  // els.mode.value = "monte";
  els.floorCount.value = 4;
  els.scale.value = "0.33167";
  buildStartFloorOptions(4);
  els.startFloor.value = "0";
  buildFloorFileRows();
});

// ✅ 모달 확인 → 새 프로젝트 생성 + DB 저장
els.modalOk.addEventListener("click", async () => {
  // 버튼 중복 클릭 방지
  els.modalOk.disabled = true;

  try {
    // 1) 폼 값 읽기 + 정리
    const floors = Math.max(1, Math.min(12, parseInt(els.floorCount.value || "1", 10)));
    const startFloor = parseInt(els.startFloor.value || "1", 10);
    const scale = parseFloat(els.scale.value || "0.33167") || 0.33167;
    const projectName = (els.projectName.value || "새 프로젝트").trim();
    const projectAuthor = (els.projectAuthor?.value || "").trim();

    // 2) Instar 포맷 payload (최소 필드)
    const payload = {
      meta: { projectName, projectAuthor },
      scale,
      nodes: {},                 // 에디터 로직에 맞춰 객체 or 배열 사용
      connections: {},
      special_points: {},
      north_reference: null,     // 북방위 기능 붙이면 {from_node,to_node,azimuth}
      images: Array.from({ length: floors }, () => null),
      startFloor,
    };

    // 3) 서버에 생성(POST /api/projects/)
    const saved = await apiCreateProject(payload); // ← 이미 너가 만든 래퍼
    // saved = { id, ...payload }

    // 4) 전역 상태/UI 반영
    state.projectId = saved.id;         // ✅ DB id 보관 (이후 PUT에 사용)
    state.floors = floors;
    state.startFloor = startFloor;
    state.scale = scale;
    state.currentFloor = startFloor;
    state.graph = { nodes: [], links: [] }; // 네 기존 편집 상태 초기화 유지
    state.modified = false;

    // 헤더/상태표시
    els.projName.textContent = projectName;
    els.projAuthor.textContent = projectAuthor;
    els.projState.textContent = "상태: 저장됨";
    els.projState.style.color = "#27ae60";

    // 5) 에디터 초기화 (네가 쓰는 함수명으로 대체 가능)
    clearSelection();
    activateProject(); // 기존 흐름 유지
    closeModal();

    console.log("프로젝트 생성/저장 완료:", saved);
  } catch (err) {
    console.error("프로젝트 생성 실패:", err);
    alert("프로젝트 생성에 실패했습니다. 콘솔을 확인해 주세요.");
  } finally {
    els.modalOk.disabled = false;
  }
});


els.floorSelect.addEventListener("change", (e) => {
  state.currentFloor = parseInt(e.target.value, 10);
  renderFloor();
});

els.btnLoadBg.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    if (input.files[0]) {
      const url = URL.createObjectURL(input.files[0]);
      state.images[state.currentFloor] = url;
      renderFloor();
    }
  };
  input.click();
});

els.btnClearBg.addEventListener("click", () => {
  if (state.images[state.currentFloor]) {
    URL.revokeObjectURL(state.images[state.currentFloor]);
    delete state.images[state.currentFloor];
    renderFloor();
  }
});

els.btnLock.addEventListener("click", () => {
  state.imageLocked = !state.imageLocked;
  els.btnLock.textContent = state.imageLocked
    ? "🔒 이미지 고정"
    : "🔓 이미지 고정 해제";
});

// 시작점 찍기 (V0: 좌표만 기록)
if (els.btnPickStart) {
  els.btnPickStart.addEventListener("click", () => {
    if (!state.loaded) return;
    els.status.textContent = "시작점 찍기 모드: 이미지 위를 클릭하세요.";
    const once = (ev) => {
      if (ev.target.id !== "bgImg") {
        els.canvas.removeEventListener("click", once);
        els.status.textContent = "시작점 선택이 취소되었습니다.";
        return;
      }
      const rect = els.bgImg.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      els.startX.value = x.toFixed(1);
      els.startY.value = y.toFixed(1);
      els.status.textContent = `시작점이 설정되었습니다: (${x.toFixed(
        1
      )}, ${y.toFixed(1)})`;
      els.canvas.removeEventListener("click", once);
    };
    els.canvas.addEventListener("click", once);
  });
}

// 초기 상태: 편집 비활성
setEnabled(false);
// 모달 초기 옵션
buildStartFloorOptions(4);
buildFloorFileRows();

// 마우스 이동 시 현재 좌표 갱신 (링크 미리보기/드래그에서 사용)
els.overlay.addEventListener("pointermove", (ev) => {
  const pt = imagePointFromClient(ev);
  state.mouse = { x: pt.x, y: pt.y };

  // 노드 도구일 때 스냅 후보 업데이트
  if (state.tool === "node" && state.snap.active) {
    state.snap.cand = getAxisSnapCandidates(pt.x, pt.y, state.snap.tol);
  } else {
    state.snap.cand = { v: null, h: null };
  }
  redrawOverlay();

  // 노드 드래그 중이면 좌표 업데이트
  if (draggingNodeId) {
    const n = state.graph.nodes.find((nd) => nd.id === draggingNodeId);
    if (!n) return;

    // 이동량
    let dx = pt.x - dragStart.x;
    let dy = pt.y - dragStart.y;

    // Shift 스냅: 수평/수직으로만
    if (state.keys.shift) {
      // 어떤 축으로 고정되는지 결정
      const orient = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      if (orient === "h") dy = 0;
      else dx = 0;

      // 가이드: 기준은 드래그 시작 당시 노드 좌표(nodeStart)
      state.snapGuide = { anchor: { x: nodeStart.x, y: nodeStart.y }, orient };
    } else {
      state.snapGuide = null;
    }

    n.x = nodeStart.x + dx;
    n.y = nodeStart.y + dy;
    redrawOverlay();
  } else {
    // 드래그 중 아니더라도 링크 미리보기 위해 리프레시
    if (state.tool === "link") redrawOverlay();
  }

  // 롱프레스 중이면 안내선만 보여준다 (스냅은 하지 않음)
  if (state.longPress.active && state.longPress.anchor) {
    const dx = Math.abs(state.mouse.x - state.longPress.anchor.x);
    const dy = Math.abs(state.mouse.y - state.longPress.anchor.y);
    const orient = dx >= dy ? "h" : "v";
    state.snapGuide = { anchor: state.longPress.anchor, orient };
  }
});

let lpStartClient = null;
let nd_n = 0;

els.overlay.addEventListener(
  "pointerdown",
  (ev) => {
    if (state.tool !== "node") return;
    if (ev.button !== 0) return;
    if (ev.target !== els.overlay) return;

    const now = performance.now();
    if (now - lastNodeDownTs < 200) return; // 디바운스
    lastNodeDownTs = now;

    const { x: px, y: py, rect } = imagePointFromClient(ev);
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

    let x = px,
      y = py;
    const { v, h } = state.snap?.cand || {};

    // v/h 둘 다 → 교차점, 하나만 → 그 축으로 스냅
    if (v && h) {
      x = v.x;
      y = h.y;
    } else if (v) {
      x = v.x;
    } else if (h) {
      y = h.y;
    }

    // (옵션) Shift 직교 스냅 우선하려면 이 블록을 위로 올려
    if (state.keys.shift && state.graph.nodes.length) {
      const last = state.graph.nodes[state.graph.nodes.length - 1];
      const dx = Math.abs(x - last.x),
        dy = Math.abs(y - last.y);
      if (dx >= dy) y = last.y;
      else x = last.x;
    }

    const newNode = {
      id: `N_${nd_n}`,
      name: "",
      floor: state.currentFloor + 1,
      x,
      y,
    };
    nd_n = nd_n + 1;
    state.graph.nodes.push(newNode);
    selectNode(newNode.id);
    redrawOverlay();

    // 👉 뒤따르는 click을 한 번 무시
    suppressNextClick = true;
    ev.preventDefault();
    ev.stopPropagation();
  },
  { passive: false }
);

els.overlay.addEventListener("pointerup", (ev) => {
  if (draggingNodeId) {
    draggingNodeId = null;
    dragStart = null;
    nodeStart = null;
    state.snapGuide = null;
    try {
      els.overlay.releasePointerCapture(ev.pointerId);
    } catch {}
  }
});

let lastNodeDownTs = 0;
let suppressNextClick = false;

els.overlay.addEventListener(
  "pointerdown",
  (ev) => {
    if (state.tool !== "node") return;
    if (ev.button !== 0) return;
    if (ev.target !== els.overlay) return;

    const now = performance.now();
    if (now - lastNodeDownTs < 200) return; // 디바운스
    lastNodeDownTs = now;

    const { x: px, y: py, rect } = imagePointFromClient(ev);
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

    let x = px,
      y = py;
    const { v, h } = state.snap?.cand || {};

    // v/h 둘 다 → 교차점, 하나만 → 그 축으로 스냅
    if (v && h) {
      x = v.x;
      y = h.y;
    } else if (v) {
      x = v.x;
    } else if (h) {
      y = h.y;
    }

    // (옵션) Shift 직교 스냅 우선하려면 이 블록을 위로 올려
    if (state.keys.shift && state.graph.nodes.length) {
      const last = state.graph.nodes[state.graph.nodes.length - 1];
      const dx = Math.abs(x - last.x),
        dy = Math.abs(y - last.y);
      if (dx >= dy) y = last.y;
      else x = last.x;
    }

    const newNode = {
      id: `n_${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      x,
      y,
    };
    state.graph.nodes.push(newNode);
    selectNode(newNode.id);
    redrawOverlay();

    // 👉 뒤따르는 click을 한 번 무시
    suppressNextClick = true;
    ev.preventDefault();
    ev.stopPropagation();
  },
  { passive: false }
);

function cancelLongPress() {
  clearTimeout(state.longPress.timer);
  state.longPress.timer = null;
  state.longPress.active = false;
}

function endLongPress() {
  cancelLongPress();
  state.snapGuide = null;
  redrawOverlay();
}

function endLongPressDeferred(e) {
  // 롱프레스 상태가 아니면 무시
  if (!state.longPress?.timer && !state.longPress?.active) return;

  // 링크 도구일 때는 클릭 처리(노드 선택/연결)가 먼저 끝난 뒤에 종료
  if (state.tool === "link") {
    setTimeout(() => {
      cancelLongPress(); // 타이머 클리어 + active=false
      state.snapGuide = null; // 가이드 제거
      redrawOverlay(); // 화면 갱신 (클릭 후에)
    }, 0); // ← 클릭 이벤트보다 나중에 실행
    return;
  }

  // 나머지 도구는 즉시 종료해도 OK
  cancelLongPress();
  state.snapGuide = null;
  redrawOverlay();
}
els.overlay.addEventListener("pointerup", endLongPressDeferred, {
  passive: true,
});
els.overlay.addEventListener("pointercancel", endLongPressDeferred, {
  passive: true,
});
els.overlay.addEventListener("pointerleave", endLongPressDeferred, {
  passive: true,
});

els.overlay.addEventListener("pointermove", (e) => {
  // 이동이 임계값을 넘으면 롱프레스 취소(실수 방지)
  if (state.longPress.timer && lpStartClient) {
    const dx = Math.abs(e.clientX - lpStartClient.x);
    const dy = Math.abs(e.clientY - lpStartClient.y);
    if (dx > state.longPressMoveCancel || dy > state.longPressMoveCancel) {
      cancelLongPress();
    }
  }

  // 롱프레스 상태면 가이드만 갱신(스냅은 X)
  if (state.longPress.active && state.longPress.anchor) {
    const pt = imagePointFromClient(e);
    const dx = Math.abs(pt.x - state.longPress.anchor.x);
    const dy = Math.abs(pt.y - state.longPress.anchor.y);
    const orient = dx >= dy ? "h" : "v";
    state.snapGuide = { anchor: state.longPress.anchor, orient };
    redrawOverlay();
  }
});

// 배경 이미지 위 클릭으로만 편집 (이미지 없으면 무시)
els.overlay.addEventListener("click", (ev) => {
  const { x, y, rect } = imagePointFromClient(ev);
  // 이미지 영역 밖 클릭 무시
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  if (suppressNextClick) {
    suppressNextClick = false;
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  if (state.tool === "select" && ev.target === els.overlay) {
    clearSelection();
  }
});

// Node edits
els.nodeName.addEventListener("input", () => {
  if (state.selection.type !== "node") return;
  const n = state.graph.nodes.find((x) => x.id === state.selection.id);
  if (!n) return;
  n.name = els.nodeName.value;
  redrawOverlay();
});
els.nodeX.addEventListener("input", () => {
  if (state.selection.type !== "node") return;
  const n = state.graph.nodes.find((x) => x.id === state.selection.id);
  const v = Number(els.nodeX.value);
  if (!Number.isFinite(v)) return;
  n.x = v;
  redrawOverlay();
});
els.nodeY.addEventListener("input", () => {
  if (state.selection.type !== "node") return;
  const n = state.graph.nodes.find((x) => x.id === state.selection.id);
  const v = Number(els.nodeY.value);
  if (!Number.isFinite(v)) return;
  n.y = v;
  redrawOverlay();
});
els.nodeType.addEventListener("input", () => {
  if (state.selection.type !== "node") return;
  const n = state.graph.nodes.find((x) => x.id === state.selection.id);
  n.type = els.nodeType.value;
});

// Link edits
els.linkFrom.addEventListener("change", () => {
  if (state.selection.type !== "link") return;
  const l = state.graph.links.find((x) => x.id === state.selection.id);
  l.a = els.linkFrom.value;
  redrawOverlay();
});
els.linkTo.addEventListener("change", () => {
  if (state.selection.type !== "link") return;
  const l = state.graph.links.find((x) => x.id === state.selection.id);
  l.b = els.linkTo.value;
  redrawOverlay();
});

function applyToolCursor() {
  const cur =
    state.tool === "node" || state.tool === "link" ? "crosshair" : "default";
  if (els && els.overlay) els.overlay.style.cursor = cur;
}

function setTool(next) {
  state.tool = next;
  if (els && els.status) els.status.textContent = `현재 도구: ${state.tool}`;

  // 버튼 활성화 토글
  document.querySelectorAll(".toolbtn[data-tool]").forEach((btn) => {
    const isActive = btn.getAttribute("data-tool") === next;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (state.tool !== "link") {
    pendingLinkFrom = null;
  }
  
  if (next === "compass") {
    els.compassPanel.style.display = "";
    populateCompassNodeSelects();
  } else {
    els.compassPanel.style.display = "none";
  }

  // 여기 두 줄이 맨 끝에 오도록
  applyToolCursor();
  redrawOverlay();
}

// 버튼 바인딩은 DOM이 준비된 후에
document.querySelectorAll(".toolbtn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setTool(btn.getAttribute("data-tool"));
  });
});

// --------------------------------------------------------
// ------------------ azimuth calculate -------------------

// function computeAzimuthDeg(A, B) {
//   // 북(위)=0°, 시계방향 + (브라우저 y축이 아래로 증가하므로 -dy 사용)
//   const dx = B.x - A.x;
//   const dy = B.y - A.y;
//   let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
//   if (deg < 0) deg += 360;
//   return +deg.toFixed(1);
// }

els.btnCompassApply.addEventListener("click", () => {
  const a = els.compassFrom.value;
  const b = els.compassTo.value;
  const az = parseFloat(els.compassAz.value);
  if (!a || !b || a === b) {
    els.compassInfo.textContent = "서로 다른 두 노드를 선택하세요.";
    return;
  }
  if (Number.isNaN(az) || az < 0 || az >= 360) {
    els.compassInfo.textContent = "Azimuth는 0 이상 360 미만으로 입력하세요.";
    return;
  }
  state.northRef = { from_node: a, to_node: b, azimuth: +az.toFixed(1) };
  els.compassInfo.textContent = `설정됨: ${a} → ${b}, ${state.northRef.azimuth}°`;
  els.projState.textContent = "상태: 수정됨";
  els.projState.style.color = "#e67e22";
});

els.btnCompassClear.addEventListener("click", () => {
  state.northRef = { from_node: null, to_node: null, azimuth: 0 };
  els.compassAz.value = "";
  populateCompassNodeSelects();
  els.projState.textContent = "상태: 수정됨";
  els.projState.style.color = "#e67e22";
});


// ----------------------------------------------------
// ------------------ save function -------------------

// --- Directory FS helpers ---
async function pickProjectDirForSave() {
  if (!window.showDirectoryPicker) return null;
  return await window.showDirectoryPicker({ mode: "readwrite" });
}
async function pickProjectDirForOpen() {
  if (!window.showDirectoryPicker) return null;
  return await window.showDirectoryPicker({ mode: "read" });
}
async function ensureSubDir(dirHandle, name) {
  return await dirHandle.getDirectoryHandle(name, { create: true });
}
async function writeFile(dirHandle, filename, blob) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}
async function readTextFile(dirHandle, filename) {
  const fh = await dirHandle.getFileHandle(filename);
  const f = await fh.getFile();
  return await f.text();
}
async function readBlobFile(dirHandle, filename) {
  const fh = await dirHandle.getFileHandle(filename);
  const f = await fh.getFile();
  return f;
}
async function saveProjectToDirectory() {
  if (!window.showDirectoryPicker)
    throw new Error("Directory picker not available");

  // 1) 사용자에게 '기본 경로'만 고르게 함 (여기에 프로젝트 폴더를 만들 것)
  const baseDir = await window.showDirectoryPicker({ mode: "readwrite" });

  // 2) 프로젝트 이름 폴더 만들기 (이미 있으면 그대로 사용: 덮어쓰기 동작)
  const projName = getProjectName();
  const projDir = await baseDir.getDirectoryHandle(projName, { create: true });

  const projAuthor = document.getElementById("projectAuthor")?.value;

  // 3) images/ 하위 폴더 확보
  const imgDir = await projDir.getDirectoryHandle("images", { create: true });

  // 4) 이미지 파일 저장 + JSON에 파일명 기록
  const imagesField = {}; // { "0": "images/xxx.png", ... }
  for (let i = 0; i < state.floors; i++) {
    const url = state.images[i];
    const pill = document.getElementById("fileName_" + i);
    const label = (pill?.textContent || "").trim();

    if (!url || !label || label === "이미지 없음") {
      imagesField[i] = null;
      continue;
    }

    // 확장자 추론 (기본 png)
    const ext = label.includes(".") ? label.split(".").pop() : "png";
    const safeName = sanitizeName(label) || `floor_${i + 1}.${ext}`;
    const filename = safeName.endsWith("." + ext)
      ? safeName
      : `${safeName}.${ext}`;

    // ObjectURL → Blob 변환 후 저장 (동일 파일명은 덮어씀)
    const blob = await fetch(url).then((r) => r.blob());
    const fh = await imgDir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();

    imagesField[i] = `images/${filename}`;
  }

  // 5) 그래프 JSON 생성 + images/meta/north_reference 포함
  const json = serializeToInstarFormat();
  json.images = imagesField;
  json.meta = {
    floors: state.floors,
    startFloor: state.startFloor,
    currentFloor: state.currentFloor,
    scale: state.scale,
    projectName: projName,
    projectAuthor: projAuthor,
  };

  // 6) graph.json 저장 (프로젝트 폴더 직하)
  const graphFh = await projDir.getFileHandle("graph.json", { create: true });
  const gw = await graphFh.createWritable();
  await gw.write(
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
  );
  await gw.close();

  const saved = await apiUpdateProject(state.projectId, json);
  state.modified = false;

  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
  els.status.textContent = `저장 완료: ${projName}/ (images + graph.json)`;
}

// reformat the data
function serializeToInstarFormat() {
  // 0) north_reference
  const fromNode = state.northRef.from_node;
  const toNode = state.northRef.to_node;
  const azimuth = state.northRef.azimuth;
  const northObj = {
    fromNode,
    toNode,
    azimuth,
  };

  // 1) nodes: 배열 → 객체
  const nodesObj = {};
  for (const n of state.graph.nodes) {
    const item = { x: +n.x, y: +n.y };
    if (n.name) item.name = n.name;
    if (n.type && n.type !== "일반") item.special_id = n.type; // 맵핑 포인트
    nodesObj[n.id] = item;
  }

  // 2) connections: 링크 → 양방향 adjacency + 거리(픽셀 단위)
  const conn = {};
  const ensure = (a) => (conn[a] ||= {});
  for (const l of state.graph.links) {
    const A = state.graph.nodes.find((x) => x.id === l.a);
    const B = state.graph.nodes.find((x) => x.id === l.b);
    if (!A || !B) continue;
    const d = Math.hypot(A.x - B.x, A.y - B.y); // 픽셀 거리
    ensure(A.id)[B.id] = +d.toFixed(2);
    ensure(B.id)[A.id] = +d.toFixed(2);
  }

  // special_points: 노드 type 있는 것만
  const sp = {};
  for (const n of state.graph.nodes) {
    if (n.type && n.type !== "일반") sp[n.id] = n.type;
  }

  const out = {
    scale: Number(state.scale) || 0,
    north_reference: northObj,
    nodes: nodesObj,
    connections: conn,
  };
  if (Object.keys(sp).length) out.special_points = sp;
  if (state.northRef?.from_node && state.northRef?.to_node) {
    out.north_reference = {
      ...state.northRef,
      azimuth: Number(state.northRef.azimuth) || 0,
    };
  }
  return out;
}

// loading the saved files
async function openProjectFromDirectory() {
  if (!window.showDirectoryPicker)
    throw new Error("Directory picker not available");
  const dir = await window.showDirectoryPicker({ mode: "read" });

  // graph.json 읽기
  const graphHandle = await dir.getFileHandle("graph.json");
  const file = await graphHandle.getFile();
  const json = JSON.parse(await file.text());

  // 그래프/노드/azimuth 등 적용
  applyFromInstarFormat(json);

  // 이미지 복원
  const imgMap = json.images || {};
  let imgDir = null;
  try {
    imgDir = await dir.getDirectoryHandle("images");
  } catch (e) {
    imgDir = null;
  }

  for (const k of Object.keys(imgMap)) {
    const rel = imgMap[k];
    const idx = Number(k);
    if (!rel || !imgDir) {
      if (state.images[idx]) {
        try {
          URL.revokeObjectURL(state.images[idx]);
        } catch (_) {}
        delete state.images[idx];
      }
      const pill = document.getElementById("fileName_" + idx);
      if (pill) pill.textContent = "이미지 없음";
      continue;
    }
    const filename = rel.split("/").pop();
    const fh = await imgDir.getFileHandle(filename);
    const f = await fh.getFile();
    const url = URL.createObjectURL(f);
    state.images[idx] = url;

    const pill = document.getElementById("fileName_" + idx);
    if (pill) pill.textContent = filename;
  }

  // 화면 갱신
  buildStartFloorOptions?.(state.floors);
  renderFloor?.();
  redrawOverlay?.();

  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
  els.status.textContent = `열기 완료: ${
    json.meta?.projectName || "프로젝트"
  }/`;
}


function applyFromInstarFormat(json) {
  // scale
  if (typeof json.scale === "number") {
    state.scale = json.scale;
    const scaleInput = document.getElementById("scale");
    if (scaleInput) scaleInput.value = String(json.scale);
  }

  // nodes: 객체 → 배열
  const nodes = [];
  for (const [id, v] of Object.entries(json.nodes || {})) {
    nodes.push({
      id,
      name: v.name || "",
      x: Number(v.x) || 0,
      y: Number(v.y) || 0,
      ...(v.special_id ? { type: v.special_id } : {}),
    });
  }

  // links: connections → 무방향 중복 제거해 배열 생성
  const links = [];
  const seen = new Set();
  const conn = json.connections || {};
  for (const a of Object.keys(conn)) {
    for (const b of Object.keys(conn[a] || {})) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      if (!nodes.find((n) => n.id === a) || !nodes.find((n) => n.id === b))
        continue;
      links.push({ id: `lk_${lk_n}`, a, b });
      seen.add(key);
    }
  }
  lk_n = lk_n + 1;

  // special_points → 노드에 special_id 주입(노드에도 이미 있을 수 있음)
  if (json.special_points) {
    for (const [nid, label] of Object.entries(json.special_points)) {
      const n = nodes.find((x) => x.id === nid);
      if (!n) continue;
      if (!n.type || n.type === "일반") n.type = label;
    }
  }

  // north_reference
  state.northRef = json.north_reference
    ? {
        from_node: json.north_reference.from_node || null,
        to_node: json.north_reference.to_node || null,
        azimuth: Number(json.north_reference.azimuth) || 0,
      }
    : { from_node: null, to_node: null, azimuth: 0 };

  // 적용
  state.graph = { nodes, links };

  if (json.meta) {
    if (json.meta?.projectName != null)
      state.projectName = json.meta.projectName || "새 프로젝트";
    if (json.meta?.projectAuthor != null)
      state.projectAuthor = json.meta.projectAuthor || "";
  }
  if (els.projName)
    els.projName.textContent = "이름: " + (state.projectName || "새 프로젝트");
  if (els.projAuthor)
    els.projAuthor.textContent = "작성자: " + (state.projectAuthor || "-");

  clearSelection?.();
  updateLayersPanel?.();
  redrawOverlay?.();
  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
}

// connect function and save button
// 저장(DB)
function buildImagesFieldForDB() {
  // 파일 자체는 아직 서버에 업로드하지 않으므로,
  // 사용자가 고른 파일 "이름"만 임시로 저장 (없으면 null)
  const out = {};
  for (let i = 0; i < (state.floors || 0); i++) {
    const pill = document.getElementById("fileName_" + i);
    const label = (pill?.textContent || "").trim();
    out[i] = label && label !== "이미지 없음" ? label : null;
  }
  return out;
}

els.btnSave.addEventListener("click", async () => {
  try {
    if (!state.projectId) {
      alert("저장할 프로젝트가 없습니다. 먼저 새 프로젝트를 생성하세요.");
      return;
    }

    // 에디터 상태 → Instar 포맷
    const data = serializeToInstarFormat();

    // DB에 메타/스케일/시작층도 함께 보관
    data.meta = {
      projectName: getProjectName(),
      projectAuthor:
        (els.projAuthor?.textContent || "").replace(/^작성자:\s*/, "") ||
        (els.projectAuthor?.value || "") ||
        "",
    };
    data.scale = Number(state.scale) || Number(els.scale?.value) || 0;
    data.startFloor = state.startFloor ?? 1;

    // ⚠️ 이미지: 아직 서버 업로드 API가 없으니, DB에는 파일명(라벨)만 임시 저장
    // (ObjectURL은 재실행 시 무효이므로 저장 X)
    data.images = buildImagesFieldForDB();

    const saved = await apiUpdateProject(state.projectId, data);

    state.modified = false;
    els.projState.textContent = "상태: 저장됨";
    els.projState.style.color = "#27ae60";
    els.status.textContent = `DB 저장 완료 (id: ${saved.id})`;
    console.log("DB 저장 완료:", saved);
  } catch (e) {
    console.error(e);
    els.status.textContent = "DB 저장 실패";
    alert("DB 저장에 실패했습니다. 콘솔을 확인해 주세요.");
  }
});


// 내보내기
els.btnExport.addEventListener("click", async () => {
  try {
    if (window.showDirectoryPicker) {
      await saveProjectToDirectory();
    } else {
      // 폴백: 기존 JSON만 저장 (폴더 미지원 브라우저)
      const data = serializeToInstarFormat();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      );
      a.download = "graph.json";
      a.click();
      URL.revokeObjectURL(a.href);
      els.status.textContent = "폴더 저장 미지원 → JSON만 저장했습니다.";
    }
  } catch (e) {
    console.error(e);
    els.status.textContent = "저장 실패";
  }
});

// connect function and open button
els.btnOpen.addEventListener("click", async () => {
  try {
    if (window.showDirectoryPicker) {
      await openProjectFromDirectory();
    } else {
      // 폴백: 기존 JSON만 열기
      const [handle] = await showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Graph JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const f = await handle.getFile();
      const json = JSON.parse(await f.text());
      applyFromInstarFormat(json);
      els.status.textContent = "폴더 열기 미지원 → JSON만 열었습니다.";
    }
    activateProject();
  } catch (e) {
    console.error(e);
    els.status.textContent = "열기 실패";
  }
});

setTool("select");
