// ------- App State -------
const state = {
  loaded: false,
  // mode: "monte",
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
};
state.keys = { shift: false };
state.mouse = { x: 0, y: 0 };
state.snapGuide = null;
state.longPress = { active: false, timer: null, threshold: 220, anchor: null };
state.longPressMoveCancel = 6;

// ------- Elements -------
const els = {
  btnNew: document.getElementById("btnNew"),
  btnOpen: document.getElementById("btnOpen"),
  btnSave: document.getElementById("btnSave"),
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
  projState: document.getElementById("projState"),
  floorLbl: document.getElementById("floorLbl"),
  selLbl: document.getElementById("selLbl"),
  layerInfo: document.getElementById("layerInfo"),
  totalInfo: document.getElementById("totalInfo"),

  // modal
  modalBack: document.getElementById("newModalBack"),
  closeModal: document.getElementById("closeModal"),

  // mode: document.getElementById("mode"),
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

  // link props
  linkGroup: document.getElementById("linkGroup"),
  linkId: document.getElementById("linkId"),
  linkFrom: document.getElementById("linkFrom"),
  linkTo: document.getElementById("linkTo"),
  linkType: document.getElementById("linkType"),
};

// ------- Helpers -------
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
  ].forEach((e) => (e.disabled = !enabled));
  els.btnSave.disabled = !enabled;
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
  els.floorLbl.textContent = "🏢 층: " + (state.currentFloor + 1);

  // redrawOverlay();
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

