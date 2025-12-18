/**
 * editor.js
 * ---------------------------------------------------------------------------
 * 실내 지도 에디터 메인 스크립트.
 *
 * 담당하는 역할:
 * 1) 상태(state) 관리
 *    - graph: nodes / links / polygons / north_reference
 *    - view : 캔버스 줌/팬 (scale, tx, ty)
 *    - tool : 현재 활성 도구 (select / node / link / polygon / compass 등)
 *    - selection: 선택된 노드/링크/폴리곤
 *    - history : Undo/Redo 스택
 *
 * 2) 그래프 조작 함수
 *    - 노드/링크/폴리곤 생성, 수정, 삭제
 *    - 층(floor)별 필터링, 시퀀스 번호 관리
 *
 * 3) 렌더링
 *    - SVG overlay에 노드/링크/폴리곤 그리기
 *    - 선택 상태 강조, 스냅 가이드 라인, 폴리곤 프리뷰 등
 *
 * 4) 도구별 로직
 *    - select 도구: 클릭/드래그로 선택/이동
 *    - node 도구  : 클릭 위치에 노드 생성
 *    - link 도구  : 노드 둘을 연결하는 링크 생성
 *    - polygon    : 네 개의 점을 찍어서 폴리곤 생성/편집
 *    - compass    : 두 노드 + 방위각(azimuth)을 입력/저장
 *
 * 5) 이벤트 핸들러
 *    - pointerdown / pointermove / pointerup
 *    - wheel 줌, 키보드 단축키(Ctrl+Z/Y, Delete 등)
 *
 * 6) 초기화
 *    - DOM 요소 캐시
 *    - URL 쿼리(?project=) 파싱 후 /api 에서 프로젝트 로드
 *    - 층 셀렉트, 속성 패널 초기화
 * ---------------------------------------------------------------------------
 */

import {
  apiGetProject,
  apiUpdateProject,
  apiCreateProject,
  apiUploadFloorImage,
  API_ORIGIN,
} from "./api.js";

/**
 * ID counters
 * ---------------------------------------------------------------------------
 * 노드/링크/폴리곤 등을 생성할 때
 * - "N_1", "N_2" ...
 * - "lk_1", "lk_2" ...
 * - "pg_1", "pg_2" ...
 * 같은 패턴으로 고유 ID를 만들어 주기 위한 카운터.
 */
let counters = {
  node: 1,
  link: 1,
  arrow: 1,
  polygon: 1,
  rect: 1,
};

/**
 * 현재 활성 도구를 변경한다.
 * - toolbar 버튼 active 상태 갱신
 * - 선택 상태/임시 상태를 초기화할 수도 있음
 */
function resetCounters() {
  counters = { node: 1, link: 1, arrow: 1, polygon: 1, rect: 1 };
}

// 신규 노드 ID 생성: "N_1", "N_2", ...
function nextNodeId() {
  return `N_${counters.node++}`;
}
// 신규 링크 ID 생성: "lk_1", "lk_2", ...
function nextLinkId() {
  return `lk_${counters.link++}`;
}
// 신규 폴리곤 ID 생성: "pg_1", "pg_2", ...
function nextPolyId() {
  return `pg_${counters.polygon++}`;
}


/**
 * 현재 로드된 데이터(json)를 보고
 *  - node: N_x 중 가장 큰 번호 + 1
 *  - link: lk_x 중 가장 큰 번호 + 1
 * 로 counters를 맞춰준다.
 *
 * 즉, 기존 프로젝트 불러왔을 때
 * "이미 있는 ID 이후부터" 이어서 번호가 매겨지게 하는 역할.
 */
function setCountersFromData(json) {
  // nodes: { "n_3": {...}, "n_10": {...} } 또는 배열일 수도 있다면 보완
  const nodeIds = Array.isArray(json?.nodes)
    ? json.nodes.map((n) => n.id)
    : Object.keys(json?.nodes || {});
  const maxNode = nodeIds.reduce((m, id) => {
    const mtx = /^N_(\d+)$/.exec(id || "");
    return Math.max(m, mtx ? parseInt(mtx[1], 10) : 0);
  }, 0);
  counters.node = (maxNode || 0) + 1;

  // links: 배열 [{id:"lk_5", a:"n_1", b:"n_2"}, ...] 또는 생성 규칙이 없다면 0으로
  const linkIds = (json?.links || []).map((l) => l.id);
  const maxLink = linkIds.reduce((m, id) => {
    const mtx = /^lk_(\d+)$/.exec(id || "");
    return Math.max(m, mtx ? parseInt(mtx[1], 10) : 0);
  }, 0);
  counters.link = (maxLink || 0) + 1;
}

// --------------------------------------
// ------------ App State ---------------
// 전체 에디터 상태를 한 곳에 모아두는 객체
// --------------------------------------
const state = {
  // 백엔드 Project PK
  projectId: null,

  // 메타 정보
  projectName: "새 프로젝트",
  projectAuthor: "",

  // "저장되지 않은 변경사항 있음" 플래그
  modified: false,

  // 프로젝트가 한 번이라도 로드/생성 되었는지 여부
  loaded: false,

  // 층 정보
  floors: 4,        // 총 층 수
  startFloor: 0,    // 시작 층 index (0-based, 예: 0=1층)
  scale: 0,         // m/pixel 스케일 (추후 이미지별 설정 예정)
  floorNames: ["1층", "2층", "3층", "4층"], // 층 표시 이름
  images: [],       // 층별 배경 이미지 URL/경로 목록 (floorIndex -> url)
  imageLabels: [],  // 층별 이미지 표시 이름
  imageSizes: [],   // SVG viewBox 등으로 파악한 이미지 크기
  bgOpacity: 1,     // 배경 이미지 투명도 (0~1)
  currentFloor: 0,  // 현재 층 index (0-based)
  imageLocked: true, // 배경 이미지 잠금 여부

  // 그래프 데이터 (실제 저장 포맷과 동일한 구조 유지)
  graph: {
    nodes: [],             // [{id, name, x, y, floor, ...}, ...]
    links: [],             // [{id, a, b, floor, ...}, ...]
    polygons: [],          // [{id, floor, p1:{x,y}, ...}, ...]
    north_reference: null, // {from_node, to_node, azimuth}
  },

  // 뷰(카메라) 변환 정보 (줌/팬)
  view: {
    scale: 1,              // 확대/축소 배율
    tx: 0,                 // viewBox offset X
    ty: 0,                 // viewBox offset Y
  },

  // 현재 선택된 도구 (select/node/link/polygon/compass 등)
  tool: "select",

  // 현재 선택 상태
  selection: { type: null, id: null },

  // 스냅(격자/가이드라인) 상태
  snap: {
    active: true,           // 스냅 ON/OFF
    tol: 10,                // 허용 거리(px)
    cand: { v: null, h: null }, // { v:{x,ax,ay,dx}, h:{y,ax,ay,dy} }
  },

  // 나침반(방위) 설정 도구용 임시 상태
  compass: {
    picking: null,         // "from" 선택 중 / "to" 선택 중 여부
    tempA: null,           // 선택된 from 노드 ID
    tempB: null,           // 선택된 to 노드 ID
  },

  // 층별 시퀀스 번호 (노드/링크/폴리곤 nseq, lseq, pseq 관리)
  seq: {
    node: {},   // floor -> max nseq
    link: {},   // floor -> max lseq
    polygon: {},// floor -> max pseq
  },
  visibility: {
    node: {},   // id -> hidden?
    link: {},
    polygon: {},
  },
  overlayStyle: null,
  inlineSvgMarkup: [],
};

let currentBackgroundMarkup = { floor: null, markup: null };

const TOOL_KEY_MAP = {
  "1": "select",
  "2": "node",
  "3": "link",
  "4": "polygon",
  "5": "compass",
};

const PAN_SPEED = 1.5;

// 마우스 화면 좌표 저장용
state.mouse = { x: 0, y: 0 };

// === Undo/Redo history ======================================================
// - stack: 편집 스냅샷 배열
// - index: 현재 위치 (0-based)
// - max  : 최대 기록 개수
state.history = {
  stack: [],
  index: -1,
  max: 50, // 최대 50단계까지 기억
};

state.floorNames = sanitizeFloorNames(state.floorNames, state.floors);
state.imageLabels = Array.from({ length: state.floors }, () => "");
state.imageSizes = Array.from({ length: state.floors }, () => null);
state.inlineSvgMarkup = Array.from({ length: state.floors }, () => null);
state.bgOpacity = Math.min(1, Math.max(0, Number(state.bgOpacity) || 1));

/**
 * 현재 state에서 Undo/Redo용 스냅샷을 하나 만든다.
 * - graph 전체
 * - currentFloor
 * - selection
 * 을 복사해서 돌려준다.
 */
function makeSnapshot() {
  return {
    // graph는 깊은 복사 (JSON 직렬화/역직렬화)
    graph: state.graph
      ? JSON.parse(JSON.stringify(state.graph))
      : { nodes: [], links: [], polygons: [] },
    
    // 현재 층 index
    currentFloor: state.currentFloor,

    // 선택 상태는 얕은 복사
    selection: state.selection ? { ...state.selection } : null,
  };
}

/**
 * 히스토리 스냅샷을 실제 state에 적용한다.
 * - Undo/Redo에서 호출
 */
function applySnapshot(snap) {
  if (!snap) return;

  // graph 교체 (deep copy)
  state.graph = snap.graph
    ? JSON.parse(JSON.stringify(snap.graph))
    : { nodes: [], links: [], polygons: [] };
  setCountersFromData({
    nodes: state.graph.nodes || [],
    links: state.graph.links || [],
  });
  rebuildSeqFromData?.();

  // 층
  state.currentFloor =
    typeof snap.currentFloor === "number"
      ? snap.currentFloor
      : state.currentFloor;

  // 선택 상태
  state.selection = snap.selection ? { ...snap.selection } : null;

  // 층 셀렉트 박스 값도 같이 맞춰준다.
  if (els.floorSelect) {
    els.floorSelect.value = String(state.currentFloor);
  }

  // 현재 층/그래프에 맞게 화면 다시 그리기
  renderFloor?.();
  redrawOverlay?.();
  updateLayersPanel?.();
}


/**
 * 현재 편집 상태를 직렬화해서 문자열로 만든다.
 * - 포맷 serializeToDataFormat() 기준으로 비교
 * - 이 문자열을 기준으로 "저장된 시점과 다른가" 판별
 */
function snapshotCurrent() {
  try {
    // 포맷 기준으로 비교하면, meta/azimuth 등도 같이 감지 가능
    return JSON.stringify(serializeToDataFormat());
  } catch {
    // 직렬화 에러 시에는 null 반환
    return null;
  }
}

/**
 * "현재 상태"를 기준으로
 *  - 마지막 저장 스냅샷(_savedSnapshot)
 *  - modified 플래그
 * 를 초기화
 * (저장 직후 / 프로젝트 로드 직후에 호출)
 */
function updateSavedSnapshot() {
  state._savedSnapshot = snapshotCurrent();
  state.modified = false;
}

/**
 * 저장 이후에 변경사항이 있는지 여부
 * - 직렬화 문자열이 다르면 변경된 것으로 판단
 */
function hasUnsavedChanges() {
  if (!state._savedSnapshot) return false;
  const cur = snapshotCurrent();
  return cur !== state._savedSnapshot;
}

/**
 * 히스토리 스택 초기화
 * - 새 프로젝트를 열었거나, 프로젝트를 처음 로드한 직후에
 *   현재 상태 한 번만 스냅샷으로 저장
 */
function resetHistory() {
  // history 스택 비우고 최대 개수 100으로 재설정
  state.history = { stack: [], index: -1, max: 100 };

  // 현재 상태 기준 스냅샷
  const snap = makeSnapshot(); // 현재 상태 (로드 직후)
  state.history.stack.push(snap);
  state.history.index = 0;

  // 저장 기준도 같이 초기화
  state._savedSnapshot = snapshotCurrent();
  state.modified = false;
}

/**
 * 편집 작업이 발생할 때마다 호출해서
 * 현재 상태를 히스토리에 push.
 *
 * - Undo 이후에 새로운 작업이 오면
 *   → 현재 index 뒤쪽(redo 후보)을 잘라낸다.
 * - 최대 개수 초과 시 가장 오래된 스냅샷 제거.
 */
function pushHistory() {
  const h = state.history;
  const snap = makeSnapshot();

  // Undo 후 새로운 작업이 오면, 그 뒤 redo 라인은 날린다
  if (h.index < h.stack.length - 1) {
    h.stack.splice(h.index + 1);
  }

  // 현재 상태 스냅샷 추가
  h.stack.push(snap);

  // 최대 개수 초과 시 앞에서 하나 제거
  if (h.stack.length > h.max) {
    h.stack.shift();
  }

  // 항상 마지막(=가장 최신) 위치를 가리키게 index 갱신
  h.index = h.stack.length - 1;
}


/**
 * Undo(되돌리기)
 * - history.index를 1 감소시키고
 * - 해당 스냅샷을 state에 적용
 */
function undo() {
  const h = state.history;
  if (h.index <= 0) return;

  h.index -= 1;
  const snap = h.stack[h.index];
  applySnapshot(snap);
}

/**
 * Redo(다시 실행)
 * - history.index를 1 증가시키고
 * - 해당 스냅샷을 state에 적용
 */
function redo() {
  const h = state.history;
  if (h.index < 0 || h.index >= h.stack.length - 1) return;

  h.index += 1;
  const snap = h.stack[h.index];
  applySnapshot(snap);
}

// 키보드 상태 기록 (shift, alt 등)
// - 드래그 스냅/다중선택 등에서 활용
state.keys = { shift: false, alt: false };

// 현재 화면에 표시 중인 스냅 가이드 정보
state.snapGuide = null;

// 나침반(정북 방향) 기준 정보
// - from_node, to_node: 기준이 되는 두 노드
// - azimuth: 실제 방위각 (0~360, 북=0)
state.northRef = state.northRef || {
  from_node: null,
  to_node: null,
  azimuth: 0,
};


/**
 * els: 자주 쓰는 DOM 요소들을 한 번에 캐시해두는 객체
 * - 매번 document.getElementById() 하지 않고
 *   els.xxx 로 재사용하기 위해 모아둔 것
 */
const els = {
  // 상단 버튼들
  btnNew: document.getElementById("btnNew"),
  btnOpen: document.getElementById("btnOpen"),
  btnSave: document.getElementById("btnSave"),
  btnExport: document.getElementById("btnExport"),

  // 층 / 배경 이미지 관련
  floorSelect: document.getElementById("floorSelect"),
  btnLoadBg: document.getElementById("btnLoadBg"),
  btnClearBg: document.getElementById("btnClearBg"),
  btnLock: document.getElementById("btnLock"),
  btnRenameFloor: document.getElementById("btnRenameFloor"),
  bgName: document.getElementById("bgName"),

  // 캔버스 / 스테이지 / 배경 이미지 / 빈 상태 / 상태바
  canvas: document.getElementById("canvas"),
  stageWrap: document.getElementById("stageWrap"),
  stage: document.getElementById("stage"),
  stageBackground: document.getElementById("stageBackground"),
  documentBackground: document.getElementById("documentBackground"),
  backgroundLayer: document.getElementById("backgroundLayer"),
  bgImg: document.getElementById("bgImg"),
  canvasFrame: document.getElementById("canvasFrame"),
  empty: document.getElementById("emptyState"),
  status: document.getElementById("status"),
  bgOpacity: document.getElementById("bgOpacity"),
  bgOpacityValue: document.getElementById("bgOpacityValue"),

  // 우측 프로젝트 정보 영역
  projName: document.getElementById("projName"),
  projAuthor: document.getElementById("projAuthor"),
  projState: document.getElementById("projState"),
  floorLbl: document.getElementById("floorLbl"),
  selLbl: document.getElementById("selLbl"),
  layerInfo: document.getElementById("layerInfo"),
  totalInfo: document.getElementById("totalInfo"),

  // 토스트 메시지
  toast: document.getElementById("toast"),

  // 새 프로젝트 모달
  modalBack: document.getElementById("newModalBack"),
  closeModal: document.getElementById("closeModal"),
  projectName: document.getElementById("projectName"),
  projectAuthor: document.getElementById("projectAuthor"),
  floorCount: document.getElementById("floorCount"),
  floorFiles: document.getElementById("floorFiles"),
  modalOk: document.getElementById("btnModalOk"),
  modalReset: document.getElementById("btnModalReset"),

  // 시작점 설정 (속성 패널)
  startX: document.getElementById("startX"),
  startY: document.getElementById("startY"),
  btnPickStart: document.getElementById("btnPickStart"),

  // SVG overlay 루트
  overlay: document.getElementById("overlay"),

  // 노드 속성 패널 요소
  nodeGroup: document.getElementById("nodeGroup"),
  nodeId: document.getElementById("nodeId"),
  nodeName: document.getElementById("nodeName"),
  nodeX: document.getElementById("nodeX"),
  nodeY: document.getElementById("nodeY"),
  nodeType: document.getElementById("nodeType"),

  // 링크 속성 패널 요소
  linkGroup: document.getElementById("linkGroup"),
  linkId: document.getElementById("linkId"),
  linkFrom: document.getElementById("linkFrom"),
  linkTo: document.getElementById("linkTo"),

  // 폴리곤 속성 패널 요소
  polyGroup: document.getElementById("polyGroup"),
  polyId: document.getElementById("polyId"),
  polyName: document.getElementById("polyName"),
  polyPtsContainer: document.getElementById("polyPts"),

  // 방위(나침반) 속성 패널 요소
  compassPanel: document.getElementById("compassPanel"),
  compassFrom: document.getElementById("compassFrom"),
  compassTo: document.getElementById("compassTo"),
  compassAz: document.getElementById("compassAz"),
  btnCompassApply: document.getElementById("btnCompassApply"),
  btnCompassClear: document.getElementById("btnCompassClear"),
  compassInfo: document.getElementById("compassInfo"),
};

