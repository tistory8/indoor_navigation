// js/common.js
function qs(name, def = null) {
  const u = new URL(location.href);
  return u.searchParams.get(name) ?? def;
}
function gotoEditor(idOrFlag) {
  const u = new URL("./editor.html", location.href);
  // id가 있으면 ?project= 로 넘기고, "new" 같은 플래그면 쿼리 없이 에디터만 열기
  if (idOrFlag && idOrFlag !== "new") {
    u.searchParams.set("project", idOrFlag);
  }
  location.href = u.toString();
}
export { qs, gotoEditor };
