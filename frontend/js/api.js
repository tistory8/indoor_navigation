// js/api.js
// -----------------------------------------------------------------------------
// Django 백엔드의 REST API 호출을 모아둔 모듈.
// - 프로젝트 목록 조회 / 단일 조회 / 생성 / 수정 / 삭제
// - 층별 배경 이미지 업로드
// -----------------------------------------------------------------------------


// 기본 API 엔드포인트
// window.API_BASE가 있으면 그 값을 쓰고, 없으면 로컬 개발용 기본값 사용
export const API_BASE = window.API_BASE || "http://127.0.0.1:8000/api";

// media URL 등을 만들 때 '원본 서버 주소'가 필요해서
// "/api" 접미사를 잘라낸 값을 별도로 보관 (예: "http://127.0.0.1:8000")
export const API_ORIGIN = API_BASE.replace(/\/api$/, "");

// -----------------------------------------------------------------------------
// 프로젝트 리스트 조회
// GET /api/projects/?q=검색어
// q: 검색어 (프로젝트 이름 등 필터링에 사용)
// -----------------------------------------------------------------------------
async function apiListProjects(q = "") {
  const r = await fetch(`${API_BASE}/projects/?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("list failed");
  return r.json();
}

// -----------------------------------------------------------------------------
// 단일 프로젝트 조회
// GET /api/projects/:id/
// id: 숫자 ID (PK)
// -----------------------------------------------------------------------------
async function apiGetProject(id) {
  const r = await fetch(`${API_BASE}/projects/${id}/`);
  if (!r.ok) throw new Error("get failed");
  return r.json();
}

// -----------------------------------------------------------------------------
// 프로젝트 생성
// POST /api/projects/
// payload: { meta, scale, nodes, ... } 형태의 JSON
// 응답: 생성된 프로젝트 객체 (id 포함)
// -----------------------------------------------------------------------------
async function apiCreateProject(payload) {
  const r = await fetch(`${API_BASE}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("create failed");
  return r.json();
}

// -----------------------------------------------------------------------------
// 프로젝트 전체 업데이트
// PUT /api/projects/:id/
// payload: 전체 데이터를 덮어쓸 JSON
// -----------------------------------------------------------------------------
async function apiUpdateProject(id, payload) {
  const r = await fetch(`${API_BASE}/projects/${id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("update failed");
  return r.json();
}

// -----------------------------------------------------------------------------
// 프로젝트 삭제
// DELETE /api/projects/:id/
// 성공 시 true 반환
// -----------------------------------------------------------------------------
async function apiDeleteProject(id) {
  const r = await fetch(`${API_BASE}/projects/${id}/`, { method: "DELETE" });
  if (!r.ok) throw new Error("delete failed");
  return true;
}

// -----------------------------------------------------------------------------
// 층별 배경 이미지 업로드
// POST /api/upload_floor_image/
// - file: 실제 이미지 파일 (File 객체)
// - project: 프로젝트 식별자 (id, slug, name 등 서버 구현에 맞게)
// - floor: 층 인덱스 (0 기반 또는 서버 약속에 맞게 사용)
// 응답: { ok:true, url:"/media/..." } 형태 (url은 절대/상대 둘 다 가능)
// -----------------------------------------------------------------------------
async function apiUploadFloorImage({ file, project, floor }) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project", project); // id(권장) 또는 slug/name
  fd.append("floor", String(floor));

  const res = await fetch(`${API_BASE}/upload_floor_image/`, {
    method: "POST",
    body: fd, // FormData는 Content-Type 헤더 자동 설정됨
  });
  if (!res.ok) throw new Error("upload failed");
  // 예: { ok:true, url:"/media/floor_images/1_0_map.png" }
  return await res.json();
}

// 모듈 외부에서 사용할 함수/상수들 export
export {
  apiListProjects,
  apiGetProject,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiUploadFloorImage,
};