function drawSnapGuide(svg, guide) {
  if (!guide) return;
  const { anchor, orient } = guide;
  // 이미지(=SVG) 크기: 프로젝트에서 쓰는 값으로 교체
  const W = state.imageSize?.w || svg.viewBox.baseVal.width || svg.clientWidth;
  const H =
    state.imageSize?.h || svg.viewBox.baseVal.height || svg.clientHeight;

  // 1) 기준 노드 링
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ring.setAttribute("cx", anchor.x);
  ring.setAttribute("cy", anchor.y);
  ring.setAttribute("r", 8); // 필요 시 줌 비율로 조정
  ring.classList.add("anchor-ring");
  svg.appendChild(ring);

  // 2) 안내선 (가로 또는 세로)
  const gl = document.createElementNS("http://www.w3.org/2000/svg", "line");
  if (orient === "h") {
    // 수평 가이드
    gl.setAttribute("x1", 0);
    gl.setAttribute("y1", anchor.y);
    gl.setAttribute("x2", W);
    gl.setAttribute("y2", anchor.y);
  } else {
    // 수직 가이드
    gl.setAttribute("x1", anchor.x);
    gl.setAttribute("y1", 0);
    gl.setAttribute("x2", anchor.x);
    gl.setAttribute("y2", H);
  }
  gl.classList.add("guide-line");
  svg.appendChild(gl);
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

function drawSnapGuide(svg, guide) {
  if (!guide) return;
  const { anchor, orient } = guide;
  const W = svg.viewBox?.baseVal?.width || svg.clientWidth;
  const H = svg.viewBox?.baseVal?.height || svg.clientHeight;

  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ring.setAttribute("cx", anchor.x);
  ring.setAttribute("cy", anchor.y);
  ring.setAttribute("r", 8);
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "var(--accent)");
  ring.setAttribute("stroke-width", "2");
  ring.setAttribute("stroke-dasharray", "2 2");
  ring.style.pointerEvents = "none";
  svg.appendChild(ring);

  const gl = document.createElementNS("http://www.w3.org/2000/svg", "line");
  if (orient === "h") {
    gl.setAttribute("x1", 0);
    gl.setAttribute("y1", anchor.y);
    gl.setAttribute("x2", W);
    gl.setAttribute("y2", anchor.y);
  } else {
    gl.setAttribute("x1", anchor.x);
    gl.setAttribute("y1", 0);
    gl.setAttribute("x2", anchor.x);
    gl.setAttribute("y2", H);
  }
  gl.setAttribute("stroke", "var(--accent)");
  gl.setAttribute("stroke-width", "1");
  gl.setAttribute("stroke-opacity", ".55");
  gl.setAttribute("stroke-dasharray", "4 4");
  gl.style.pointerEvents = "none";
  svg.appendChild(gl);
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
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.classList.add("link-line");
    if (state.selection.type === "link" && state.selection.id === lk.id) {
      line.classList.add("selected");
    }
    line.dataset.id = lk.id;
    line.addEventListener("click", (e) => {
      if (state.tool === "select") {
        e.stopPropagation();
        selectLink(lk.id);
      }
    });
    svg.appendChild(line);
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
      }
    });
    c.addEventListener("pointerdown", (e) => {
      if (state.tool !== "select") return;
      e.preventDefault();
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

  drawSnapGuide(svg, state.snapGuide);

  // 통계 갱신
  els.layerInfo.innerHTML = `🔵 노드: ${state.graph.nodes.length}<br/>🔗 링크: ${state.graph.links.length}`;
  els.totalInfo.innerHTML = els.layerInfo.innerHTML;
}

window.addEventListener("resize", redrawOverlay);

function applyViewTransform() {
  const { scale, tx, ty } = state.view;
  els.stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function hasLinkBetween(a, b) {
  return state.graph.links.some(
    (l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)
  );
}

let pendingLinkFrom = null;
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
      id: `lk_${Math.random().toString(36).slice(2, 8)}`,
      a: pendingLinkFrom,
      b: nodeId,
      type: "일반",
    };
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
  els.linkType.value = l.type || "일반";
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

els.modalOk.addEventListener("click", () => {
  // read settings
  // state.mode = els.mode.value;
  state.floors = Math.max(
    1,
    Math.min(12, parseInt(els.floorCount.value || "1", 10))
  );
  state.startFloor = parseInt(els.startFloor.value || "0", 10);
  state.scale = parseFloat(els.scale.value || "0.33167");
  state.currentFloor = state.startFloor;
  els.projName.textContent = "이름: 새 프로젝트";
  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
  closeModal();
  activateProject();
  state.graph = { nodes: [], links: [] };
  clearSelection();
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

// 초기 상태: 편집 비활성
setEnabled(false);
// 모달 초기 옵션
buildStartFloorOptions(4);
buildFloorFileRows();

// 마우스 이동 시 현재 좌표 갱신 (링크 미리보기/드래그에서 사용)
els.overlay.addEventListener("pointermove", (ev) => {
  const pt = imagePointFromClient(ev);
  state.mouse = { x: pt.x, y: pt.y };

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
    // redrawOverlay()는 너가 이미 각 분기에서 호출 중이면 생략 가능
  }
});

let lpStartClient = null;

els.overlay.addEventListener("pointerdown", (e) => {
  const pt = imagePointFromClient(e); // 이미지 좌표로 변환하는 기존 함수
  // 기준 앵커: 드래그 중이면 그 노드 시작점, 링크 도구면 첫 노드, 아니면 현재 포인트
  let anchor = pt;
  if (
    typeof draggingNodeId === "string" ||
    typeof draggingNodeId === "number"
  ) {
    anchor = { x: nodeStart?.x ?? pt.x, y: nodeStart?.y ?? pt.y };
  } else if (state.tool === "link" && pendingLinkFrom != null) {
    const n0 = state.graph.nodes.find((n) => n.id === pendingLinkFrom);
    if (n0) anchor = { x: n0.x, y: n0.y };
  }

  clearTimeout(state.longPress.timer);
  state.longPress.active = false;
  state.longPress.anchor = anchor;
  lpStartClient = { x: e.clientX, y: e.clientY };

  state.longPress.timer = setTimeout(() => {
    state.longPress.active = true; // 롱프레스 진입
    state.snapGuide = { anchor, orient: "h" }; // 초기값
    redrawOverlay();
  }, state.longPress.threshold);
});

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

  if (state.tool === "node") {
    let { x, y } = imagePointFromClient(ev);
    if (state.keys.shift && state.graph.nodes.length) {
      const last = state.graph.nodes[state.graph.nodes.length - 1];
      const dx = Math.abs(x - last.x);
      const dy = Math.abs(y - last.y);
      if (dx >= dy) y = last.y;
      else x = last.x; // 수평/수직 스냅
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
  } else if (state.tool === "select") {
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
els.linkType.addEventListener("change", () => {
  if (state.selection.type !== "link") return;
  const l = state.graph.links.find((x) => x.id === state.selection.id);
  l.type = els.linkType.value;
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

setTool("select");
