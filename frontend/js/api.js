// js/api.js
export const API_BASE = window.API_BASE || "http://127.0.0.1:8000/api";
export const API_ORIGIN = API_BASE.replace(/\/api$/, ""); // "http://127.0.0.1:8000"

async function apiListProjects(q = "") {
  const r = await fetch(`${API_BASE}/projects/?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("list failed");
  return r.json();
}
async function apiGetProject(id) {
  const r = await fetch(`${API_BASE}/projects/${id}/`);
  if (!r.ok) throw new Error("get failed");
  return r.json();
}
async function apiCreateProject(payload) {
  const r = await fetch(`${API_BASE}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("create failed");
  return r.json();
}
async function apiUpdateProject(id, payload) {
  const r = await fetch(`${API_BASE}/projects/${id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("update failed");
  return r.json();
}
async function apiDeleteProject(id) {
  const r = await fetch(`${API_BASE}/projects/${id}/`, { method: "DELETE" });
  if (!r.ok) throw new Error("delete failed");
  return true;
}

async function apiUploadFloorImage({ file, project, floor }) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project", project); // id(권장) 또는 slug/name
  fd.append("floor", String(floor));

  const res = await fetch(`${API_BASE}/upload_floor_image/`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error("upload failed");
  return await res.json(); // => { ok:true, url:"http://127.0.0.1:8000/media/..." }
}

export {
  apiListProjects,
  apiGetProject,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiUploadFloorImage,
};
