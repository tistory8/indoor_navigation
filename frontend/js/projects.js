// js/projects.js
// -----------------------------------------------------------------------------
// 프로젝트 목록 페이지(index.html) 전용 스크립트
// - 목록 조회/검색/정렬
// - 카드 렌더링
// - 새 프로젝트 버튼/열기/삭제 버튼 동작
// -----------------------------------------------------------------------------

import {
  apiListProjects,
  apiCreateProject,   // 현재는 사용 안 하지만, 필요 시 목록에서 바로 생성용으로 확장 가능
  apiDeleteProject,
} from "./api.js";
import { gotoEditor } from "./common.js";

// 자주 쓰는 DOM 요소 캐시
const els = {
  grid: document.getElementById("grid"),       // 프로젝트 카드가 렌더링될 그리드 컨테이너
  btnNew: document.getElementById("btnNew"),   // "+ New project" 버튼
  txtSearch: document.getElementById("txtSearch"), // 검색 인풋
  selSort: document.getElementById("selSort"),     // 정렬 기준 셀렉트
};


// -----------------------------------------------------------------------------
// 단일 프로젝트 카드 HTML 템플릿
// p: 백엔드에서 온 프로젝트 객체
//   - p.id           : PK
//   - p.thumbnail    : 썸네일 이미지 URL (없을 수도 있음)
//   - p.projectName / p.name : 프로젝트 이름
//   - p.updated_at   : 마지막 수정 시각(ISO 문자열)
// -----------------------------------------------------------------------------
function cardTpl(p) {
  const thumb = p?.thumbnail || "";
  const name = p?.projectName || p.name || "Untitled";
  const dt = p.updated_at ? new Date(p.updated_at) : null;
  const when = dt ? `Last edited on ${dt.toDateString()}` : "";
  return `
  <article class="proj-card" data-id="${p.id}">
    <div class="thumb">
      ${thumb ? `<img src="${thumb}" alt="">` : `<div class="thumb--empty"></div>`}
    </div>
    <h3>${name}</h3>
    <p class="muted">${when}</p>
    <div class="row">
      <button class="btn open">Open</button>
      <button class="btn danger del">Delete</button>
    </div>
  </article>`;
}


// -----------------------------------------------------------------------------
// 정렬 함수
// list: 프로젝트 배열
// how: 정렬 옵션 (name_asc / name_desc / date_asc / date_desc)
// -----------------------------------------------------------------------------
function sortProjects(list, how) {
  // 원본 배열 훼손 방지를 위해 얕은 복사본 생성
  const L = [...list];

  if (how === "name_asc") {
    // 이름 오름차순 (A → Z)
    L.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  if (how === "name_desc") {
    // 이름 내림차순 (Z → A)
    L.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
  }
  if (how === "date_asc") {
    // 수정일 오름차순 (오래된 것 → 최근)
    L.sort(
      (a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0)
    );
  }
  if (how === "date_desc") {
    // 수정일 내림차순 (최근 → 오래된 것)
    L.sort(
      (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
    );
  }

  return L;
}

// -----------------------------------------------------------------------------
// 목록 새로 불러와서 화면에 렌더링
// - 검색 값 / 정렬 값 읽어서 API 호출 후 카드 HTML로 교체
// -----------------------------------------------------------------------------
async function refresh() {
  try {
    const q = els.txtSearch.value.trim();
    const sort = els.selSort.value;

    // /api/projects/?q= 검색어
    const raw = await apiListProjects(q);

    // Django pagination 등을 고려해 배열 또는 {results:[..]} 모두 대응
    const data = Array.isArray(raw) ? raw : raw.results || [];

    // 정렬 옵션에 따라 정렬
    const list = sortProjects(data, sort);

    // 카드 HTML 합쳐서 그리드에 렌더링
    els.grid.innerHTML = list.map(cardTpl).join("");
  } catch (e) {
    console.error(e);
    els.grid.innerHTML =
      `<div class="empty">프로젝트를 불러오지 못했습니다.</div>`;
  }
}

// -----------------------------------------------------------------------------
// 이벤트 바인딩
// -----------------------------------------------------------------------------

// "+ New project" 클릭 시
// - editor.html?project=new 이런 식이 아니라
//   그냥 editor.html로 이동해서 에디터에서 '새 프로젝트 모달'을 띄우는 방식
els.btnNew.addEventListener("click", async () => {
  gotoEditor("new");
});

// 프로젝트 카드 내부 버튼 처리 (이벤트 위임)
els.grid.addEventListener("click", async (e) => {
  const card = e.target.closest(".proj-card");
  if (!card) return;

  const id = card.dataset.id;

  // "Open" 버튼: 해당 프로젝트 ID로 에디터 이동
  if (e.target.classList.contains("open")) {
    gotoEditor(id);
  }

  // "Delete" 버튼: 확인 후 삭제 → 목록 새로고침
  if (e.target.classList.contains("del")) {
    if (confirm("Delete this project?")) {
      await apiDeleteProject(id);
      refresh();
    }
  }
});

// 검색 인풋: 타이핑 할 때마다 곧바로 필터링
els.txtSearch.addEventListener("input", () => refresh());

// 정렬 옵션 변경 시 재렌더링
els.selSort.addEventListener("change", () => refresh());

// 페이지 최초 진입 시 한 번 목록 로드
refresh();