const polygonPointRows = [];

// ---------------------------------------
// ------------- Helpers -----------------
// ---------------------------------------

function defaultFloorName(idx) {
  return `${idx + 1}층`;
}

function sanitizeFloorNames(names, count) {
  const source = Array.isArray(names) ? names : [];
  return Array.from({ length: count }, (_, i) => {
    const raw = source[i];
    const text = typeof raw === "string" ? raw.trim() : "";
    return text || defaultFloorName(i);
  });
}

function getFloorName(idx) {
  if (!Array.isArray(state.floorNames)) {
    state.floorNames = [];
  }
  if (!Number.isInteger(idx) || idx < 0) return defaultFloorName(0);
  const raw = state.floorNames[idx];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return defaultFloorName(idx);
}

function extractFileNameFromUrl(url = "") {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("blob:")) return "임시 이미지";
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    return decodeURIComponent(parts.pop() || "") || parsed.hostname;
  } catch (_) {
    const parts = url.split("/");
    return decodeURIComponent(parts.pop() || "");
  }
}

function normalizeImageUrl(raw = "") {
  if (!raw) return "";
  if (/^https?:\/\//.test(raw)) {
    if (raw.includes("127.0.0.1") || raw.includes("localhost")) {
      try {
        const u = new URL(raw);
        return `${API_ORIGIN}${u.pathname}${u.search}${u.hash}`;
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${API_ORIGIN}${path}`;
}

function ensureImageArrays(size) {
  if (!Array.isArray(state.images)) state.images = [];
  if (!Array.isArray(state.imageLabels)) state.imageLabels = [];
  if (!Array.isArray(state.imageSizes)) state.imageSizes = [];
  if (!Array.isArray(state.inlineSvgMarkup)) state.inlineSvgMarkup = [];
  if (state.images.length < size) state.images.length = size;
  if (state.imageLabels.length < size) state.imageLabels.length = size;
  if (state.imageSizes.length < size) state.imageSizes.length = size;
  if (state.inlineSvgMarkup.length < size) state.inlineSvgMarkup.length = size;
}

function releaseBlobUrls(list) {
  if (!Array.isArray(list)) return;
  list.forEach((url) => {
    if (url && typeof url === "string" && url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
  });
}

function normalizeImageSizeEntry(entry) {
  if (!entry) return null;
  const width = Math.max(1, Number(entry.width) || 0);
  const height = Math.max(1, Number(entry.height) || 0);
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function resetImageState(count) {
  releaseBlobUrls(state.images);
  state.images = Array.from({ length: count }, () => null);
  state.imageLabels = Array.from({ length: count }, () => "");
  state.imageSizes = Array.from({ length: count }, () => null);
  state.inlineSvgMarkup = Array.from({ length: count }, () => null);
  currentBackgroundMarkup = { floor: null, markup: null };
}

function snapshotImageSizes(source = state.imageSizes) {
  return (source || []).map((sz) => normalizeImageSizeEntry(sz));
}

function setInlineSvgMarkup(floor, markup) {
  if (!Number.isInteger(floor) || floor < 0) return;
  ensureImageArrays(Math.max(state.floors, floor + 1));
  state.inlineSvgMarkup[floor] = markup || null;
  if (floor === currentFloor()) {
    renderInlineSvgBackground();
  }
}

function setFloorImageSize(floor, size) {
  if (!Number.isInteger(floor) || floor < 0) return;
  ensureImageArrays(Math.max(state.floors, floor + 1));
  if (size && size.width && size.height) {
    state.imageSizes[floor] = {
      width: Math.max(1, Number(size.width) || 1),
      height: Math.max(1, Number(size.height) || 1),
    };
  } else {
    state.imageSizes[floor] = null;
  }
  if (floor === currentFloor()) {
    applyCurrentFloorImageSize();
  }
  refreshInlineBackgroundForFloor(floor);
}

function getFloorImageSize(floor) {
  const arr = state.imageSizes || [];
  const raw = arr?.[floor];
  if (!raw) return null;
  const w = Number(raw.width) || 0;
  const h = Number(raw.height) || 0;
  if (w > 0 && h > 0) return { width: w, height: h };
  return null;
}

function getCurrentImageSize() {
  const floor = currentFloor();
  const override = getFloorImageSize(floor);
  if (override) return override;
  return {
    width: Math.max(1, els.bgImg?.naturalWidth || els.bgImg?.width || 1),
    height: Math.max(1, els.bgImg?.naturalHeight || els.bgImg?.height || 1),
  };
}

function applyCurrentFloorImageSize() {
  if (els.bgImg) {
    els.bgImg.style.removeProperty("width");
    els.bgImg.style.removeProperty("height");
  }
  updateStageDisplaySize();
  updateStageBackgroundGeometry();
  renderInlineSvgBackground();
}

function computeStageDisplaySize(natSize) {
  const size = {
    width: Math.max(1, Number(natSize?.width) || 1),
    height: Math.max(1, Number(natSize?.height) || 1),
  };
  const canvasRect = els.canvas?.getBoundingClientRect();
  if (!canvasRect || !canvasRect.width || !canvasRect.height) return size;
  return { width: canvasRect.width, height: canvasRect.height };
}

function updateStageDisplaySize() {
  const natSize = getCurrentImageSize();
  const disp = computeStageDisplaySize(natSize);
  if (els.stageWrap) {
    els.stageWrap.style.width = `${disp.width}px`;
    els.stageWrap.style.height = `${disp.height}px`;
  }
  if (els.stage) {
    els.stage.setAttribute("width", disp.width);
    els.stage.setAttribute("height", disp.height);
  }
  if (els.overlay) {
    els.overlay.style.width = "100%";
    els.overlay.style.height = "100%";
  }
}

function updateStageBackgroundGeometry() {
  const size = getCurrentImageSize();
  if (els.stageBackground) {
    els.stageBackground.setAttribute("x", "0");
    els.stageBackground.setAttribute("y", "0");
    els.stageBackground.setAttribute("width", size.width);
    els.stageBackground.setAttribute("height", size.height);
  }
  if (els.documentBackground) {
    els.documentBackground.setAttribute("x", "0");
    els.documentBackground.setAttribute("y", "0");
    els.documentBackground.setAttribute("width", size.width);
    els.documentBackground.setAttribute("height", size.height);
  }
}

function renderInlineSvgBackground() {
  const layer = els.backgroundLayer;
  if (!layer) return;
  const floor = currentFloor();
  const markup = state.inlineSvgMarkup?.[floor] || null;
  if (markup) {
    if (
      currentBackgroundMarkup.floor !== floor ||
      currentBackgroundMarkup.markup !== markup
    ) {
      layer.innerHTML = "";
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(markup, "image/svg+xml");
        const hasError = doc.querySelector("parsererror");
        const root = doc.documentElement;
        if (!hasError && root) {
          const frag = document.createDocumentFragment();
          if (root.tagName?.toLowerCase() === "svg") {
            const children = Array.from(root.childNodes || []);
            children.forEach((child) => {
              frag.appendChild(document.importNode(child, true));
            });
          } else {
            frag.appendChild(document.importNode(root, true));
          }
          layer.replaceChildren(frag);
        } else {
          layer.innerHTML = markup;
        }
      } catch (err) {
        console.warn("inline SVG parse 실패:", err);
        layer.innerHTML = markup;
      }
      currentBackgroundMarkup = { floor, markup };
    }
    layer.style.display = "block";
    if (els.bgImg) {
      els.bgImg.style.display = "none";
    }
  } else {
    layer.innerHTML = "";
    layer.style.display = "none";
    currentBackgroundMarkup = { floor: null, markup: null };
    if (els.bgImg && state.images?.[floor]) {
      els.bgImg.style.display = "block";
    }
  }
  applyViewTransform();
}

function escapeAttributeValue(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildRasterBackgroundSvg(url, size) {
  const w = Math.max(1, Number(size?.width) || 1);
  const h = Math.max(1, Number(size?.height) || 1);
  const safeUrl = escapeAttributeValue(url || "");
  return `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image href="${safeUrl}" xlink:href="${safeUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" />
</svg>`;
}

function refreshInlineBackgroundForFloor(floor) {
  const url = state.images?.[floor];
  if (!url) {
    setInlineSvgMarkup(floor, null);
    return;
  }
  const label = state.imageLabels?.[floor] || "";
  const looksSvg = isSvgLikeSource(label || url);
  if (looksSvg) {
    // SVG는 getInlineSvgMarkup 완료 시 setInlineSvgMarkup에서 렌더됨
    return;
  }
  const size = getFloorImageSize(floor);
  if (!size) return;
  const markup = buildRasterBackgroundSvg(url, size);
  setInlineSvgMarkup(floor, markup);
}

function isSvgLikeSource(nameOrUrl = "") {
  if (!nameOrUrl) return false;
  return /\.svg(\?|#|$)/i.test(nameOrUrl.trim());
}

function isSvgFile(file) {
  if (!file) return false;
  if (file.type) return file.type === "image/svg+xml";
  return isSvgLikeSource(file.name || "");
}

function parseSvgLength(value) {
  if (!value) return null;
  const match = /^(-?\d+(\.\d+)?)([a-z%]*)$/i.exec(value.trim());
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return null;
  const unit = (match[3] || "px").toLowerCase();
  switch (unit) {
    case "px":
    case "":
      return num;
    case "pt":
      return num * (96 / 72);
    case "pc":
      return num * 16;
    case "in":
      return num * 96;
    case "cm":
      return num * (96 / 2.54);
    case "mm":
      return num * (96 / 25.4);
    default:
      return null;
  }
}

function parseSvgSizeFromElement(svg) {
  if (!svg) return null;
  let width = parseSvgLength(svg.getAttribute("width"));
  let height = parseSvgLength(svg.getAttribute("height"));
  const viewBoxAttr = svg.getAttribute("viewBox");
  if ((!width || !height) && viewBoxAttr) {
    const parts = viewBoxAttr
      .trim()
      .split(/[\s,]+/)
      .map((v) => Number(v));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = width || parts[2];
      height = height || parts[3];
    }
  }
  const vb = svg.viewBox?.baseVal;
  if ((!width || !height) && vb) {
    width = width || vb.width || null;
    height = height || vb.height || null;
  }
  if (width && height) return { width, height };
  return null;
}

async function extractSvgSizeFromFile(file) {
  if (!isSvgFile(file)) return null;
  try {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    if (!doc || doc.getElementsByTagName("parsererror").length) return null;
    return parseSvgSizeFromElement(doc.documentElement);
  } catch (err) {
    console.warn("SVG size parse 실패:", err);
    return null;
  }
}

async function getInlineSvgMarkup({ file, url }) {
  try {
    if (file && isSvgFile(file)) {
      return await file.text();
    }
    if (url) {
      let fetchOpts = {};
      try {
        const target = new URL(url, window.location.origin);
        if (target.origin !== window.location.origin) {
          fetchOpts = { mode: "cors", credentials: "omit" };
        }
      } catch (_) {
        fetchOpts = { mode: "cors", credentials: "omit" };
      }
      const res = await fetch(url, fetchOpts);
      if (!res.ok) return null;
      return await res.text();
    }
  } catch (err) {
    console.warn("SVG markup fetch 실패:", err);
  }
  return null;
}

function tryCaptureSvgSizeFromImage(floor) {
  if (!els.bgImg) return;
  const label = state.imageLabels?.[floor] || state.images?.[floor] || "";
  if (!isSvgLikeSource(label)) return;
  try {
    const doc =
      typeof els.bgImg.getSVGDocument === "function"
        ? els.bgImg.getSVGDocument()
        : els.bgImg.contentDocument;
    if (!doc) return;
    const size = parseSvgSizeFromElement(doc.documentElement);
    if (size) {
      setFloorImageSize(floor, size);
    }
  } catch (err) {
    console.warn("현재 이미지에서 SVG 크기 추출 실패:", err);
  }
}

function computeOverlayStyleBySize(size, viewScale = 1) {
  const base = Math.max(
    1,
    Math.max(Number(size?.width) || 1, Number(size?.height) || 1)
  );
  const zoom = Math.max(0.2, Math.min(5, Number(viewScale) || 1));
  const ratio = (base / 1000) * zoom;
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const nodeRadius = clamp(5 * ratio, 2, 9);
  const nodeSelectedRadius = clamp(nodeRadius + 2 * ratio, nodeRadius + 1, nodeRadius + 5);
  const nodeSelectedStroke = clamp(2 * ratio, 1, 4);
  const nodeHighlightStroke = clamp(3 * ratio, 1.2, 5);
  const nodePolyStroke = clamp(2.5 * ratio, 1.2, 4);
  const polyVertexRadius = clamp(nodeRadius * 0.6, 1.5, 5);
  const polyVertexStroke = clamp(2 * ratio, 1, 4);
  const linkStroke = clamp(2 * ratio, 1, 5);
  const linkSelectedStroke = clamp(linkStroke + ratio, linkStroke + 0.5, 6);
  const polyStroke = clamp(2 * ratio, 1, 5);
  const polySelectedStroke = clamp(polyStroke + 0.6 * ratio, polyStroke + 0.3, 6);
  const previewStroke = clamp(2 * ratio, 1, 4);
  const snapDotRadius = clamp(3 * ratio, 1.5, 4);
  const guideStroke = clamp(1.4 * ratio, 0.8, 3);
  return {
    nodeRadius,
    nodeSelectedRadius,
    nodeSelectedStroke,
    nodeHighlightStroke,
    nodePolyStroke,
    polyVertexRadius,
    polyVertexStroke,
    linkStroke,
    linkSelectedStroke,
    polyStroke,
    polySelectedStroke,
    previewStroke,
    snapDotRadius,
    guideStroke,
  };
}

function applyOverlayStyle(style) {
  if (!style) return;
  state.overlayStyle = style;
  const svg = els.overlay;
  if (!svg) return;
  const set = (name, value) => {
    if (value != null) svg.style.setProperty(name, `${value}px`);
  };
  set("--node-radius", style.nodeRadius);
  set("--node-selected-radius", style.nodeSelectedRadius);
  set("--node-selected-stroke-width", style.nodeSelectedStroke);
  set("--node-highlight-stroke-width", style.nodeHighlightStroke);
  set("--node-poly-active-stroke-width", style.nodePolyStroke);
  set("--poly-vertex-radius", style.polyVertexRadius);
  set("--poly-vertex-stroke-width", style.polyVertexStroke);
  set("--link-stroke-width", style.linkStroke);
  set("--link-selected-stroke-width", style.linkSelectedStroke);
  set("--poly-stroke-width", style.polyStroke);
  set("--poly-selected-stroke-width", style.polySelectedStroke);
  set("--poly-preview-stroke-width", style.previewStroke);
}

function setFloorImage(floor, url, label, file) {
  if (!Number.isInteger(floor) || floor < 0) return;
  ensureImageArrays(Math.max(state.floors, floor + 1));
  const prevUrl = state.images[floor];
  if (prevUrl && prevUrl.startsWith("blob:") && prevUrl !== url) {
    try {
      URL.revokeObjectURL(prevUrl);
    } catch (_) {}
  }
  state.images[floor] = url || null;
  const text =
    url && typeof label === "string" && label.trim()
      ? label.trim()
      : url
      ? extractFileNameFromUrl(url)
      : "";
  state.imageLabels[floor] = text;
  const looksSvg = isSvgLikeSource(text || url || "");
  setFloorImageSize(floor, null);
  setInlineSvgMarkup(floor, null);
  if (looksSvg && file && isSvgFile(file)) {
    extractSvgSizeFromFile(file).then((size) => {
      if (size) {
        setFloorImageSize(floor, size);
      }
    });
    getInlineSvgMarkup({ file }).then((markup) => {
      if (markup) {
        setInlineSvgMarkup(floor, markup);
      }
    });
  } else if (looksSvg && url) {
    getInlineSvgMarkup({ url }).then((markup) => {
      if (markup) {
        setInlineSvgMarkup(floor, markup);
      }
    });
  }
  const pill = document.getElementById("fileName_" + floor);
  if (pill) pill.textContent = url ? text || "이미지" : "이미지 없음";
  if (state.loaded && floor === currentFloor()) {
    renderFloor();
  }
}

function updateBgOpacityControls(opacity) {
  const clamped = Math.min(1, Math.max(0, Number(opacity) || 0));
  state.bgOpacity = clamped;
  const percent = Math.round(clamped * 100);
  if (els.bgOpacity) {
    els.bgOpacity.value = String(percent);
  }
  if (els.bgOpacityValue) {
    els.bgOpacityValue.textContent = `${percent}%`;
  }
  if (els.bgImg) {
    els.bgImg.style.opacity = clamped;
  }
  if (els.backgroundLayer) {
    els.backgroundLayer.style.opacity = clamped;
  }
}

/**
 * 에디터 전체 enable/disable
 * - 프로젝트가 아직 로드되지 않았을 때는 대부분의 컨트롤을 막아둔다.
 */
function setEnabled(enabled) {
  // 툴 버튼들 활성/비활성
  document.querySelectorAll(".toolbtn").forEach((b) => (b.disabled = !enabled));

  // 층/배경 관련 입력들
  [
    els.floorSelect,
    els.btnLoadBg,
    els.btnClearBg,
    els.btnLock,
    els.bgOpacity,
    els.btnRenameFloor,
    els.startX,
    els.startY,
    els.btnPickStart,
  ].forEach((e) => {
    if (e) e.disabled = !enabled;
  });

  // 저장/내보내기 버튼
  els.btnSave.disabled = !enabled;
  els.btnExport.disabled = !enabled;

  els.btnOpen?.removeAttribute("disabled");
  els.btnOpen.disabled = false;
}

// 토스트 자동 숨김 타이머 핸들
let toastTimer = null;


/**
 * 상단 토스트 메시지 보여주기
 * - msg: 표시할 텍스트 (기본: "저장되었습니다.")
 * - 1.8초 후 자동으로 사라진다.
 */
function showToast(msg = "저장되었습니다.") {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1800);
}


/**
 * 새 프로젝트 설정 모달 열기
 */
function openModal() {
  els.modalBack.style.display = "flex";

  // 층별 배경 이미지 업로드 행들 렌더링
  buildFloorFileRows();
}

/** 새 프로젝트 모달 닫기 */
function closeModal() {
  els.modalBack.style.display = "none";
}



/**
 * 새 프로젝트 모달 안의 "층별 도면 이미지 업로드" 행들을 만든다.
 *
 * - floorCount 입력 박스의 값(n)을 읽어서
 *   n층까지 반복하며 아래 구조의 DOM을 만든다:
 *   [ 층라벨 | 파일 이름 pill | 선택 버튼 | 제거 버튼 | 숨겨진 file input ]
 */
function getModalFloorNameValues() {
  const map = {};
  if (!els.floorFiles) return map;
  const inputs = els.floorFiles.querySelectorAll(".floor-name-input");
  inputs.forEach((input) => {
    const idx = Number(input.dataset.floor);
    if (!Number.isNaN(idx)) {
      map[idx] = input.value || "";
    }
  });
  return map;
}

function readFloorNamesFromModal(count) {
  const map = getModalFloorNameValues();
  const arr = Array.from({ length: count }, (_, i) => map[i]);
  return sanitizeFloorNames(arr, count);
}

function buildFloorFileRows(preserveNames = true) {
  const n = parseInt(els.floorCount.value || "1", 10);
  const prevNames = preserveNames ? getModalFloorNameValues() : {};

  // 이전 행들 제거
  els.floorFiles.innerHTML = "";

  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "floor-grid";

    // 층 라벨 + 이름 입력
    const label = document.createElement("div");
    const labelTitle = document.createElement("div");
    // labelTitle.textContent = `${i + 1}층`;
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "floor-name-input";
    nameInput.id = `floorNameInput_${i}`;
    nameInput.dataset.floor = String(i);
    nameInput.placeholder = "예: B1";
    nameInput.maxLength = 12;
    let initialName = defaultFloorName(i);
    if (preserveNames) {
      const stateName =
        Array.isArray(state.floorNames) && state.floorNames[i]
          ? state.floorNames[i]
          : null;
      initialName = prevNames[i] ?? stateName ?? initialName;
    }
    nameInput.value = initialName;
    label.appendChild(labelTitle);
    label.appendChild(nameInput);

    // 파일 이름 표시 pill
    const name = document.createElement("div");
    name.id = "fileName_" + i;
    name.className = "pill";
    const existingLabel =
      preserveNames && Array.isArray(state.imageLabels)
        ? state.imageLabels[i]
        : "";
    name.textContent = existingLabel || "이미지 없음";

    // "선택" 버튼 (file input 클릭을 대신해줌)
    const sel = document.createElement("button");
    sel.className = "btn";
    sel.textContent = "선택";

    // "제거" 버튼 (선택된 이미지 해제)
    const rem = document.createElement("button");
    rem.className = "btn";
    rem.textContent = "제거";

    // 실제 파일 입력 (숨겨둔다)
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.className = "floor-file hidden"; // CSS로 display:none 비슷하게 처리
    input.dataset.floor = String(i);       // 어떤 층의 파일인지 표시

    // "선택" 버튼 → 파일 선택 다이얼로그 열기
    sel.onclick = () => {
      input.click();
    };

    // 파일이 선택되면
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setFloorImage(i, url, file.name, file);
      }
    };

    // "제거" 버튼 → 해당 층 배경 이미지 제거
    rem.onclick = () => {
      if (state.images[i]) {
        setFloorImage(i, null);
      }
    };

    // 한 줄(row)에 순서대로 붙이기
    row.append(label, name, sel, rem, input);
    els.floorFiles.appendChild(row);
  }
}


/**
 * 현재 층에 맞는 배경 이미지를 <img id="bgImg">에 세팅하고
 * - 오른쪽 UI의 층 라벨/배경 이름 라벨도 같이 갱신한다.
 */
function renderFloor() {
  const f = currentFloor();
  const url = state.images?.[f] || "";
  updateBgOpacityControls(state.bgOpacity ?? 1);

  if (url) {
    // 배경 이미지 로드 (표시는 inline SVG가 담당)
    if (els.bgImg && els.bgImg.src !== url) {
      els.bgImg.style.display = "none";
      els.bgImg.src = url;
    }
    if (els.canvasFrame) els.canvasFrame.style.display = "block";
    renderInlineSvgBackground();

    const labelFromState = state.imageLabels?.[f];
    const labelFromModal =
      els.floorFiles.querySelector("#fileName_" + state.currentFloor)
        ?.textContent || "";
    const finalLabel =
      labelFromState?.trim() ||
      labelFromModal?.trim() ||
      extractFileNameFromUrl(url) ||
      "이미지";
    els.bgName.textContent = finalLabel;
  } else {
    // 배경 이미지 없음
    els.bgImg.removeAttribute("src");
    els.bgImg.style.display = "none";
    if (els.backgroundLayer) {
      els.backgroundLayer.innerHTML = "";
      els.backgroundLayer.style.display = "none";
    }
    currentBackgroundMarkup = { floor: null, markup: null };
    if (els.canvasFrame) {
      els.canvasFrame.style.display = "none";
    }
    els.bgName.textContent = "이미지 없음";
  }

  // 상단 층 라벨 (🏢 층: 1, 2, ...)
  els.floorLbl.textContent = "🏢 층: " + getFloorName(state.currentFloor);

  // 선택 라벨 초기화
  els.selLbl.textContent = " ";
  applyCurrentFloorImageSize();
}


/**
 * 현재 층 인덱스 반환 (0-based)
 * - 기존에 쓰던 state.currentfloor(소문자 f)와의 호환도 고려
 */
function currentFloor() {
  // (레거시 호환) state.currentfloor 사용 중이면 그 값을 우선
  return Number(state.currentFloor ?? state.currentfloor ?? 0);
}

function setFloor(nextFloor) {
  if (!Number.isInteger(nextFloor)) return;
  state.currentFloor = nextFloor;
  state.currentfloor = nextFloor;
  if (els.floorSelect) {
    els.floorSelect.value = String(nextFloor);
  }
  renderFloor?.();
  redrawOverlay?.();
  updateLayersPanel?.();
}

/**
 * 노드 ID로 노드 객체 찾기
 */
function getNodeById(id) {
  const sid = String(id);
  return (state.graph?.nodes || []).find((n) => String(n.id) === sid) || null;
}

/**
 * 특정 층(floor)에 속한 노드 목록만 필터링
 */
function nodesOnFloor(f) {
  return (state.graph.nodes || []).filter((n) => (n.floor ?? 0) === f);
}

/**
 * 특정 층(floor)에 속한 링크 목록만 필터링
 */
function linksOnFloor(f) {
  return (state.graph.links || []).filter((l) => (l.floor ?? 0) === f);
}

/**
 * 특정 층(floor)에 속한 폴리곤 목록만 필터링
 */
function polysOnFloor(f) {
  return (state.graph.polygons || []).filter(
    (p) => Number(p.floor ?? 0) === Number(f)
  );
}

function nextNodeSeq(floor) {
  const f = Number(floor);
  const m = state.seq.node;
  m[f] = (m[f] || 0) + 1;
  return m[f];
}

function nextLinkSeq(floor) {
  const f = Number(floor);
  const m = state.seq.link;
  m[f] = (m[f] || 0) + 1;
  return m[f];
}
function nextPolySeq(floor) {
  state.seq.polygon[floor] = (state.seq.polygon[floor] ?? 0) + 1;
  return state.seq.polygon[floor];
}


/**
 * 노드 라벨 문자열 만들기
 * - 우선순위:
 *   1) name 속성(사용자가 입력한 이름)
 *   2) 층별 시퀀스 nseq → "N_3" 같은 형태
 *   3) id 그대로 문자열로
 */
function nodeLabel(n) {
  const nm = (n?.name || "").trim();
  if (nm) return nm;
  if (Number.isInteger(n?.nseq) && n.nseq > 0) return `N_${n.nseq}`;
  return String(n?.id ?? "");
}

/**
 * 링크 라벨 문자열 만들기
 * - 노드와 헷갈리지 않도록 "lk_{lseq}"만 사용
 * - lseq 없으면 id 그대로 사용
 */
function linkLabel(l) {
  if (Number.isInteger(l?.lseq) && l.lseq > 0) return `lk_${l.lseq}`;
  return String(l?.id ?? "");
}


/**
 * 링크 양 끝 노드 이름을 "A → B" 형태로 표현
 * - 같은 층의 노드 배열(nodes)에서 id로 찾아서 nodeLabel() 사용
 */
function linkEndpointsLabel(l, nodes) {
  // 같은 층의 노드 배열에서 id로 찾기
  const a = nodes.find((nn) => String(nn.id) === String(l.a));
  const b = nodes.find((nn) => String(nn.id) === String(l.b));
  if (!a || !b) return ""; // 가드
  return `${nodeLabel(a)} → ${nodeLabel(b)}`;
}


/**
 * 주어진 좌표(pt)에 가장 가까운 노드를 찾는다.
 *
 * @param {number} floor    - 층 index
 * @param {{x:number,y:number}} pt - 이미지 좌표계 상의 점
 * @param {number} maxDist  - 최대 허용 거리(px)
 * @returns {object|null}   - 가까운 노드 또는 null
 */
function findNearestNodeForPoint(floor, pt, maxDist = 20) {
  const nodesF = nodesOnFloor(floor);
  let best = null;
  let bestD2 = Infinity;

  for (const n of nodesF) {
    const dx = n.x - pt.x;
    const dy = n.y - pt.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = n;
    }
  }

  if (!best) return null;

  // 실제 거리(제곱근)가 maxDist보다 크면 너무 멀다고 판단
  if (Math.sqrt(bestD2) > maxDist) return null;

  return best;
}

function clearPolygonPointRows() {
  polygonPointRows.length = 0;
  if (els.polyPtsContainer) {
    els.polyPtsContainer.innerHTML = "";
  }
}

function handlePolygonPointInput(idx) {
  const row = polygonPointRows[idx];
  if (!row) return;
  if (state.selection?.type !== "polygon") return;
  const poly = (state.graph.polygons || []).find(
    (x) => x.id === state.selection.id
  );
  if (!poly) return;

  const xVal = Number(row.x.value);
  const yVal = Number(row.y.value);
  if (!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;

  const floor = Number(poly.floor ?? currentFloor());
  const nearest = findNearestNodeForPoint(floor, { x: xVal, y: yVal });
  if (nearest) {
    poly.nodes = poly.nodes || [];
    poly.nodes[idx] = nearest.id;
    row.x.value = Math.round(nearest.x);
    row.y.value = Math.round(nearest.y);
    row.node.textContent = nodeLabel(nearest);
    redrawOverlay();
  }
}

function syncPolygonPointRows(p) {
  if (!p) return;
  const nodes = p.nodes || [];
  const floor = Number(p.floor ?? currentFloor());
  polygonPointRows.forEach((row, idx) => {
    const nodeId = nodes[idx];
    const n = nodeId ? getNodeById(nodeId) : null;
    if (n && Number(n.floor ?? 0) === floor) {
      row.x.value = Math.round(n.x);
      row.y.value = Math.round(n.y);
      row.node.textContent = nodeLabel(n);
    } else {
      row.x.value = "";
      row.y.value = "";
      row.node.textContent = "";
    }
  });
}

function renderPolygonPointRows(p) {
  clearPolygonPointRows();
  if (!els.polyPtsContainer) return;
  if (!p || !Array.isArray(p.nodes) || p.nodes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "노드가 없습니다.";
    els.polyPtsContainer.appendChild(empty);
    return;
  }

  p.nodes.forEach((_, idx) => {
    const row = document.createElement("div");
    row.className = "poly-vertex-row";

    const label = document.createElement("span");
    label.className = "pv-label";
    label.textContent = `P${idx + 1}`;

    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.className = "coord-input";

    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.className = "coord-input";

    const nodeSpan = document.createElement("span");
    nodeSpan.className = "pv-node mono small";

    const onChange = () => handlePolygonPointInput(idx);
    xInput.addEventListener("change", onChange);
    yInput.addEventListener("change", onChange);

    row.append(label, xInput, yInput, nodeSpan);
    els.polyPtsContainer.appendChild(row);

    polygonPointRows[idx] = { x: xInput, y: yInput, node: nodeSpan };
  });

  syncPolygonPointRows(p);
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const tRaw = ((px - x1) * vx + (py - y1) * vy) / len2;
  const t = Math.max(0, Math.min(1, tRaw));
  const projX = x1 + vx * t;
  const projY = y1 + vy * t;
  const dx = px - projX;
  const dy = py - projY;
  return { dist: Math.hypot(dx, dy), t, projX, projY };
}

function maybeSplitLinkAtNode(node, tolerance = 6) {
  if (!node || !Array.isArray(state.graph.links)) return false;
  const floor = Number(node.floor ?? 0);
  for (let i = 0; i < state.graph.links.length; i++) {
    const link = state.graph.links[i];
    if (Number(link.floor ?? floor) !== floor) continue;
    const A = getNodeById(link.a);
    const B = getNodeById(link.b);
    if (!A || !B) continue;
    const res = distancePointToSegment(node.x, node.y, A.x, A.y, B.x, B.y);
    if (res.dist > tolerance) continue;
    if (res.t <= 0.05 || res.t >= 0.95) continue;

    // remove original link
    state.graph.links.splice(i, 1);
    i--;

    const first = {
      id: nextLinkId(),
      floor,
      lseq: nextLinkSeq(floor),
      a: A.id,
      b: node.id,
    };
    const second = {
      id: nextLinkId(),
      floor,
      lseq: nextLinkSeq(floor),
      a: node.id,
      b: B.id,
    };
    state.graph.links.push(first, second);
    return true;
  }
  return false;
}


/**
 * 우측 "폴리곤 속성" 패널을 현재 선택된 폴리곤 p 기준으로 갱신
 * - p가 없으면 패널 숨김
 * - p가 있으면 ID / 이름 / 네 점의 좌표 / 각 점에 붙은 노드 이름 표시
 */
function refreshPolygonPanel(p) {
  if (!els.polyGroup) return;

  // 선택된 폴리곤이 없으면 패널 숨김
  if (!p) {
    els.polyGroup.style.display = "none";
    clearPolygonPointRows();
    return;
  }
  els.polyGroup.style.display = "";

  // ID, 이름
  els.polyId.value = p.id || "";
  els.polyName.value = p.name || "";

  // 폴리곤이 속한 층과, p에 연결된 노드 id 배열
  const floor = Number(p.floor ?? currentFloor());
  const nodes = p.nodes || [];

  renderPolygonPointRows(p);
}

function isElementHidden(type, id) {
  const group = state.visibility?.[type];
  if (!group) return false;
  return !!group[id];
}

function setElementHidden(type, id, hidden) {
  state.visibility = state.visibility || { node: {}, link: {}, polygon: {} };
  const group = state.visibility[type];
  if (!group) return;
  if (hidden) {
    group[id] = true;
  } else {
    delete group[id];
  }
  redrawOverlay();
  updateLayersPanel?.();
}


/**
 * 그래프 데이터(state.graph)를 스캔해서
 *  - 층별 노드 nseq
 *  - 층별 링크 lseq
 *  - 층별 폴리곤 pseq
 * 을 다시 계산해서 state.seq에 반영한다.
 *
 * - 이미 nseq/lseq/pseq 값이 있으면 그 최대값을 기준으로,
 *   없는 항목에만 새 번호를 부여한다.
 */
function rebuildSeqFromData() {
  // 데이터에 이미 nseq/lseq가 있으면 그 최대값으로 복구,
  // 없으면 생성 순서대로 부여
  state.seq = state.seq || { node: {}, link: {}, polygon: {} };
  state.seq.node = {};
  state.seq.link = {};
  state.seq.polygon = {};

  // --- 노드 ---
  // floor별로 그룹핑하고, 각 floor에서 n.nseq 최대값 계산
  const groupedNodes = new Map(); // floor -> [nodes...]
  for (const n of state.graph.nodes || []) {
    const f = Number(n.floor ?? 0);
    if (!groupedNodes.has(f)) groupedNodes.set(f, []);
    groupedNodes.get(f).push(n);
  }
  for (const [f, arr] of groupedNodes) {
    let maxSeq = 0;

    // 이미 nseq가 있으면 그걸 우선 신뢰
    for (const n of arr) {
      if (Number.isInteger(n.nseq) && n.nseq > maxSeq) maxSeq = n.nseq;
    }
    // 없는 노드에는 생성 순서대로 부여
    for (const n of arr) {
      if (!Number.isInteger(n.nseq) || n.nseq <= 0) {
        maxSeq += 1;
        n.nseq = maxSeq;
      }
    }

    state.seq.node[f] = maxSeq;
  }

  // --- 링크 ---
  const groupedLinks = new Map(); // floor -> [links...]
  for (const l of state.graph.links || []) {
    const f = Number(l.floor ?? 0);
    if (!groupedLinks.has(f)) groupedLinks.set(f, []);
    groupedLinks.get(f).push(l);
  }
  for (const [f, arr] of groupedLinks) {
    let maxSeq = 0;

    // 기존 lseq 최대값 찾기
    for (const l of arr) {
      if (Number.isInteger(l.lseq) && l.lseq > maxSeq) maxSeq = l.lseq;
    }

    // 없는 링크에만 새 번호 부여
    for (const l of arr) {
      if (!Number.isInteger(l.lseq) || l.lseq <= 0) {
        maxSeq += 1;
        l.lseq = maxSeq;
      }
    }

    state.seq.link[f] = maxSeq;
  }

  // --- 폴리곤 ---
  const groupedPolys = new Map(); // floor -> [polygons...]
  for (const p of state.graph.polygons || []) {
    const f = Number(p.floor ?? 0);
    if (!groupedPolys.has(f)) groupedPolys.set(f, []);
    groupedPolys.get(f).push(p);
  }

  for (const [f, arr] of groupedPolys) {
    let maxSeq = 0;

    // 기존 pseq 최대값 찾기
    for (const p of arr) {
      if (Number.isInteger(p.pseq) && p.pseq > maxSeq) maxSeq = p.pseq;
    }

    // 없는 폴리곤에만 새 번호 부여
    for (const p of arr) {
      if (!Number.isInteger(p.pseq) || p.pseq <= 0) {
        maxSeq += 1;
        p.pseq = maxSeq;
      }
    }
    
    state.seq.polygon[f] = maxSeq;
  }
}

/**
 * 파일/프로젝트 이름에 쓸 문자열을 OS에서 안전한 형태로 정리
 * - 양 끝 공백 제거
 * - 빈 문자열이면 "project" 기본값
 * - 윈도우/맥에서 폴더명으로 쓸 수 없는 문자 제거
 * - 최대 길이 80자로 제한
 */
function sanitizeName(str) {
  const s = (str || "").trim() || "project";
  // 윈도우/맥에서 폴더명 불가 문자 제거
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}


/**
 * "현재 프로젝트 이름"을 여러 소스에서 종합해서 결정
 *
 * 우선순위:
 *  1) 새 프로젝트 모달 입력값 (els.projectName)
 *  2) 에디터 상단 input (els.projName.value)
 *  3) 에디터 상단 라벨 텍스트(이름: ... 형태라면 접두사 제거)
 *  4) state.projectName
 *  5) 기타 예비 DOM (id="projectName")
 *
 * 반환값은 sanitizeName()으로 정리된 문자열.
 */
function getProjectName() {
  const s = (x) => (typeof x === "string" ? x.trim() : "");

  // 1) 명시 입력 필드들 (프로젝트 설정 모달 input 등)
  const fromModalInput = s(els.projectName?.value);

  // 2) 에디터 상단이 input인 경우
  const fromHeaderInput = s(els.projName?.value);

  // 3) 에디터 상단이 라벨(span/div)인 경우 → "이름: " 접두 제거
  const fromHeaderLabel = s(els.projName?.textContent)
    ?.replace(/^이름:\s*/, "")
    .trim();

  // 4) 최근 state (로드/입력 이벤트에서 항상 동기화)
  const fromState = s(state?.projectName);

  // 5) 기타 예비 (혹시 남아있는 id 기반 input)
  const fromDom = s(document.getElementById("projectName")?.value);

  // 우선순위대로 하나 골라서 sanitize
  const name =
    fromModalInput ||
    fromHeaderInput ||
    fromHeaderLabel ||
    fromState ||
    fromDom ||
    "";
  const clean = sanitizeName(name);
  return clean || "새 프로젝트";
}


/**
 * 배경 이미지 <img id="bgImg"> 가 실제로 로드 완료되었을 때 호출.
 * - naturalWidth, naturalHeight를 읽어서 stage/overlay 크기 세팅
 * - 현재 view transform을 적용하고 overlay 다시 그림
 */
els.bgImg.addEventListener("load", () => {
  const floor = currentFloor();
  const label = state.imageLabels?.[floor] || state.images?.[floor] || "";
  const looksSvg = isSvgLikeSource(label);
  if (!getFloorImageSize(floor)) {
    if (looksSvg) {
      tryCaptureSvgSizeFromImage(floor);
    } else if (els.bgImg?.naturalWidth && els.bgImg?.naturalHeight) {
      setFloorImageSize(floor, {
        width: els.bgImg.naturalWidth,
        height: els.bgImg.naturalHeight,
      });
    }
  } else if (!looksSvg) {
    refreshInlineBackgroundForFloor(floor);
  }
  applyCurrentFloorImageSize();
  applyViewTransform();
  redrawOverlay();
});

/**
 * 좌측 "층" 드롭다운(els.floorSelect)을 현재 state.floors 기준으로 채운다.
 * - value: 0,1,2,... (0-based)
 * - text : "1층", "2층", ...
 */
function populateFloorSelect() {
  els.floorSelect.innerHTML = "";
  for (let i = 0; i < state.floors; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = getFloorName(i);
    els.floorSelect.appendChild(o);
  }

  // 현재 층 선택 반영
  els.floorSelect.value = String(state.currentFloor);
}


/**
 * 프로젝트가 정상적으로 로드/생성된 이후 한 번 호출.
 * - state.loaded 플래그 켜고
 * - UI 활성화 / 빈 화면 숨김 / 상태 메시지 표시
 * - 층 셀렉트/배경 렌더링
 * - 히스토리 & "저장됨 기준 스냅샷" 초기화
 */
function activateProject() {
  state.loaded = true;
  setEnabled(true);
  els.empty.style.display = "none";
  els.status.textContent =
    "프로젝트가 로드되었습니다. 작업을 시작할 수 있습니다.";
  populateFloorSelect();
  renderFloor();

  resetHistory();
  updateSavedSnapshot();
}


/**
 * 나침반(방위) 패널에서 사용할 셀렉트 박스(From/To) 옵션을 갱신.
 * - graph.nodes 전체를 돌면서
 *   value: node.id (내부 식별자)
 *   text : "이름 (N_nseq)" 형태 또는 "N_nseq / id"
 */
function populateCompassNodeSelects() {
  const make = (sel) => {
    if (!sel) return;
    sel.innerHTML = "";

    for (const n of state.graph.nodes || []) {
      const opt = document.createElement("option");
      opt.value = n.id; // 내부 id 사용

      const labelSeq = n.nseq != null ? `N_${n.nseq}` : n.id;
      opt.textContent =
        n.name && n.name.trim() ? `${n.name} (${labelSeq})` : labelSeq;

      sel.appendChild(opt);
    }
  };

  // From / To 셀렉트 박스 각각 채우기
  make(els.compassFrom);
  make(els.compassTo);

  // 기존 northRef가 있으면 선택값 맞추기
  if (state.northRef?.from_node && els.compassFrom) {
    els.compassFrom.value = state.northRef.from_node;
  }
  if (state.northRef?.to_node && els.compassTo) {
    els.compassTo.value = state.northRef.to_node;
  }
  if (els.compassAz && typeof state.northRef?.azimuth === "number") {
    els.compassAz.value = state.northRef.azimuth;
  }

  // 하단 설명 라벨(예: "현재: A → B, 30°") 업데이트
  if (els.compassInfo) {
    const nf = state.northRef;
    if (nf?.from_node && nf?.to_node) {
      const fromN = getNodeById(nf.from_node);
      const toN = getNodeById(nf.to_node);
      const fromLabel = fromN ? nodeLabel(fromN) : nf.from_node;
      const toLabel = toN ? nodeLabel(toN) : nf.to_node;
      els.compassInfo.textContent = `현재: ${fromLabel} → ${toLabel}, ${
        nf.azimuth ?? 0
      }°`;
    } else {
      els.compassInfo.textContent = "미설정";
    }
  }
}


// ------------------------------------------------------------
// -------------------- snap (스냅 가이드) --------------------
// ------------------------------------------------------------

/**
 * 스냅 후보가 될 수 있는 모든 '앵커 포인트'를 모아서 배열로 반환.
 * - 노드 좌표
 * - (옵션) 링크 끝점
 * - (옵션) 사각형/폴리곤 꼭짓점
 *
 * 반환 예: [{x:10,y:20}, {x:50,y:80}, ...]
 */
function collectSnapAnchors() {
  const a = [];
  const floor = Number(currentFloor());
  const sameFloor = (value) => Number(value ?? 0) === floor;

  // 1) 노드 (현재 층만)
  for (const n of state.graph.nodes || []) {
    if (sameFloor(n.floor)) a.push({ x: n.x, y: n.y });
  }

  // 2) 링크 끝점 (현재 층 노드만)
  for (const l of state.graph.links || []) {
    const A = state.graph.nodes.find((n) => n.id === l.a);
    const B = state.graph.nodes.find((n) => n.id === l.b);
    if (A && sameFloor(A.floor)) a.push({ x: A.x, y: A.y });
    if (B && sameFloor(B.floor)) a.push({ x: B.x, y: B.y });
  }

  // 4) 폴리곤에 연결된 노드 좌표 (현재 층만)
  for (const p of state.graph.polygons || []) {
    if (!sameFloor(p.floor)) continue;
    for (const nid of p.nodes || []) {
      const n = getNodeById(nid);
      if (n && sameFloor(n.floor)) a.push({ x: n.x, y: n.y });
    }
  }
  return a;
}


/**
 * 주어진 포인트(px, py)에 대해
 *  - 수직/수평 방향으로 가장 가까운 스냅 후보(v, h)를 찾는다.
 *
 * @param {number} px - 기준 x (이미지 좌표)
 * @param {number} py - 기준 y
 * @param {number} tol - 허용 거리(px). 기본값 state.snap.tol
 *
 * 반환값 예:
 *   {
 *     v: { x, ax, ay, dx }, // 수직 스냅 (x좌표 기준)
 *     h: { y, ax, ay, dy }  // 수평 스냅 (y좌표 기준)
 *   }
 *  - ax, ay : 기준이 되는 스냅 앵커 좌표
 *  - dx, dy : 거리(절대값)
 */
function getAxisSnapCandidates(px, py, tol = state.snap.tol) {
  const anchors = collectSnapAnchors();
  let v = null; // { x, ax, ay, dx }
  let h = null; // { y, ax, ay, dy }

  for (const p of anchors) {
    const dx = Math.abs(px - p.x);
    const dy = Math.abs(py - p.y);

    // 수직 스냅 후보 갱신
    if (dx <= tol && (!v || dx < v.dx)) {
      v = { x: p.x, ax: p.x, ay: p.y, dx };
    }

    // 수평 스냅 후보 갱신
    if (dy <= tol && (!h || dy < h.dy)) {
      h = { y: p.y, ax: p.x, ay: p.y, dy };
    }
  }
  return { v, h };
}


/**
 * SVG overlay 위에 스냅 가이드 라인/점 그리기
 * - state.snap.cand에 저장된 v/h 후보를 사용해서
 *   빨간 점선(가로/세로)과 스냅 포인트 점을 표시.
 *
 * @param {SVGSVGElement} svg - overlay 루트 SVG 요소
 */
function drawSnapGuides(svg) {
  // 기존 가이드 제거
  const old = svg.querySelector("#snap-guides");
  if (old) old.remove();

  const { v, h } = state.snap.cand || {};
  if (!v && !h) return;

  // 새 그룹 생성
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", "snap-guides");
  g.setAttribute("pointer-events", "none");

  // SVG 전체 크기 계산
  const { width: W, height: H } = getCurrentImageSize();

  // 공통 스타일의 line 생성 헬퍼
  const mkLine = () => {
    const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ln.setAttribute("stroke", "#FF3B30"); // 보기 쉬운 빨강
    ln.setAttribute(
      "stroke-width",
      String(state.overlayStyle?.guideStroke ?? 1.5)
    );
    ln.setAttribute("stroke-dasharray", "6 6");
    ln.setAttribute("pointer-events", "none");
    return ln;
  };

  // 수직 스냅 라인
  if (v) {
    const ln = mkLine();
    ln.setAttribute("x1", v.x);
    ln.setAttribute("y1", 0);
    ln.setAttribute("x2", v.x);
    ln.setAttribute("y2", H);
    g.appendChild(ln);
  }

  // 수평 스냅 라인
  if (h) {
    const ln = mkLine();
    ln.setAttribute("x1", 0);
    ln.setAttribute("y1", h.y);
    ln.setAttribute("x2", W);
    ln.setAttribute("y2", h.y);
    g.appendChild(ln);
  }

  // 스냅 교차점 표시용 점(circle)
  const mkDot = (cx, cy) => {
    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", cy);
    dot.setAttribute("r", String(state.overlayStyle?.snapDotRadius ?? 3));
    dot.setAttribute("fill", "#FF3B30");
    dot.setAttribute("pointer-events", "none");
    return dot;
  };

  if (v && h) {
    // v, h 둘 다 있을 때는 교차점에 점 하나
    g.appendChild(mkDot(v.x, h.y));
  } else if (v) {
    // 수직만 있을 때는 y는 마우스/앵커 기반으로 결정
    const cy = v.ay != null ? v.ay : state.mouse?.y ?? 0;
    g.appendChild(mkDot(v.x, cy));
  } else if (h) {
    // 수평만 있을 때는 x는 마우스/앵커 기반
    const cx = h.ax != null ? h.ax : state.mouse?.x ?? 0;
    g.appendChild(mkDot(cx, h.y));
  }

  svg.appendChild(g);
}


// ---------------------------------------------------------------------------
// 전역 이벤트: 휠, 키보드 단축키, 페이지 이탈 시 경고
// ---------------------------------------------------------------------------

// 브라우저 기본 Ctrl+휠 줌 막기 (특히 크롬 전체 페이지 줌)
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);

/**
 * 키보드 단축키 처리
 * - Ctrl+Z / Cmd+Z         : Undo
 * - Ctrl+Shift+Z / Ctrl+Y  : Redo
 * - Delete / Backspace     : 선택 항목 삭제
 * - Shift                  : 스냅 / 보조기능 플래그
 * - Alt                    : 보조 플래그
 * - Ctrl + (+/- 등)        : 브라우저 줌 막기
 */
window.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  const isEditable = tag === "input" || tag === "textarea";

  // input / textarea 에서는 기본 동작 유지 (커서 이동, 텍스트 삭제 등)
  if (isEditable) {
    // 단, Ctrl+Z / Y 는 막고 에디터 전역 Undo/Redo로 돌리고 싶다면
    // 여기서 예외 처리할 수도 있음
  }

  // Ctrl+Z (또는 Cmd+Z) → Undo
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    undo();
    return;
  }

  // Ctrl+Y or Ctrl+Shift+Z → Redo
  if (
    (e.ctrlKey || e.metaKey) &&
    ((e.shiftKey && (e.key === "z" || e.key === "Z")) ||
      e.key.toLowerCase() === "y")
  ) {
    e.preventDefault();
    redo();
    return;
  }

  if (e.code === "Space") spaceHeld = true;
  if (e.key === "Shift") state.keys.shift = true;

  if (e.key === "Alt") {
    state.keys.alt = true;
    // ALT 눌르는 순간 스냅 가이드/점선 싹 지우기
    state.snap.cand = { v: null, h: null };
    state.snapGuide = null;
    redrawOverlay();
  }

  // Delete / Backspace → 선택된 요소 삭제
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    !e.ctrlKey &&
    !e.metaKey
  ) {
    if (isEditable) return; // 텍스트 삭제는 그대로 두기
    e.preventDefault();
    deleteCurrentSelection();
  }

  // Ctrl + = / + / - / _ → 브라우저 줌 방지
  if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "_"].includes(e.key)) {
    e.preventDefault();
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey && !isEditable) {
    const mappedTool = TOOL_KEY_MAP[e.key];
    if (mappedTool) {
      e.preventDefault();
      setTool(mappedTool);
      return;
    }
  }

  if (state.tool !== "polygon") return;
  if (e.key === "Enter" && state.polygonDraft) {
    finalizePolygon();
  } else if (e.key === "Escape" && state.polygonDraft) {
    state.polygonDraft = null;
    redrawOverlay();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
  if (e.key === "Shift") {
    state.keys.shift = false;
    state.snapGuide = null;
    redrawOverlay();
  }
  if (e.key === "Alt") {
    state.keys.alt = false;
  }
});

// 창 포커스가 다른 탭/앱으로 넘어갔다가 돌아올 때
window.addEventListener("blur", () => {
  state.keys.shift = false;
  state.keys.alt = false;
  spaceHeld = false;
  state.snap.cand = { v: null, h: null };
  state.snapGuide = null;
  redrawOverlay();
});

/**
 * 창을 닫기 전에 "저장 안 된 변경사항"이 있으면 경고창 표시
 * - state.loaded: 프로젝트가 실제로 열려 있는지
 * - hasUnsavedChanges(): 저장 스냅샷과 현재 상태 비교
 */
window.addEventListener("beforeunload", (e) => {
  if (!state.loaded) return;
  if (!hasUnsavedChanges()) return;
  e.preventDefault();
  e.returnValue = ""; // 크롬 등에서 기본 경고창 띄우는 트리거
});



// ---------------------------------------------------------------------------
// 캔버스 줌/팬 (마우스 휠 + 드래그)
// ---------------------------------------------------------------------------

/**
 * 캔버스에서의 휠 줌
 * - 마우스 위치를 기준으로 확대/축소
 * - state.view.scale / tx / ty를 조정한 뒤 applyViewTransform 호출
 */
els.canvas.addEventListener(
  "wheel",
  (e) => {
    // 스크롤 페이지 이동 방지
    e.preventDefault();
    const prevScale = Number(state.view?.scale) || 1;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12; // 줌 스텝
    const minScale = 0.2;
    const maxScale = 8;
    const nextScale = Math.min(
      maxScale,
      Math.max(minScale, prevScale * factor)
    );
    const rectStage = els.stage.getBoundingClientRect();
    const relX = rectStage.width ? (e.clientX - rectStage.left) / rectStage.width : 0.5;
    const relY = rectStage.height ? (e.clientY - rectStage.top) / rectStage.height : 0.5;
    const size = getCurrentImageSize();
    const prevViewWidth = size.width / prevScale;
    const prevViewHeight = size.height / prevScale;
    const worldX = (Number(state.view?.tx) || 0) + relX * prevViewWidth;
    const worldY = (Number(state.view?.ty) || 0) + relY * prevViewHeight;
    const nextViewWidth = size.width / nextScale;
    const nextViewHeight = size.height / nextScale;

    state.view.scale = nextScale;
    state.view.tx = worldX - relX * nextViewWidth;
    state.view.ty = worldY - relY * nextViewHeight;

    applyViewTransform();
    redrawOverlay();
  },
  { passive: false }
);

// 팬(이동) 상태 플래그
let isPanning = false;
// 드래그 시작 시점
let panStart = { x: 0, y: 0 };
// 드래그 시작 시점의 view tx/ty
let viewStart = { tx: 0, ty: 0 };

/**
 * 캔버스 마우스 다운
 * - 중간 버튼 or 스페이스+드래그로 화면 이동
 * - 그 외에는 툴별 클릭 동작 (노드 생성/선택 등)으로 넘긴다.
 */
els.canvas.addEventListener("mousedown", (e) => {
  // 스페이스바를 누르고 드래그하면 화면 이동
  if (
    !e.button &&
    e.shiftKey === false &&
    e.altKey === false &&
    e.ctrlKey === false &&
    e.metaKey === false
  ) {
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

els.canvas.addEventListener("pointerdown", (e) => {
  if (spaceHeld || e.button === 1) {
    // 스페이스 or 휠버튼
    e.preventDefault();
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    viewStart = { tx: Number(state.view.tx) || 0, ty: Number(state.view.ty) || 0 };
    els.canvas.setPointerCapture(e.pointerId);
  }
});

els.canvas.addEventListener("pointermove", (e) => {
  if (!isPanning) return;

  // 팬 중이면 마우스 이동량만큼 view.tx/ty 이동
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  const rectStage = els.stage.getBoundingClientRect();
  const size = getCurrentImageSize();
  const scale = Math.max(0.1, Number(state.view?.scale) || 1);
  const viewWidth = size.width / scale;
  const pxToWorld = rectStage.width ? viewWidth / rectStage.width : 1;
  state.view.tx = viewStart.tx - dx * pxToWorld * PAN_SPEED;
  state.view.ty = viewStart.ty - dy * pxToWorld * PAN_SPEED;
  applyViewTransform();
});
els.canvas.addEventListener("pointerup", (e) => {
  if (isPanning) {
    isPanning = false;
    els.canvas.releasePointerCapture(e.pointerId);
  }
});

/**
 * clientX/clientY(화면 좌표)를
 * "배경 이미지 좌표계"로 변환해 주는 헬퍼
 * - 캔버스의 boundingClientRect
 * - state.view.scale / tx / ty 를 고려해서 역변환
 */
function imagePointFromClient(ev) {
  const size = getCurrentImageSize();
  const svg = els.overlay;
  if (svg && typeof svg.createSVGPoint === "function") {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const inv = ctm.inverse();
      const svgPoint = pt.matrixTransform(inv);
      return {
        x: svgPoint.x,
        y: svgPoint.y,
        rect: { left: 0, top: 0, width: size.width, height: size.height },
      };
    }
  }

  const rect = svg
    ? svg.getBoundingClientRect()
    : els.stage.getBoundingClientRect();
  const relX = rect.width ? (ev.clientX - rect.left) / rect.width : 0;
  const relY = rect.height ? (ev.clientY - rect.top) / rect.height : 0;
  const scale = Math.max(0.1, Number(state.view?.scale) || 1);
  const viewWidth = size.width / scale;
  const viewHeight = size.height / scale;
  const x = (Number(state.view?.tx) || 0) + relX * viewWidth;
  const y = (Number(state.view?.ty) || 0) + relY * viewHeight;
  return {
    x,
    y,
    rect: { left: 0, top: 0, width: size.width, height: size.height },
  };
}



// ---------------------------------------------------------------------------
// SVG overlay 전체 그리기 (노드/링크/폴리곤 등)
// ---------------------------------------------------------------------------

/**
 * overlay SVG 전체 그리는 함수
 *
 * 그리는 순서:
 *  1) SVG 크기/좌표계 설정 (배경 이미지 크기에 맞춤)
 *  2) 현재 층의 폴리곤들 (채움 + 라벨)
 *  3) 폴리곤 도구 사용 시, 드래프트(미완성) 폴리곤 프리뷰
 *  4) 현재 층의 링크들 (히트라인 + 실제 라인)
 *  5) 현재 층의 노드들 (도구/선택 상태에 따라 서로 다른 스타일)
 *  6) 링크 도구 사용 시, from 노드에서 마우스 위치까지의 프리뷰 선
 *  7) 스냅 가이드 라인/점 (drawSnapGuides 호출)
 *  8) 우측 통계(현재 층 / 전체 노드·링크·폴리곤 수) 갱신 + 레이어 패널 업데이트
 */
function redrawOverlay() {
  const svg = els.overlay;

  // -------------------------------------------------------------------------
  // 1) 배경 이미지 크기에 맞춰 overlay SVG 기본 속성 조정
  // -------------------------------------------------------------------------  
  const size = getCurrentImageSize();
  const natW = size.width || 1;
  const natH = size.height || 1;
  const scale = Math.max(0.1, Number(state.view?.scale) || 1);
  const viewWidth = natW / scale;
  const viewHeight = natH / scale;
  const tx = Number(state.view?.tx) || 0;
  const ty = Number(state.view?.ty) || 0;
  const overlayStyle = computeOverlayStyleBySize(size, scale);
  applyOverlayStyle(overlayStyle);
  const style = state.overlayStyle || overlayStyle;

  // overlay SVG 자체의 표시 크기는 stage 전체를 채우도록 한다
  svg.style.width = "100%";
  svg.style.height = "100%";

  // viewBox는 SVG 내부 좌표계를 설정한다.
  // 배경 이미지의 크기와 정확히 일치하도록 세팅.  
  svg.setAttribute("viewBox", `${tx} ${ty} ${viewWidth} ${viewHeight}`);
  svg.setAttribute("width", natW);
  svg.setAttribute("height", natH);

  // 기존에 그려져 있던 모든 요소 제거 (완전 리셋)
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const floor = currentFloor();

  // -------------------------------------------------------------------------
  // 2) 폴리곤 렌더링 (현재 층만)
  // -------------------------------------------------------------------------
  const currentFloorPolygons = (state.graph.polygons || []).filter(
    (p) => Number(p.floor ?? 0) === Number(state.currentFloor)
  );

  for (const p of currentFloorPolygons) {
    if (Number(p.floor ?? 0) !== floor) continue;
    if (isElementHidden("polygon", p.id)) continue;

    // 1) 이 폴리곤이 참조하는 노드들 가져오기
    //    - p.nodes 는 노드 id 배열
    //    - 각 id로 실제 노드 객체를 찾아온 뒤, null은 제거
    const nodesForPoly = (p.nodes || [])
      .map((nid) => getNodeById(nid))
      .filter(Boolean); // null 제거

    // 노드가 3개 미만이면 폴리곤을 그릴 수 없다.
    if (nodesForPoly.length < 3) continue;

    // 2) SVG polygon의 points 속성 문자열 만들기: "x1,y1 x2,y2 ..."
    const pointsAttr = nodesForPoly.map((pt) => `${pt.x},${pt.y}`).join(" ");

    // 채움용 polygon 엘리먼트 생성
    const group = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g"
    );
    const poly = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon"
    );
    poly.setAttribute("points", pointsAttr);
    poly.setAttribute("class", "poly-fill");
    poly.setAttribute("stroke-width", String(style.polyStroke || 2));

    // 현재 선택된 폴리곤이면 CSS로 하이라이트
    if (state.selection?.type === "polygon" && state.selection.id === p.id) {
      poly.classList.add("selected");
      poly.setAttribute("stroke-width", String(style.polySelectedStroke || 2));
    }

    const hit = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polygon"
    );
    hit.setAttribute("points", pointsAttr);
    hit.setAttribute("class", "poly-hit");
    hit.addEventListener(
      "pointerdown",
      (e) => {
        if (state.tool !== "select") return;
        e.preventDefault();
        e.stopPropagation();
        selectPolygon(p.id);
      },
      { passive: false }
    );

    // 3) 폴리곤 라벨 위치 (모든 꼭짓점의 중심점)
    const cx =
      nodesForPoly.reduce((sum, n) => sum + n.x, 0) / nodesForPoly.length;
    const cy =
      nodesForPoly.reduce((sum, n) => sum + n.y, 0) / nodesForPoly.length;

    const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lbl.setAttribute("x", cx);
    lbl.setAttribute("y", cy);
    lbl.setAttribute("class", "label");

    // 이름이 있으면 이름, 없으면 "PG_시퀀스" 형태
    lbl.textContent = p.name || `PG_${p.pseq}`;
    group.appendChild(poly);
    group.appendChild(hit);
    group.appendChild(lbl);
    svg.appendChild(group);
  }

  // -------------------------------------------------------------------------
  // 3) 폴리곤 도구 사용 시: 드래프트(미완성) 폴리곤 프리뷰
  // -------------------------------------------------------------------------
  if (state.tool === "polygon" && state.polygonDraft) {
    const floor = Number(state.polygonDraft.floor ?? currentFloor());

    // 1) 이미 확정된 정점 노드들의 좌표
    const fixedPts = (state.polygonDraft.nodes || [])
      .map((nid) => getNodeById(nid))
      .filter((n) => n && Number(n.floor ?? 0) === floor)
      .map((n) => ({ x: n.x, y: n.y }));

    // 2) 마우스 현재 위치를 마지막 점으로 붙여서 "가상 선" 미리보기
    const pts = [...fixedPts];
    if (state.mouse) {
      pts.push({ x: state.mouse.x, y: state.mouse.y });
    }

    if (pts.length >= 2) {
      // 선(PolyLine)으로 연결해서 폴리곤 윤곽 프리뷰
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline"
      );
      path.setAttribute("points", pts.map((pt) => `${pt.x},${pt.y}`).join(" "));
      path.setAttribute("class", "poly-preview");
      path.setAttribute("stroke-width", String(style.previewStroke || 2));
      svg.appendChild(path);

      // 이미 찍힌 정점 위치에 작은 점(circle)들도 같이 그림
      for (const pt of fixedPts) {
        const c = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        c.setAttribute("cx", pt.x);
        c.setAttribute("cy", pt.y);
        c.setAttribute("r", String(style.polyVertexRadius || 3));
        c.setAttribute("class", "poly-vertex");
        svg.appendChild(c);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4) 링크 렌더링 (현재 층만)
  //   - 실제 보이는 선(vis) + 클릭 히트영역(hit)을 분리해서 그린다.
  // -------------------------------------------------------------------------
  const currentFloorLinks = linksOnFloor(floor);
  for (const lk of currentFloorLinks) {
    if (isElementHidden("link", lk.id)) continue;
    const a = state.graph.nodes.find((n) => n.id === lk.a);
    const b = state.graph.nodes.find((n) => n.id === lk.b);
    if (!a || !b) continue;

    // 그룹 g 안에
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    // ① 굵은 투명 히트라인 (클릭 잘 되게)
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");

    hit.classList.add("link-hit");
    hit.setAttribute("x1", a.x);
    hit.setAttribute("y1", a.y);
    hit.setAttribute("x2", b.x);
    hit.setAttribute("y2", b.y);
    hit.setAttribute("pointer-events", "stroke");
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", "14");
    hit.dataset.id = lk.id;

    // 링크 선택 클릭 이벤트 (select 도구일 때만 동작)
    hit.addEventListener(
      "pointerdown",
      (e) => {
        if (state.tool !== "select") return;
        e.preventDefault();
        e.stopPropagation();
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
    vis.setAttribute("stroke-width", String(style.linkStroke || 2));
    vis.dataset.id = lk.id;

    // 현재 선택된 링크면 CSS로 하이라이트
    if (state.selection?.type === "link" && state.selection.id === lk.id) {
      vis.classList.add("selected");
      vis.setAttribute("stroke-width", String(style.linkSelectedStroke || 3));
    }

    g.appendChild(hit);
    g.appendChild(vis);
    svg.appendChild(g);
  }

  // -------------------------------------------------------------------------
  // 5) 노드 렌더링 (현재 층만)
  //   - 선택/도구 상태에 따라 스타일 다르게 적용
  // -------------------------------------------------------------------------
  const currentFloorNodes = nodesOnFloor(floor);
  for (const n of currentFloorNodes) {
    if (isElementHidden("node", n.id)) continue;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", n.x);
    c.setAttribute("cy", n.y);
    c.setAttribute("r", String(style.nodeRadius || 5));

    // (1) 선택 도구에서 선택된 노드인지
    const isSelectedNode =
      state.tool === "select" &&
      state.selection?.type === "node" && 
      state.selection.id === n.id;

    // (2) 링크 도구에서 "from" 으로 찍힌 노드인지
    const isLinkPending = state.tool === "link" && pendingLinkFrom === n.id;

    // (3) 폴리곤 도구에서 이미 정점으로 포함된 노드인지
    const isPolyVertex =
      state.tool === "polygon" &&
      state.polygonDraft &&
      Array.isArray(state.polygonDraft.nodes) &&
      state.polygonDraft.nodes.includes(n.id);

    // (4) 나침반 도구에서 임시 선택된 A/B 노드인지
    const isCompassPicked =
      state.tool === "compass" &&
      state.compass &&
      (state.compass.tempA === n.id || state.compass.tempB === n.id);

    // ---------- 클래스 적용 ----------
    c.classList.add("node-dot");

    let nodeRadius = style.nodeRadius || 5;
    let strokeWidthOverride = null;

    // (1) 일반 선택 노드: 기존 빨간 테두리
    if (isSelectedNode) {
      c.classList.add("selected");
      nodeRadius = style.nodeSelectedRadius || nodeRadius + 2;
      strokeWidthOverride = style.nodeSelectedStroke || 2;
    }
    // (2) 폴리곤 정점으로 포함된 노드: 파란 점 + 빨간 외곽선 느낌
    else if (isPolyVertex) {
      c.classList.add("poly-vertex-active"); // ← css 에서 stroke 빨간색
      strokeWidthOverride = style.nodePolyStroke || 2.5;
    }

    // (3) 링크 from / 나침반 선택 노드는 보조 하이라이트
    if (isLinkPending || isCompassPicked) {
      c.classList.add("selected-node");
      nodeRadius = Math.max(nodeRadius, style.nodeSelectedRadius || nodeRadius);
      strokeWidthOverride = Math.max(
        strokeWidthOverride ?? 0,
        style.nodeHighlightStroke || 3
      );
    }

    c.setAttribute("r", String(nodeRadius));
    if (strokeWidthOverride != null) {
      c.setAttribute("stroke-width", String(strokeWidthOverride));
    } else {
      c.removeAttribute("stroke-width");
    }

    c.dataset.id = n.id;

    // 클릭 시: 도구에 따라 다른 동작
    c.addEventListener("click", (e) => {
      if (state.tool === "select") {
        // 선택 도구: 노드 선택
        e.stopPropagation();
        selectNode(n.id);
      } else if (state.tool === "link") {
        // 링크 도구: 링크 from/to 지정
        e.stopPropagation();
        handleLinkPick(n.id);
      } else if (state.tool === "polygon") {
        // 폴리곤 도구: 정점 추가
        e.stopPropagation();
        addVertexToPolygonDraft(n.id);
      } else if (state.tool === "compass") {
        // 나침반(방위) 도구: A,B 노드 선택
        e.stopPropagation();

        if (!state.compass) state.compass = { tempA: null, tempB: null };

        // first selection (tempA 채우기)
        if (!state.compass.tempA) {
          state.compass.tempA = n.id;

          if (els.compassFrom) els.compassFrom.value = n.id; // 패널 From 반영
          if (els.compassTo && !els.compassTo.value) els.compassTo.value = ""; // 두 번째는 비워두기

          if (els.status)
            els.status.textContent = `나침반: 첫 노드 선택 → ${n.name || n.id}`;

          redrawOverlay?.();
          return;
        }

        // second selection (tempB 채우기), 단 A와 다른 노드여야 함
        if (!state.compass.tempB && n.id !== state.compass.tempA) {
          state.compass.tempB = n.id;

          if (els.compassTo) els.compassTo.value = n.id; // 패널 To 반영

          const A = state.graph.nodes.find((x) => x.id === state.compass.tempA);
          const B = state.graph.nodes.find((x) => x.id === state.compass.tempB);

          if (A && B) {
            // 여기서 실제 방위각(나침반 각도)을 계산할 수도 있음
            // 지금은 기본값 0 또는 입력된 값 사용
            let az = 0;

            // 패널에 값이 없으면 기본 0, 있으면 그 값을 파싱
            if (els.compassAz && !els.compassAz.value) {
              els.compassAz.value = String(az);
            } else if (els.compassAz) {
              const parsed = parseFloat(els.compassAz.value);
              if (!Number.isNaN(parsed)) az = parsed;
            }

            state.northRef = {
              from_node: A.id,
              to_node: B.id,
              azimuth: +az.toFixed(1),
            };

            if (els.compassInfo) {
              const fromLabel = nodeLabel ? nodeLabel(A) : A.id;
              const toLabel = nodeLabel ? nodeLabel(B) : B.id;
              els.compassInfo.textContent = `설정됨: ${fromLabel} → ${toLabel}, ${state.northRef.azimuth}°`;
            }

            if (els.projState) {
              els.projState.textContent = "상태: 수정됨";
              els.projState.style.color = "#e67e22";
            }
          }

          // 한 번 설정이 끝나면 다음 측정을 위해 A/B 초기화
          state.compass.tempA = null;
          state.compass.tempB = null;
          redrawOverlay?.();
        }
      }
    });
    
    // 노드 드래그 이동 (select 도구일 때만)
    c.addEventListener("pointerdown", (e) => {
      if (state.tool !== "select") return;
      e.stopPropagation();
      e.preventDefault();

      selectNode(n.id);

      // 드래그 시작 시점의 이미지 좌표와 노드 좌표 저장
      const { x, y } = imagePointFromClient(e);
      draggingNodeId = n.id;
      dragStart = { x, y };
      nodeStart = { x: n.x, y: n.y };
      els.overlay.setPointerCapture(e.pointerId);
    });

    svg.appendChild(c);
  }

  // -------------------------------------------------------------------------
  // 6) 링크 도구 프리뷰: from 노드에서 마우스까지 실시간 가이드 선
  // -------------------------------------------------------------------------
  if (state.tool === "link" && pendingLinkFrom) {
    const startNode = state.graph.nodes.find((n) => n.id === pendingLinkFrom);
    if (startNode) {
      let px = state.mouse.x;
      let py = state.mouse.y;
      let orient = null;

      if (state.keys.shift && !state.keys.alt) {
        const dx = Math.abs(px - startNode.x);
        const dy = Math.abs(py - startNode.y);
        orient = dx >= dy ? "h" : "v";
        if (orient === "h") py = startNode.y;
        else px = startNode.x;
        // 스냅 가이드 정보 기억 (anchor: 시작 노드)
        state.snapGuide = {
          anchor: { x: startNode.x, y: startNode.y },
          orient,
        };
      } else {
        state.snapGuide = null;
      }

      // 실제 프리뷰 라인
      const pl = document.createElementNS("http://www.w3.org/2000/svg", "line");
      pl.setAttribute("x1", startNode.x);
      pl.setAttribute("y1", startNode.y);
      pl.setAttribute("x2", px);
      pl.setAttribute("y2", py);
      pl.classList.add("preview-line");
      pl.setAttribute("stroke-width", String(style.previewStroke || 2));
      svg.appendChild(pl);
    }
  }


  // -------------------------------------------------------------------------
  // 7) 스냅 가이드 (십자선/점) 렌더링
  //    - drawSnapGuides 내부에서 state.snap.cand를 보고 그림
  // -------------------------------------------------------------------------  
  drawSnapGuides(els.overlay);

  // -------------------------------------------------------------------------
  // 8) 우측 통계 / 레이어 패널 갱신
  // -------------------------------------------------------------------------
  // 현재 층 정보
  els.layerInfo.innerHTML = `🔵 노드: ${currentFloorNodes.length}<br/>🔗 링크: ${currentFloorLinks.length}<br/>⬛ 폴리곤: ${currentFloorPolygons.length}`;
  // 전체 층 합산 정보
  els.totalInfo.innerHTML = `🔵 노드: ${state.graph.nodes.length}<br/>🔗 링크: ${state.graph.links.length}<br/>⬛ 폴리곤: ${state.graph.polygons.length}`;

  // 우측 레이어 패널(리스트)도 함께 갱신
  updateLayersPanel();
}

window.addEventListener("resize", () => {
  updateStageDisplaySize();
  applyViewTransform();
  redrawOverlay();
});



/**
 * 뷰 트랜스폼(줌/팬)을 stage에 적용
 * - CSS transform으로 translate / scale
 * - 상단 확대 비율 라벨도 함께 갱신
 */
function applyViewTransform() {
  const size = getCurrentImageSize();
  const minScale = 0.1;
  const scale = Math.max(minScale, Number(state.view?.scale) || 1);
  const viewWidth = size.width / scale;
  const viewHeight = size.height / scale;
  let nextTx = Number.isFinite(state.view?.tx) ? Number(state.view.tx) : 0;
  let nextTy = Number.isFinite(state.view?.ty) ? Number(state.view.ty) : 0;
  state.view.tx = nextTx;
  state.view.ty = nextTy;
  if (els.overlay) {
    els.overlay.setAttribute(
      "viewBox",
      `${state.view.tx} ${state.view.ty} ${viewWidth} ${viewHeight}`
    );
    els.overlay.setAttribute("width", size.width);
    els.overlay.setAttribute("height", size.height);
  }
  if (els.stage) {
    els.stage.setAttribute(
      "viewBox",
      `${state.view.tx} ${state.view.ty} ${viewWidth} ${viewHeight}`
    );
  }

  const z = Math.round(scale * 100);
  document.getElementById("zoomLbl")?.replaceChildren(`🔍 ${z}%`);
}

/**
 * updateLayersPanel()
 * ---------------------------------------------------------------------------
 * 우측 레이어 패널을 갱신하는 함수.
 *
 * 패널 구성:
 *   1) 현재 층의 객체 개수 표시 (노드 / 링크 / 폴리곤)
 *   2) 전체 프로젝트 기준 총 개수 표시
 *   3) 현재 층의 요소들을 리스트 형태로 출력
 *      - 노드    : 🔵 N_label
 *      - 링크    : 🟢 A → B
 *      - 폴리곤  : 🟥 name
 *
 * 리스트 항목 클릭 시 선택(selectNode / selectLink / selectPolygon)
 * ---------------------------------------------------------------------------
 */
function updateLayersPanel() {
  const f = currentFloor(); // 현재 층 번호

  // 전체 데이터
  const allNodes = state.graph?.nodes || [];
  const allLinks = state.graph?.links || [];
  const allPolys = state.graph?.polygons || [];

  // 현재 층 데이터
  const nodesF = nodesOnFloor(f);
  const linksF = linksOnFloor(f);
  const polysF = polysOnFloor
    ? polysOnFloor(f)
    : (state.graph?.polygons || []).filter(
        (p) => Number(p.floor ?? 0) === Number(f)
      );


  // -------------------------------------------------------------------------
  // 1) 우측 상단 통계 영역(현재 층 / 전체)
  // -------------------------------------------------------------------------
  if (els.infoCurrentNodes)
    els.infoCurrentNodes.textContent = String(nodesF.length);
  if (els.infoCurrentLinks)
    els.infoCurrentLinks.textContent = String(linksF.length);
  if (els.infoAllNodes) 
    els.infoAllNodes.textContent = String(allNodes.length);
  
  // 전체 합산
  if (els.infoAllLinks) 
    els.infoAllLinks.textContent = String(allLinks.length);
  if (els.infoCurrentPolys)
    els.infoCurrentPolys.textContent = String(polysF.length);
  if (els.infoAllPolys) 
    els.infoAllPolys.textContent = String(allPolys.length);

  // 리스트 컨테이너
  const box = els.layersList || document.getElementById("layersList");
  if (!box) return;
  box.innerHTML = "";

  function createLayerEye(type, id, li) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "layer-eye";
    const hidden = isElementHidden(type, id);
    btn.textContent = hidden ? "🙈" : "👁";
    btn.title = hidden ? "보이기" : "숨기기";
    if (li) li.classList.toggle("is-hidden", hidden);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = !isElementHidden(type, id);
      setElementHidden(type, id, next);
    });
    return btn;
  }

  function activateItem(li) {
    box
      .querySelectorAll(".layer-item.active")
      .forEach((el) => el.classList.remove("active"));
    li.classList.add("active");
  }

  // -------------------------------------------------------------------------
  // (A) 현재 노드 리스트
  // -------------------------------------------------------------------------
  for (const n of nodesF) {
    const li = document.createElement("div");
    li.className = "layer-item node";
    li.dataset.type = "node";
    li.dataset.id = n.id;

    // 왼쪽 아이콘 + 라벨
    const left = document.createElement("div");
    left.className = "layer-left";
    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `🔵 ${nodeLabel(n)}`;
    left.append(dot, label);

    // 클릭하면 기존 selectNode 호출 → 오른쪽 속성 패널 갱신
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof setTool === "function" && state.tool !== "select")
        setTool("select");
      if (typeof selectNode === "function") selectNode(n.id);
      activateItem(li);
    });

    // 오른쪽 좌표
    const right = document.createElement("div");
    right.className = "layer-right";
    right.textContent = `(${Math.round(n.x)}, ${Math.round(n.y)})`;

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.appendChild(createLayerEye("node", n.id, li));
    meta.appendChild(right);

    li.appendChild(left);
    li.appendChild(meta);
    box.appendChild(li);
  }

  // -------------------------------------------------------------------------
  // (B) 현재 링크 리스트
  // -------------------------------------------------------------------------
  for (const l of linksF) {
    const li = document.createElement("div");
    li.className = "layer-item link";
    li.dataset.type = "link";
    li.dataset.id = l.id;

    const left = document.createElement("div");
    left.className = "layer-left";
    const icon = document.createElement("span");
    icon.className = "icon-link";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `🔗 ${linkLabel(l)}`;
    left.append(icon, label);

    // 클릭하면 기존 selectLink 호출 → 속성 패널 갱신
    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof setTool === "function" && state.tool !== "select")
        setTool("select");
      if (typeof selectLink === "function") selectLink(l.id);
      activateItem(li);
    });

    const right = document.createElement("div");
    right.className = "layer-right mono small";
    right.textContent = linkEndpointsLabel(l, nodesF);

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.appendChild(createLayerEye("link", l.id, li));
    meta.appendChild(right);

    li.appendChild(left);
    li.appendChild(meta);
    box.appendChild(li);
  }

  // -------------------------------------------------------------------------
  // (C) 현재 폴리곤 리스트
  // -------------------------------------------------------------------------
  for (const p of polysF) {
    const li = document.createElement("div");
    li.className = "layer-item polygon";
    li.dataset.type = "polygon";
    li.dataset.id = p.id;

    const left = document.createElement("div");
    left.className = "layer-left";
    const icon = document.createElement("span");
    icon.className = "icon-poly";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = `⬛ ${p.name || `PG_${p.pseq ?? ""}`}`;
    left.append(icon, label);

    li.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof setTool === "function" && state.tool !== "select")
        setTool("select");
      if (typeof selectPolygon === "function") selectPolygon(p.id);
      activateItem(li);
    });

    const right = document.createElement("div");
    right.className = "layer-right mono small";
    right.textContent = `${(p.nodes || []).length} pts`;

    const meta = document.createElement("div");
    meta.className = "layer-meta";
    meta.appendChild(createLayerEye("polygon", p.id, li));
    meta.appendChild(right);

    li.appendChild(left);
    li.appendChild(meta);
    box.appendChild(li);
  }

  // compass
  // if (state.northRef && (state.northRef.from_node || state.northRef.to_node)) {
  //   const li = document.createElement("div");
  //   li.className = "layer-item compass";
  //   li.dataset.type = "compass";
  //   li.dataset.id = "compass";

  //   const fromN = getNodeById(state.northRef.from_node);
  //   const toN = getNodeById(state.northRef.to_node);

  //   const left = document.createElement("div");
  //   left.className = "layer-left";
  //   left.innerHTML = `
  //     <span class="icon-compass">🧭</span>
  //     <span class="label">${fromN ? nodeLabel(fromN) : "?"} → ${
  //     toN ? nodeLabel(toN) : "?"
  //   }</span>
  //   `;

  //   li.addEventListener("click", (e) => {
  //     e.preventDefault();
  //     e.stopPropagation();
  //     if (typeof setTool === "function") setTool("compass");
  //     if (typeof selectCompass === "function") selectCompass();
  //     activateItem(li);
  //   });

  //   const right = document.createElement("div");
  //   right.className = "layer-right mono small";
  //   right.textContent = `${state.northRef.azimuth}°`;

  //   li.appendChild(left);
  //   li.appendChild(right);
  //   box.appendChild(li);
  // }

  if (state.selection) {
    const q = `.layer-item[data-type="${
      state.selection.type
    }"][data-id="${CSS.escape(String(state.selection.id))}"]`;
    const cur = box.querySelector(q);
    if (cur) cur.classList.add("active");
  }
}


` ********************************* TODO: 주석 추가 *************************** `

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

    const A = state.graph.nodes.find((x) => x.id === pendingLinkFrom);
    const B = state.graph.nodes.find((x) => x.id === nodeId);
    if (!A || !B) return;

    // 층 다르면 금지 (원하면 경고)
    if (Number(A.floor ?? 0) !== Number(B.floor ?? 0)) {
      els.status.textContent = "서로 다른 층의 노드는 연결할 수 없습니다.";
      pendingLinkFrom = null;
      redrawOverlay();
      return;
    }
    const f = Number(A.floor ?? 0);

    const newLink = {
      id: nextLinkId(), // 내부 고유 id(그대로 유지)
      floor: f, // ★ 노드 층과 일치
      lseq: nextLinkSeq(f), // ★ 층별 표기 번호
      a: A.id,
      b: B.id,
    };

    state.graph.links.push(newLink);
    pendingLinkFrom = null;
    pushHistory();
    selectLink(newLink.id);
    redrawOverlay();
  }
}

function fillNodeSelect(selectEl, floor, selectedId) {
  if (!selectEl) return;
  const list = nodesOnFloor(floor);
  const sel = String(selectedId ?? "");
  selectEl.innerHTML = "";
  for (const n of list) {
    const opt = document.createElement("option");
    opt.value = String(n.id); // 항상 문자열
    opt.textContent = nodeLabel(n); // 이름 없으면 N_{nseq}
    if (String(n.id) === sel) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function selectNode(id) {
  const n = getNodeById(id);

  if (currentFloor() !== Number(n.floor ?? 0)) {
    setFloor(Number(n.floor ?? 0));
  }
  state.selection = { type: "node", id: n.id };

  els.selLbl.textContent = `👆 선택: 노드 ${n.nseq}`;
  els.nodeGroup.style.display = "block";
  els.linkGroup.style.display = "none";
  els.polyGroup.style.display = "none";
  els.nodeId.value = `N_${n.nseq}`;
  els.nodeName.value = n.name || "";
  els.nodeX.value = Math.round(n.x);
  els.nodeY.value = Math.round(n.y);
  els.nodeType.value = n.type || "일반";
  redrawOverlay();
  if (typeof updateLayersPanel === "function") updateLayersPanel();
}

function selectLink(id) {
  const l = (state.graph?.links || []).find((x) => String(x.id) === String(id));

  state.selection = { type: "link", id };

  els.selLbl.textContent = `👆 선택: 링크 lk_${l?.lseq}`;
  els.nodeGroup.style.display = "none";
  els.linkGroup.style.display = "block";
  els.polyGroup.style.display = "none";
  els.linkId.value = `lk_${l.lseq}`;

  const floor = Number(l.floor ?? currentFloor());

  // 드롭다운: 반드시 링크의 층 노드만
  fillNodeSelect(els.linkFrom, floor, l.a);
  fillNodeSelect(els.linkTo, floor, l.b);

  els.linkFrom.onchange = () => {
    const newId = els.linkFrom.value;
    const node = getNodeById(newId);
    if (!node) return;
    if (Number(node.floor ?? floor) !== floor) {
      alert("현재 층에 없는 노드는 선택할 수 없습니다.");
      fillNodeSelect(els.linkFrom, floor, l.a); // 되돌리기
      return;
    }
    l.a = String(node.id);
    redrawOverlay();
    if (typeof updateLayersPanel === "function") updateLayersPanel();
  };
  els.linkTo.onchange = () => {
    const newId = els.linkTo.value;
    const node = getNodeById(newId);
    if (!node) return;
    if (Number(node.floor ?? floor) !== floor) {
      alert("현재 층에 없는 노드는 선택할 수 없습니다.");
      fillNodeSelect(els.linkTo, floor, l.b); // 되돌리기
      return;
    }
    l.b = String(node.id);
    redrawOverlay();
    if (typeof updateLayersPanel === "function") updateLayersPanel();
  };

  redrawOverlay();
  if (typeof updateLayersPanel === "function") updateLayersPanel();
}

function selectPolygon(id) {
  const p = (state.graph.polygons || []).find((x) => x.id === id);
  if (!p) return;
  p.nodes = normalizePolygonNodes(p.nodes || []);

  const f = Number(p.floor ?? 0);
  if (currentFloor() !== f) setFloor(f);

  state.selection = { type: "polygon", id: p.id };
  if (els.selLbl) els.selLbl.textContent = `👆 선택: 폴리곤 ${p.pseq ?? ""}`;

  // 우측 속성 패널 갱신
  refreshPolygonPanel(p);

  // 노드/링크 패널 숨기기
  if (els.nodeGroup) els.nodeGroup.style.display = "none";
  if (els.linkGroup) els.linkGroup.style.display = "none";

  redrawOverlay();
}

if (els.polyName) {
  els.polyName.addEventListener("input", () => {
    if (state.selection?.type !== "polygon") return;
    const p = (state.graph.polygons || []).find(
      (x) => x.id === state.selection.id
    );
    if (!p) return;
    p.name = els.polyName.value.trim();
    redrawOverlay();
  });
}

function deleteCurrentSelection() {
  const sel = state.selection;
  const g = state.graph;
  if (!sel || !g) return;

  const { type, id } = sel;

  if (type === "node") {
    const nodes = g.nodes || [];
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) return;

    const nodeId = nodes[idx].id;

    // 1) 노드 삭제
    nodes.splice(idx, 1);

    // 2) 이 노드를 참조하는 링크들 삭제
    g.links = (g.links || []).filter((l) => l.a !== nodeId && l.b !== nodeId);

    // 3) 폴리곤에서 이 노드를 포함하고 있으면 제거
    if (g.polygons) {
      g.polygons = g.polygons
        .map((p) => {
          const nodesArr = p.nodes || [];
          const newNodes = nodesArr.filter((nid) => nid !== nodeId);
          return { ...p, nodes: newNodes };
        })
        // 노드가 3개 미만이 되면 폴리곤 자체를 삭제
        .filter((p) => p.nodes && p.nodes.length >= 3);
    }
  } else if (type === "link") {
    g.links = (g.links || []).filter((l) => l.id !== id);
  } else if (type === "polygon") {
    g.polygons = (g.polygons || []).filter((p) => p.id !== id);
  }

  state.selection = null;

  redrawOverlay?.();
  updateLayersPanel?.();

  pushHistory();
}

function clearSelection() {
  state.selection = { type: null, id: null };
  els.selLbl.textContent = "👆 선택: 없음";
  els.nodeGroup.style.display = "none";
  els.linkGroup.style.display = "none";
  els.polyGroup.style.display = "none";
  clearPolygonPointRows();
  redrawOverlay();
}

// ------- Events -------
els.btnNew.addEventListener("click", openModal);
els.closeModal.addEventListener("click", closeModal);
els.floorCount.addEventListener("input", () => {
  buildFloorFileRows();
});

els.modalReset.addEventListener("click", () => {
  // els.mode.value = "monte";
  els.floorCount.value = 4;
  buildFloorFileRows(false);
});

// ✅ 모달 확인 → 새 프로젝트 생성 + DB 저장
els.modalOk.addEventListener("click", async () => {
  // 버튼 중복 클릭 방지
  els.modalOk.disabled = true;

  try {
    // 1) 폼 값 읽기 + 정리
    const floors = Math.max(
      1,
      Math.min(12, parseInt(els.floorCount.value || "1", 10))
    );
    const startFloor = 0;
    const scale = 0;
    const projectName = (els.projectName.value || "새 프로젝트").trim();
    const projectAuthor = (els.projectAuthor?.value || "").trim();
    const floorNames = readFloorNamesFromModal(floors);

    // 2) 포맷 payload (최소 필드)
    const payload = {
      meta: { projectName, projectAuthor, floorNames, bgOpacity: 1 },
      scale,
      nodes: {}, // 에디터 로직에 맞춰 객체 or 배열 사용
      connections: {},
      special_points: {},
      north_reference: null, // 북방위 기능 붙이면 {from_node,to_node,azimuth}
      images: Array.from({ length: floors }, () => null),
      startFloor,
      _editor: {
        floors,
        startFloor,
        currentFloor: startFloor,
        bgOpacity: 1,
        floorNames,
      },
    };

    // saved = { id, ...payload }
    const saved = await apiCreateProject(payload);

    // 4) 전역 상태/UI 반영
    state.projectId = saved.id; // DB id 보관 (이후 PUT에 사용)
    state.projectName = projectName;
    state.projectAuthor = projectAuthor;
    state.floors = floors;
    state.startFloor = startFloor;
    state.scale = scale;
    state.currentFloor = startFloor;
    state.floorNames = floorNames;
    resetImageState(floors);
    state.bgOpacity = 1;
    state.graph = { nodes: [], links: [], polygons: [] }; // 네 기존 편집 상태 초기화 유지
    state.seq.poly = state.seq?.poly || {};

    state.modified = false;
    resetCounters();

    // 헤더/상태표시
    els.projName.textContent = projectName;
    els.projAuthor.textContent = projectAuthor;
    els.projState.textContent = "상태: 저장됨";
    els.projState.style.color = "#27ae60";

    // 서버에 이밎 생성(POST /api/projects/)
    const inputs = document.querySelectorAll(".floor-file");
    await Promise.all(
      [...inputs].map((inp) => {
        const file = inp.files?.[0];
        if (!file) return Promise.resolve();
        const floor = Number(inp.dataset.floor) || 0; // ← 0-기반 인덱스
        // api.js 쪽의 apiUploadFloorImage를 사용 (절대 URL 보장)
        return apiUploadFloorImage({
          project: state.projectId,
          floor,
          file,
        }).then((json) => {
          if (!json?.url) return;
          const abs = normalizeImageUrl(json.url);
          const fileName = file?.name || state.imageLabels?.[floor] || "";
          setFloorImage(floor, abs, fileName, file);
        });
      })
    );

    // 3) 업로드한 URL 배열을 DB에 반영 (재오픈 시 그대로 뜨게)
    try {
      await apiUpdateProject(state.projectId, { images: state.images });
    } catch (e) {
      console.warn("images 업데이트 실패(무시 가능):", e);
    }

    // 5) 에디터 초기화 (네가 쓰는 함수명으로 대체 가능)
    populateFloorSelect?.();
    renderFloor?.();
    clearSelection?.();
    activateProject?.();
    closeModal?.();

    console.log("프로젝트 생성/저장 완료:", saved);
  } catch (err) {
    console.error("프로젝트 생성 실패:", err);
    alert("프로젝트 생성에 실패했습니다. 콘솔을 확인해 주세요.");
  } finally {
    els.modalOk.disabled = false;
  }
});

els.floorSelect.addEventListener("change", () => {
  const next = Number(els.floorSelect.value);
  setFloor(next);
});

els.btnLoadBg.addEventListener("click", () => {
  if (!state.loaded || !state.projectId) {
    alert("프로젝트를 먼저 불러오거나 저장해 주세요.");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const floor = currentFloor();
    const prevUrl = state.images?.[floor] || null;
    const prevLabel = state.imageLabels?.[floor] || "";
    const tempUrl = URL.createObjectURL(file);
    setFloorImage(floor, tempUrl, file.name, file);
    els.status.textContent = "배경 이미지 업로드 중...";
    try {
      const json = await apiUploadFloorImage({
        project: state.projectId,
        floor,
        file,
      });
      if (!json?.url) throw new Error("no url");
      const normalized = normalizeImageUrl(json.url);
      setFloorImage(floor, normalized, file.name, file);
      els.status.textContent = `${getFloorName(floor)} 이미지 업로드 완료`;
      showToast("배경 이미지가 저장되었습니다.");
    } catch (err) {
      console.error(err);
      alert("이미지 업로드에 실패했습니다. 콘솔을 확인해 주세요.");
      setFloorImage(floor, prevUrl, prevLabel);
      els.status.textContent = "배경 이미지 업로드 실패";
    }
  };
  input.click();
});

els.btnClearBg.addEventListener("click", async () => {
  const floor = currentFloor();
  if (!state.images?.[floor]) return;
  const prevUrl = state.images[floor];
  const prevLabel = state.imageLabels?.[floor] || "";
  setFloorImage(floor, null);
  els.status.textContent = `${getFloorName(floor)} 이미지가 제거되었습니다.`;
  if (state.projectId) {
    try {
      await apiUpdateProject(state.projectId, { images: state.images });
      els.status.textContent = `${getFloorName(
        floor
      )} 이미지 삭제가 서버에 반영되었습니다.`;
    } catch (err) {
      console.error("이미지 삭제 반영 실패", err);
      els.status.textContent = "이미지 삭제 반영 실패";
      setFloorImage(floor, prevUrl, prevLabel);
    }
  }
});

els.btnLock.addEventListener("click", () => {
  state.imageLocked = !state.imageLocked;
  els.btnLock.textContent = state.imageLocked
    ? "🔒 이미지 고정"
    : "🔓 이미지 고정 해제";
});

els.bgOpacity?.addEventListener("input", () => {
  const percent = parseInt(els.bgOpacity.value || "100", 10);
  updateBgOpacityControls(percent / 100);
  if (state.loaded) {
    state.modified = true;
    els.projState.textContent = "상태: 수정됨";
    els.projState.style.color = "#e67e22";
  }
});

els.btnRenameFloor?.addEventListener("click", () => {
  if (!state.loaded) return;
  const idx = currentFloor();
  const currentName = getFloorName(idx);
  const next = prompt("새 층 이름을 입력하세요.", currentName);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed) {
    alert("층 이름을 비워둘 수 없습니다.");
    return;
  }
  const names = sanitizeFloorNames(state.floorNames, state.floors);
  names[idx] = trimmed;
  state.floorNames = sanitizeFloorNames(names, state.floors);
  state.modified = true;
  if (els.projState) {
    els.projState.textContent = "상태: 수정됨";
    els.projState.style.color = "#e67e22";
  }
  populateFloorSelect();
  els.floorSelect.value = String(state.currentFloor);
  renderFloor();
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
buildFloorFileRows();

// 마우스 이동 시 현재 좌표 갱신 (링크 미리보기/드래그에서 사용)
els.overlay.addEventListener("pointermove", (ev) => {
  const pt = imagePointFromClient(ev);
  state.mouse = { x: pt.x, y: pt.y };

  // 노드 도구일 때 스냅 후보 업데이트
  if (state.tool === "node" && state.snap.active && !state.keys.alt) {
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
    if (state.keys.shift && !state.keys.alt) {
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
});

// node
els.overlay.addEventListener(
  "pointerdown",
  (ev) => {
    if (state.tool !== "node") return;
    if (ev.button !== 0) return;

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

    const f = currentFloor();
    const newNode = {
      id: nextNodeId(),
      name: "",
      x,
      y,
      floor: state.currentFloor,
      nseq: nextNodeSeq(f), // 층별 표기 번호
    };

    // 실제로 그래프가 바뀌기 직전에 스냅샷
    state.graph.nodes.push(newNode);
    const didSplit = maybeSplitLinkAtNode(newNode);

    pushHistory();

    selectNode(newNode.id);
    redrawOverlay();
    if (didSplit && els.status) {
      els.status.textContent = "노드가 링크를 분할했습니다.";
    }

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

    pushHistory();

    try {
      els.overlay.releasePointerCapture(ev.pointerId);
    } catch {}
  }
});

let lastNodeDownTs = 0;
let suppressNextClick = false;

function addVertexToPolygonDraft(nodeId) {
  const n = getNodeById(nodeId);
  if (!n) return;

  const f = Number(n.floor ?? currentFloor());

  if (!state.polygonDraft) {
    state.polygonDraft = { floor: f, nodes: [nodeId] };
  } else {
    // 다른 층 노드는 무시
    if (Number(state.polygonDraft.floor) !== f) return;
    const last = state.polygonDraft.nodes?.[state.polygonDraft.nodes.length - 1];
    if (last === nodeId) return;
    // 같은 노드를 여러 번 찍을지 여부는 정책에 따라
    state.polygonDraft.nodes.push(nodeId);
  }

  redrawOverlay();
}

function normalizePolygonNodes(nodes = []) {
  const cleaned = [];
  for (const nid of nodes) {
    if (!nid) continue;
    if (!cleaned.length || cleaned[cleaned.length - 1] !== nid) {
      cleaned.push(nid);
    }
  }
  if (
    cleaned.length > 2 &&
    cleaned[0] === cleaned[cleaned.length - 1]
  ) {
    cleaned.pop();
  }
  return cleaned;
}

function finalizePolygon() {
  const d = state.polygonDraft;
  if (!d || !Array.isArray(d.nodes) || d.nodes.length < 3) {
    state.polygonDraft = null;
    redrawOverlay();
    return;
  }

  const f = Number(d.floor ?? currentFloor());

  state.seq.polygon = state.seq.polygon || {};
  state.seq.polygon[f] = (state.seq.polygon[f] ?? 0) + 1;

  const cleanedNodes = normalizePolygonNodes(d.nodes);
  if (cleanedNodes.length < 3) {
    state.polygonDraft = null;
    redrawOverlay();
    return;
  }

  const newPoly = {
    id: nextPolyId(),
    floor: f,
    pseq: nextPolySeq(f), // 층별 표기 번호
    name: "",
    nodes: [...cleanedNodes], // 이 폴리곤을 이루는 노드 id 리스트
  };

  state.graph.polygons = state.graph.polygons || [];
  state.graph.polygons.push(newPoly);

  state.polygonDraft = null;

  redrawOverlay();
  pushHistory();
}

els.overlay.addEventListener("dblclick", (ev) => {
  if (state.tool !== "polygon") return;
  if (!state.polygonDraft) return;
  finalizePolygon();
  ev.preventDefault();
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

/**
 * 현재 활성 도구를 변경한다.
 * - toolbar 버튼 active 상태 갱신
 * - 선택 상태/임시 상태를 초기화할 수도 있음
 */
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
    els.nodeGroup.style.display = "none";
    els.linkGroup.style.display = "none";
    els.polyGroup.style.display = "none";
    els.compassPanel.style.display = "";
    populateCompassNodeSelects();
  } else {
    els.compassPanel.style.display = "none";
  }

  if (next !== "polygon") state.polygonDraft = null;

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

  const A = getNodeById(a);
  const B = getNodeById(b);

  state.northRef = {
    from_node: A ? A.id : null,
    to_node: B ? B.id : null,
    azimuth: +az.toFixed(1),
  };
  // UI 표시용 라벨
  const fromLabel = A ? nodeLabel(A) : a;
  const toLabel = B ? nodeLabel(B) : b;

  els.compassInfo.textContent = `설정됨: ${fromLabel} → ${toLabel}, ${state.northRef.azimuth}°`;
  els.projState.textContent = "상태: 수정됨";
  els.projState.style.color = "#e67e22";

  showToast("방위각이 설정되었습니다.");
});

els.btnCompassClear.addEventListener("click", () => {
  state.northRef = { from_node: null, to_node: null, azimuth: 0 };
  els.compassAz.value = "";
  populateCompassNodeSelects();
  els.projState.textContent = "상태: 수정됨";
  els.projState.style.color = "#e67e22";

  showToast("방위각이 삭제되었습니다.");
});

// ----------------------------------------------------
// ------------------ save function -------------------
async function saveProjectToDirectory() {
  if (typeof JSZip === "undefined") {
    alert("JSZip을 불러올 수 없습니다. 네트워크 상태를 확인해 주세요.");
    return;
  }

  const projName = getProjectName();
  const projAuthorRaw =
    (els.projAuthor?.textContent || "").replace(/^작성자:\s*/, "") ||
    state.projectAuthor ||
    els.projectAuthor?.value ||
    "";
  const projAuthor = (projAuthorRaw || "").trim();
  const zip = new JSZip();
  const root = zip.folder(projName) || zip;
  const imgFolder = root.folder("images");

  const exportImageMap = {};
  const jsonImageMap = {};

  const fetchBinary = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
    return await res.arrayBuffer();
  };

  for (let i = 0; i < state.floors; i++) {
    const url = state.images?.[i];
    const label =
      (state.imageLabels?.[i] || "").trim() ||
      document.getElementById("fileName_" + i)?.textContent?.trim() ||
      "";

    jsonImageMap[i] = url || null;
    if (!url || !label || label === "이미지 없음") {
      exportImageMap[i] = null;
      continue;
    }

    const ext = label.includes(".") ? label.split(".").pop() : "png";
    const safeName = sanitizeName(label) || `floor_${i + 1}.${ext}`;
    const filename = safeName.endsWith("." + ext)
      ? safeName
      : `${safeName}.${ext}`;

    const data = await fetchBinary(url);
    imgFolder.file(filename, data);
    exportImageMap[i] = `images/${filename}`;
  }

  const json = serializeToDataFormat();
  const meta = {
    floors: state.floors,
    startFloor: state.startFloor,
    currentFloor: state.currentFloor,
    scale: state.scale,
    projectName: projName,
    projectAuthor: projAuthor,
    bgOpacity: state.bgOpacity ?? 1,
    floorNames: sanitizeFloorNames(state.floorNames, state.floors),
  };
  json.meta = meta;
  json.images = jsonImageMap;

  const exportJson = JSON.parse(JSON.stringify(json));
  const exportFloors = exportJson.floors
    ? JSON.parse(JSON.stringify(exportJson.floors))
    : {};

  delete exportJson._editor;
  delete exportJson.meta;
  delete exportJson.images;
  delete exportJson.floors;

  root.file(
    "graph.json",
    JSON.stringify(exportJson, null, 2),
    { date: new Date() }
  );

  for (let f = 0; f < state.floors; f++) {
    const bucket =
      exportFloors[String(f)] || {
        nodes: {},
        connections: {},
        special_points: {},
        polygons: [],
      };
    const floorJson = {
      scale: Number(state.scale) || 0,
      north_reference: state.northRef || {},
      nodes: bucket.nodes || {},
      connections: bucket.connections || {},
      special_points: bucket.special_points || {},
      polygons: bucket.polygons || [],
    };
    root.file(
      `graph_floor${f}.json`,
      JSON.stringify(floorJson, null, 2),
      { date: new Date() }
    );
  }

  root.file(
    "images_map.json",
    JSON.stringify(exportImageMap, null, 2),
    { date: new Date() }
  );

  let svgCount = 0;
  for (let f = 0; f < state.floors; f++) {
    const svgText = buildPolygonsSVGText(f);
    if (!svgText) continue;
    svgCount += 1;
    root.file(
      `${projName}_floor${f}_polygons.svg`,
      svgText,
      { date: new Date() }
    );
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projName || "project"}.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);


  const saved = await apiUpdateProject(state.projectId, json);
  state.modified = false;

  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
  const svgInfo = svgCount > 0 ? ` + ${svgCount} SVG` : "";
  els.status.textContent = `ZIP 내보내기 완료: graph.json + images${svgInfo}`;
}

// reformat the data
function serializeToDataFormat() {
  const floorNames = sanitizeFloorNames(state.floorNames, state.floors);
  state.floorNames = floorNames;

  const createFloorBucket = () => ({
    nodes: {},
    connections: {},
    special_points: {},
    polygons: [],
  });
  const floorBuckets = {};
  const ensureFloorBucket = (idx) => {
    const key = String(Number(idx) || 0);
    if (!floorBuckets[key]) floorBuckets[key] = createFloorBucket();
    return floorBuckets[key];
  };

  // 0) north_reference
  const from_node = state.northRef.from_node;
  const to_node = state.northRef.to_node;
  const azimuth = state.northRef.azimuth;
  const northObj = {
    from_node,
    to_node,
    azimuth,
  };

  // 1) nodes: 배열 → 객체
  const nodesObj = {};
  for (const n of state.graph.nodes) {
    const item = { x: +n.x, y: +n.y };
    if (n.name) item.name = n.name;
    if (n.type && n.type !== "일반") item.special_id = n.type; // 맵핑 포인트
    nodesObj[n.id] = item;

    const floor = Number(n.floor ?? 0);
    const bucket = ensureFloorBucket(floor);
    bucket.nodes[n.id] = { ...item };
    if (item.special_id) bucket.special_points[n.id] = item.special_id;
  }

  // 2) connections: 링크 → 양방향 adjacency + 거리(픽셀 단위)
  const conn = {};
  const ensure = (a) => (conn[a] ||= {});
  for (const l of state.graph.links) {
    const A = state.graph.nodes.find((x) => x.id === l.a);
    const B = state.graph.nodes.find((x) => x.id === l.b);
    if (!A || !B) continue;
    const d = Math.hypot(A.x - B.x, A.y - B.y); // 픽셀 거리
    const dist = +d.toFixed(2);
    ensure(A.id)[B.id] = dist;
    ensure(B.id)[A.id] = dist;

    if (Number(A.floor ?? 0) === Number(B.floor ?? 0)) {
      const floor = Number(A.floor ?? 0);
      const bucket = ensureFloorBucket(floor);
      const ensureConn = (id) => (bucket.connections[id] ||= {});
      ensureConn(A.id)[B.id] = dist;
      ensureConn(B.id)[A.id] = dist;
    }
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
    special_points: sp,
    floors: {},
  };

  // 층별 폴리곤 정보
  for (const p of state.graph.polygons || []) {
    const floor = Number(p.floor ?? 0);
    const bucket = ensureFloorBucket(floor);
    bucket.polygons.push({
      id: p.id,
      name: p.name || "",
      nodes: Array.isArray(p.nodes) ? [...p.nodes] : [],
      pseq: Number(p.pseq ?? 0) || 0,
    });
  }

  for (let i = 0; i < state.floors; i++) {
    const key = String(i);
    out.floors[key] = floorBuckets[key] || createFloorBucket();
  }

  out._editor = {
    floors: state.floors,
    startFloor: state.startFloor,
    currentFloor: state.currentFloor,
    bgOpacity: state.bgOpacity ?? 1,
    floorNames,
    imageSizes: (state.imageSizes || []).map((sz) => {
      if (!sz || !sz.width || !sz.height) return null;
      return {
        width: Number(sz.width) || 0,
        height: Number(sz.height) || 0,
      };
    }),
    node_meta: Object.fromEntries(
      (state.graph.nodes || []).map((n) => [
        n.id,
        { floor: Number(n.floor ?? 0), nseq: Number(n.nseq ?? 0) },
      ])
    ),
    links: (state.graph.links || []).map((l) => ({
      id: l.id,
      a: l.a,
      b: l.b,
      floor: Number(l.floor ?? 0),
      lseq: Number(l.lseq ?? 0),
    })),
  };

  const polys = state.graph?.polygons || [];

  if (!out._editor) out._editor = {};
  if (!out._editor.shapes) out._editor.shapes = {};

  out._editor.shapes.polygons = (state.graph.polygons || []).map((p) => ({
    id: p.id,
    floor: Number(p.floor ?? 0),
    pseq: Number(p.pseq ?? 0) || 0,
    name: p.name || "",
    nodes: Array.isArray(p.nodes) ? [...p.nodes] : [],
    // 옵션: 디버깅용으로 좌표도 함께 남길 수 있음
    points: (Array.isArray(p.nodes) ? p.nodes : [])
      .map((nid) => getNodeById(nid))
      .filter(Boolean)
      .map((n) => [Math.round(n.x), Math.round(n.y)]),
  }));

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
  applyFromDataFormat(json);

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
        setFloorImage(idx, null);
      }
      continue;
    }
    const filename = rel.split("/").pop();
    const fh = await imgDir.getFileHandle(filename);
    const f = await fh.getFile();
    const url = URL.createObjectURL(f);
    setFloorImage(idx, url, filename, f);
  }

  // 화면 갱신
  renderFloor?.();
  redrawOverlay?.();

  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";
  els.status.textContent = `열기 완료: ${
    json.meta?.projectName || "프로젝트"
  }/`;
}

