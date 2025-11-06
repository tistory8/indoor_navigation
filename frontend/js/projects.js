// js/app_projects.js
import { apiListProjects, apiCreateProject, apiDeleteProject } from "./api.js";
import { gotoEditor } from "./common.js";

const els = {
  grid: document.getElementById("grid"),
  btnNew: document.getElementById("btnNew"),
  txtSearch: document.getElementById("txtSearch"),
  selSort: document.getElementById("selSort"),
};

function cardTpl(p) {
  const thumb = p?.meta?.thumbnail || "";
  const name = p?.meta?.projectName || p.name || "Untitled";
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

function sortProjects(list, how) {
  const L = [...list];
  if (how === "name_asc") L.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  if (how === "name_desc") L.sort((a,b)=> (b.name||"").localeCompare(a.name||""));
  if (how === "date_asc") L.sort((a,b)=> new Date(a.updated_at||0) - new Date(b.updated_at||0));
  if (how === "date_desc") L.sort((a,b)=> new Date(b.updated_at||0) - new Date(a.updated_at||0));
  return L;
}

async function refresh() {
    try {
      const q = els.txtSearch.value.trim();
      const sort = els.selSort.value;
      const raw = await apiListProjects(q);
      const data = Array.isArray(raw) ? raw : (raw.results || []);
      const list = sortProjects(data, sort);
      els.grid.innerHTML = list.map(cardTpl).join("");
    } catch (e) {
      console.error(e);
      els.grid.innerHTML = `<div class="empty">프로젝트를 불러오지 못했습니다.</div>`;
    }
  }

// 이벤트 바인딩
els.btnNew.addEventListener("click", async () => {
  gotoEditor("new");
});

els.grid.addEventListener("click", async (e) => {
  const card = e.target.closest(".proj-card");
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.classList.contains("open")) gotoEditor(id);
  if (e.target.classList.contains("del")) {
    if (confirm("Delete this project?")) {
      await apiDeleteProject(id);
      refresh();
    }
  }
});

els.txtSearch.addEventListener("input", () => refresh());
els.selSort.addEventListener("change", () => refresh());

// 초기 로드
refresh();
