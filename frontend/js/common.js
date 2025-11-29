// js/common.js
// -----------------------------------------------------------------------------
// 프론트 전역에서 같이 쓰는 간단한 유틸 함수 모음
// - 쿼리스트링 파싱
// - 에디터 페이지로 이동
// -----------------------------------------------------------------------------

// URL 쿼리스트링에서 특정 파라미터 값 가져오기
// name: 파라미터 이름
// def: 값이 없을 때 기본값 (기본: null)
function qs(name, def = null) {
  // 현재 페이지 URL 객체 생성
  const u = new URL(location.href);
  // 해당 name이 없으면 def 리턴 (null 병합 연산자 사용)
  return u.searchParams.get(name) ?? def;
}


// 에디터 페이지로 이동하는 헬퍼
// idOrFlag:
//   - 숫자/문자열 ID: ?project=ID 형태로 에디터로 이동
//   - "new": 쿼리 없이 editor.html만 열어서 '새 프로젝트 모드'로 진입
function gotoEditor(idOrFlag) {
  // 현재 위치 기준으로 editor.html URL 구성
  const u = new URL("./editor.html", location.href);

  // id가 있고, "new"가 아니면 ?project= 파라미터 세팅
  if (idOrFlag && idOrFlag !== "new") {
    u.searchParams.set("project", idOrFlag);
  }

  // 실제 페이지 이동
  location.href = u.toString();
}

// ES 모듈 export
export { qs, gotoEditor };