function applyFromDataFormat(json) {
  // scale
  if (typeof json.scale === "number") {
    state.scale = json.scale;
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
      links.push({ id: nextLinkId(), a, b });
      seen.add(key);
    }
  }

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

  // --- 편집기 메타 복원 ---
  const meta = json._editor || {};

  // 1) 노드 메타(floor/nseq) 주입
  const nodeMeta = meta.node_meta || {};
  for (const n of nodes) {
    const m = nodeMeta[n.id];
    if (m) {
      if (m.floor != null) n.floor = Number(m.floor);
      if (m.nseq != null) n.nseq = Number(m.nseq);
    } else {
      // 없으면 최소 기본값
      if (n.floor == null) n.floor = Number(json.meta?.startFloor ?? 0);
    }
  }

  // 2) 링크: _editor.links가 있으면 그것을 그대로 사용
  let linksArr = links;
  if (Array.isArray(meta.links) && meta.links.length) {
    const ok = [];
    for (const l of meta.links) {
      // 노드 존재 검증
      if (!nodes.find((x) => x.id === l.a) || !nodes.find((x) => x.id === l.b))
        continue;
      ok.push({
        id: l.id || `lk_${ok.length + 1}`,
        a: l.a,
        b: l.b,
        floor: Number(l.floor ?? 0),
        lseq: Number(l.lseq ?? 0),
      });
    }
    linksArr = ok;
  }

  const polyRaw =
    json?._editor?.shapes?.polygons ||
    json?._editor?.polygons || // 혹시 옛 포맷 대비 (없으면 무시)
    [];

  state.graph.polygons = (polyRaw || []).map((p, idx) => {
    const floor = Number(p.floor ?? 0);
    const pseq =
      p.pseq != null && !Number.isNaN(Number(p.pseq))
        ? Number(p.pseq)
        : idx + 1;

    const id = p.id || `pg_${Date.now()}_${idx}`;

    let nodeIds = Array.isArray(p.nodes) ? p.nodes.slice() : [];

    // 만약 옛 포맷으로 points만 있고 nodes가 없다면,
    // 가까운 노드 찾아서 매핑 시도 (있으면 좋고, 아니어도 괜찮음)
    if (!nodeIds.length && Array.isArray(p.nodes)) {
      const pts = p.nodes.map((pt) =>
        Array.isArray(pt) ? { x: pt[0], y: pt[1] } : { x: pt.x, y: pt.y }
      );
      nodeIds = pts
        .map((pt) => findNearestNodeForPoint(floor, pt, 20))
        .filter(Boolean)
        .map((n) => n.id);
    }
    nodeIds = normalizePolygonNodes(
      nodeIds.filter((nid) => nodes.find((n) => n.id === nid))
    );

    return {
      id,
      floor,
      pseq,
      name: p.name || "",
      nodes: nodeIds,
    };
  });

  // 층별 polygon 시퀀스 최대값으로 state.seq.polygon 재구성
  state.seq = state.seq || {};
  state.seq.polygon = {};

  const polygons = state.graph.polygons || [];

  for (const p of state.graph.polygons) {
    const f = Number(p.floor ?? 0);
    const cur = state.seq.polygon[f] ?? 0;
    const val = p.pseq || 0;
    state.seq.polygon[f] = Math.max(cur, val);
  }

  // 3) 층 메타
  if (Number.isInteger(meta.floors)) state.floors = meta.floors;
  if (Number.isInteger(meta.startFloor)) state.startFloor = meta.startFloor;
  if (Number.isInteger(meta.currentFloor))
    state.currentFloor = meta.currentFloor;
  const editorFloorNames =
    Array.isArray(meta.floorNames) && meta.floorNames.length
      ? meta.floorNames
      : Array.isArray(json.meta?.floorNames)
      ? json.meta.floorNames
      : null;
  const storedImageSizes =
    Array.isArray(meta.imageSizes) && meta.imageSizes.length
      ? meta.imageSizes
      : Array.isArray(json.meta?.imageSizes) && json.meta.imageSizes.length
      ? json.meta.imageSizes
      : null;
  state.floorNames = sanitizeFloorNames(
    editorFloorNames || state.floorNames,
    state.floors
  );
  const opacitySource =
    typeof meta.bgOpacity === "number"
      ? meta.bgOpacity
      : typeof json.meta?.bgOpacity === "number"
      ? json.meta.bgOpacity
      : null;
  if (opacitySource != null) {
    updateBgOpacityControls(opacitySource);
  } else {
    updateBgOpacityControls(state.bgOpacity ?? 1);
  }

  // 4) 적용
  state.graph = { nodes, links: linksArr, polygons };

  // 5) 층별 시퀀스 복구(누락 채움)
  rebuildSeqFromData();

  setCountersFromData({
    nodes: Array.isArray(nodes)
      ? nodes
      : Object.fromEntries(nodes.map((n) => [n.id, n])),
    links: linksArr,
  });

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

  // images 복원: 배열 또는 딕셔너리 모두 지원
  if (json.images) {
    let arr;
    if (Array.isArray(json.images)) {
      arr = json.images;
    } else if (typeof json.images === "object") {
      // { "0": "파일명 또는 URL", "1": ... } -> 인덱스 순서 배열로 변환
      const maxIdx = Math.max(
        ...Object.keys(json.images)
          .map((k) => +k)
          .filter((n) => !isNaN(n)),
        -1
      );
      arr = Array.from(
        { length: maxIdx + 1 },
        (_, i) => json.images[String(i)] ?? null
      );
    }
    if (arr) {
      // 파일명만 저장된 경우 /media 경로 보정
      releaseBlobUrls(state.images);
      state.images = arr.map((v, i) => {
        if (!v) return null;
        
        // 절대 URL인 경우
        if (/^https?:\/\//.test(v)) {
          // 127.0.0.1이나 localhost를 포함하는 경우 API_ORIGIN으로 교체
          // 다른 컴퓨터에서 접속할 때 올바른 IP를 사용하도록 함
          if (v.includes("127.0.0.1") || v.includes("localhost")) {
            // URL에서 경로 부분만 추출하여 API_ORIGIN과 결합
            try {
              const url = new URL(v);
              return `${API_ORIGIN}${url.pathname}${url.search}${url.hash}`;
            } catch (e) {
              // URL 파싱 실패 시 원본 반환
              return v;
            }
          }
          // 이미 올바른 호스트를 사용하는 경우 그대로 반환
          return v;
        }
        
        // 상대 경로인 경우
        if (v.startsWith("/media/")) return `${API_ORIGIN}${v}`; // /media → 백엔드 ORIGIN 붙임
        
        // 파일명만 있는 경우: 서버 저장 구조에 맞게 /media/floor_images/{projectId}/{floor}_{filename} 형태로 구성
        // state.projectId가 없으면 경로를 구성할 수 없으므로 원본 값 반환
        if (!state.projectId) return v;
        return `${API_ORIGIN}/media/floor_images/${state.projectId}/${i}_${v}`;
      });
      state.imageLabels = state.images.map((url) =>
        url ? extractFileNameFromUrl(url) : ""
      );
      ensureImageArrays(state.images.length);
      state.inlineSvgMarkup = Array.from(
        { length: state.images.length },
        () => null
      );
      state.images.forEach((v, idx) => {
        const label = state.imageLabels[idx] || "";
        if (v && isSvgLikeSource(label || v)) {
          getInlineSvgMarkup({ url: v }).then((markup) => {
            if (markup) setInlineSvgMarkup(idx, markup);
          });
        }
      });
      const count = Math.max(
        state.images.length,
        storedImageSizes?.length || 0
      );
      state.imageSizes = Array.from({ length: count }, (_, idx) => {
        const sz = storedImageSizes?.[idx];
        if (sz && Number(sz.width) > 0 && Number(sz.height) > 0) {
          return {
            width: Number(sz.width) || 0,
            height: Number(sz.height) || 0,
          };
        }
        return null;
      });
      state.imageSizes.forEach((_, idx) => refreshInlineBackgroundForFloor(idx));
    }
  }

  clearSelection?.();
  updateLayersPanel?.();
  redrawOverlay?.();
  els.projState.textContent = "상태: 저장됨";
  els.projState.style.color = "#27ae60";

  // 층 리스트 갱신 + 현재 층 이미지 표시
  populateFloorSelect?.();
  renderFloor?.();
}

// connect function and save button
// 저장(DB)
async function saveToServer() {
  if (!state.projectId) {
    alert("저장할 프로젝트가 없습니다. 먼저 새 프로젝트를 생성하세요.");
    return false;
  }

  try {
    // 에디터 상태 → data 포맷
    const data = serializeToDataFormat();

    // DB에 메타/스케일/시작층도 함께 보관
    data.meta = {
      projectName: getProjectName(),
      projectAuthor:
        (els.projAuthor?.textContent || "").replace(/^작성자:\s*/, "") ||
        els.projectAuthor?.value ||
        "" ||
        "",
    };
    const floorNames = sanitizeFloorNames(state.floorNames, state.floors);
    state.floorNames = floorNames;
    data.meta.floorNames = floorNames;
    data.meta.bgOpacity = state.bgOpacity ?? 1;
    data.scale = Number(state.scale) || 0;
    data.startFloor = state.startFloor ?? 1;

    const saved = await apiUpdateProject(state.projectId, data);

    state.modified = false;
    els.projState.textContent = "상태: 저장됨";
    els.projState.style.color = "#27ae60";
    els.status.textContent = `DB 저장 완료 (id: ${saved.id})`;

    state._savedSnapshot = snapshotCurrent();

    console.log("DB 저장 완료:", saved);
    return true;
  } catch (e) {
    console.error(e);
    els.status.textContent = "DB 저장 실패";
    alert("DB 저장에 실패했습니다. 콘솔을 확인해 주세요.");
    return false;
  }
}

els.btnSave.addEventListener("click", async () => {
  const ok = await saveToServer();
  if (ok) showToast("저장되었습니다.");
});

// 내보내기
els.btnExport.addEventListener("click", async () => {
  try {
    if (window.showDirectoryPicker) {
      await saveProjectToDirectory();
    } else {
      // 폴백: 기존 JSON만 저장 (폴더 미지원 브라우저)
      const data = serializeToDataFormat();
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
      applyFromDataFormat(json);
      els.status.textContent = "폴더 열기 미지원 → JSON만 열었습니다.";
    }
    activateProject();
  } catch (e) {
    console.error(e);
    els.status.textContent = "열기 실패";
  }
});

(async function bootstrap() {
  const u = new URL(location.href);
  const pid = u.searchParams.get("project");
  if (pid) {
    const data = await apiGetProject(pid);
    state.projectId = data.id;
    applyFromDataFormat(data); // 복원 함수

    // 헤더 상태 갱신
    if (els.projName)
      els.projName.textContent =
        "이름: " + (data?.meta?.projectName || "새 프로젝트");
    if (els.projState) {
      els.projState.textContent = "상태: 저장됨";
      els.projState.style.color = "#27ae60";
    }
    activateProject();
  } else {
    // 새 프로젝트 플로우: 모달만 열고, 모달 "확인"에서 apiCreateProject 1회 실행
    openModal();
  }
})();

// export polygon to svg
function buildPolygonsSVGText(floorIndex) {
  const floor = Number(floorIndex ?? currentFloor());
  const polys = (state.graph.polygons || []).filter(
    (p) => Number(p.floor ?? 0) === floor
  );

  if (!polys.length) return null;
  const size =
    getFloorImageSize(floor) ||
    (floor === currentFloor() ? getCurrentImageSize() : null) || {
      width: 1000,
      height: 1000,
    };
  const w = Math.max(1, Math.round(Number(size.width) || 1));
  const h = Math.max(1, Math.round(Number(size.height) || 1));

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];  

  for (const p of polys) {
    const pts = (p.nodes || []).map((nid) => getNodeById(nid)).filter(Boolean);
    if (pts.length < 3) continue;
    const ptsAttr = pts.map((n) => `${n.x},${n.y}`).join(" ");
    parts.push(
      `<polygon points="${ptsAttr}" fill="none" stroke="#000" stroke-width="1"/>`
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

setTool("select");
