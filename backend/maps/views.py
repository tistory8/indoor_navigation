# maps/views.py
"""
실내 지도 에디터용 Django 뷰들.

크게 3가지 역할:
1) HTML 페이지 렌더링 (프로젝트 목록, 에디터 화면)
2) 프로젝트 CRUD API (목록 조회, 생성, 상세 조회/수정/삭제)
3) 층별 배경 이미지 업로드 API
"""
from django.shortcuts import render
from django.http import JsonResponse, HttpResponseNotAllowed, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt

from django.core.files.storage import FileSystemStorage
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

from .models import Project

import json
from copy import deepcopy
import shutil

# ----- 페이지 렌더링 -----
def projects_home(request):
    """
    프로젝트 목록 페이지 뷰.

    - 템플릿: maps/index.html
    - 실제 목록 데이터는 프론트에서 /api/projects/로 AJAX 호출해서 가져간다.
    """
    return render(request, 'maps/index.html')

def editor_page(request, slug: str):
    """
    에디터 페이지 뷰.

    - URL로 받은 project slug를 템플릿에 넘겨준다.
    - 프론트에서는 이 slug를 사용해 /api/projects/by-slug/<slug>/ 호출로
      프로젝트 내용을 최초 로드한다.
    """
    return render(request, 'maps/editor.html', {"project_slug": slug})


def ping(request):
    """
    단순 헬스체크용 API.

    - /api/ping 같은 엔드포인트에 연결해 두면,
      서버가 살아있는지 프론트에서 간단히 확인할 수 있다.
    """    
    return JsonResponse({"ok": True})


# ----- 내부 헬퍼 함수 -----

def _normalize_data(payload: dict) -> dict:
    """
    프론트에서 전달한 payload를 저장하기 전에 정리(normalize)하는 함수.

    - meta 기본값 채우기 (projectName, projectAuthor)
    - scale을 float로 강제 변환
    - nodes / connections 존재 여부 및 타입 보정
    - special_points, north_reference 구조 정리
    - images: list/dict 외 타입이면 비우기
    - id 필드는 DB 저장용이 아니므로 제거
    """
    data = deepcopy(payload) if isinstance(payload, dict) else {}

    # ----- meta 처리 -----
    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}
    meta.setdefault("projectName", "새 프로젝트")
    meta.setdefault("projectAuthor", "")
    data["meta"] = meta

    # ----- scale 처리 -----
    try:
        data["scale"] = float(data.get("scale", 0))
    except Exception:
        data["scale"] = 0.0

    # ----- nodes / connections 기본 구조 보정 -----
    if not isinstance(data.get("nodes"), dict):
        data["nodes"] = {}
    if not isinstance(data.get("connections"), dict):
        data["connections"] = {}

    # ----- special_points -----
    # dict가 아니면 아예 비워버린다.
    if "special_points" in data and not isinstance(data["special_points"], dict):
        data["special_points"] = {}

    # ----- north_reference (방위/나침반 정보) -----
    # {"from_node": ..., "to_node": ..., "azimuth": ...} 형태로 강제 정리
    nr = data.get("north_reference")
    if isinstance(nr, dict):
        out = {
            "from_node": nr.get("from_node") or None,
            "to_node": nr.get("to_node") or None,
            # azimuth는 float로 저장 (없으면 0)
            "azimuth": float(nr.get("azimuth") or 0),
        }
        data["north_reference"] = out
    elif nr is not None:
        # 이상한 타입이면 키 자체를 제거
        data.pop("north_reference", None)

    # ----- images -----
    # 배열(list)/객체(dict)만 허용, 그 외 타입이면 비운다.
    imgs = data.get("images")
    if imgs is None:
        data["images"] = []
    else:
        if not isinstance(imgs, (list, dict)):
            data["images"] = []

    # ----- id 정리 -----
    # id는 DB의 PK와 중복되므로 data 안에서는 제거
    data.pop("id", None)
    return data



# ----- 프로젝트 목록 & 생성 -----

@csrf_exempt
def projects(request):
    """
    /api/projects/ 엔드포인트.

    - GET  : 프로젝트 목록 조회
             -> [{id, name, slug, updated_at, thumbnail}, ...]
    - POST : 새 프로젝트 생성
             -> 프론트에서 보낸 JSON payload를 normalize 후 DB에 저장
                저장된 데이터 + id/slug를 합쳐서 반환
    """
    if request.method == "GET":
        out = []
        
        # 최근 수정된 순으로 정렬하고 싶다면 '-updated_at'을 사용할 수 있지만,
        # 현재 코드는 updated_at 오름차순으로 정렬        
        for p in Project.objects.all().order_by("updated_at"):
            thumb_url = ""

            # data 안에서 images 정보를 꺼내서 썸네일 URL 추출            
            if isinstance(p.data, dict):
                images = p.data.get("images") or {}
                
                # dict 지원 (예: {"1": "/media/.../1.png", "2": "..."} 형태)
                if isinstance(images, dict) and images:
                    # 키를 문자열 기준으로 정렬해서 가장 앞의 값을 사용
                    first_key = sorted(images.keys(), key=str)[0]
                    thumb_url = images[first_key] or ""
                
                # list 지원 (예: ["/media/.../1f.png", "/media/.../2f.png", ...])
                elif isinstance(images, list) and any(images):
                    # None이 아닌 첫 번째 URL 사용
                    for u in images:
                        if u:
                            thumb_url = u
                            break

            # 절대 URL로 변환해서 프론트에 넘겨준다.
            out.append({"id": p.id, 
                        "name": p.name,
                        "slug": p.slug,
                        "updated_at": p.updated_at.isoformat(),
                        "thumbnail": request.build_absolute_uri(thumb_url),
                        })
        
        # safe=False: 리스트 형태도 그대로 반환 가능
        return JsonResponse(out, safe=False)

    if request.method == "POST":
        # 새 프로젝트 생성
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        data = _normalize_data(payload)
        
        # meta.projectName이 있으면 그걸 name으로 사용, 없으면 '새 프로젝트'
        name = (data.get("meta") or {}).get("projectName") or "새 프로젝트"
        
        # DB에 Project 생성
        obj = Project.objects.create(name=name, data=data)
        
        # 프론트에서 쓰기 편하도록 data + id/slug를 합친 형태로 반환
        return JsonResponse(obj.to_response(), status=201)

    # 허용되지 않은 메서드일 경우
    return HttpResponseNotAllowed(["GET", "POST"])



# ----- 특정 프로젝트 조회/수정/삭제 -----

@csrf_exempt
def project_id(request, pid: int):
    """
    /api/projects/<pid>/ 엔드포인트.

    - GET    : 단일 프로젝트 조회
    - PUT    : 전체 업데이트 (payload와 기존 data를 병합 후 normalize)
    - PATCH  : 부분 업데이트 (PUT와 동일 처리)
    - DELETE : 프로젝트 삭제 + 관련 floor_images 폴더 삭제
    """
    try:
        obj = Project.objects.get(pk=pid)
    except Project.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    if request.method == "GET":
        # 단일 프로젝트 JSON 반환
        return JsonResponse(obj.to_response())

    if request.method in ["PUT", "PATCH"]:
        # 업데이트 요청
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        
        # 기존 data 복사 후, 들어온 payload로 얕은 병합
        merged = {}
        if isinstance(obj.data, dict):
            merged.update(obj.data)
        if isinstance(payload, dict):
            merged.update(payload)
            
        # 병합 결과를 normalize
        data = _normalize_data(merged)
        obj.data = data
        
        # 이름 변경 여부 체크 (meta.projectName 기준)
        new_name = (data.get("meta") or {}).get("projectName") or obj.name
        
        # 이름이 바뀌었으면 name 갱신 + slug를 비워서 save()에서 재생성되게 처리
        if new_name != obj.name:
                obj.name = new_name
                obj.slug = None
                
        # data, name, slug, updated_at 필드만 업데이트
        obj.save(update_fields=["data", "name", "slug", "updated_at"])
        
        return JsonResponse(obj.to_response())

    if request.method == "DELETE":
        # 프로젝트 삭제
        obj.delete()

        # 프로젝트 폴더 제거: media/floor_images/<project_id>
        proj_dir = settings.MEDIA_ROOT / "floor_images" / str(pid)
        try:
            if proj_dir.exists() and proj_dir.is_dir():
                shutil.rmtree(proj_dir)
        except Exception as e:
            # 폴더 정리 실패는 치명적이지 않으니 경고만 남김
            print(f"[WARN] failed to remove {proj_dir}: {e}")

        return JsonResponse({"ok": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])


# ----- 층 이미지 업로드 -----

@csrf_exempt
def upload_floor_image(request):
    """
    층별 배경 이미지 업로드 엔드포인트.

    - POST /api/upload-floor-image/
    - form-data:
        - file   : 업로드할 이미지 파일
        - project: 프로젝트 식별자 (id 또는 slug 또는 name)
        - floor  : 층 번호 (정수, 0 기반/1 기반은 프론트 규칙에 맞게)
    - 저장 경로:
        MEDIA_ROOT / "floor_images" / <project_id> / "<floor>_<원본파일명>"
    - 저장 후:
        - Project.data.images[floor] 에 상대 URL(/media/...)을 반영
        - 응답으로 절대 URL을 돌려준다.
    """    
    if request.method != "POST":
        return JsonResponse({"error": "POST only"}, status=405)

    file = request.FILES.get("file")
    project_raw = request.POST.get("project") or ""
    floor_raw = request.POST.get("floor") or "0"
    if not file:
        return JsonResponse({"error": "no file"}, status=400)

    # floor 정수화 (서버 파일명 용도 — 1/0 기반 어떤 걸 쓰든 상관없음)
    try:
        floor = int(floor_raw)
    except Exception:
        floor = 0

    # ----- 프로젝트 찾기 -----
    # 우선순위: id -> slug -> name
    obj = None
    
    # 숫자만으로 구성되어 있으면 pk로 간주
    if project_raw.isdigit():
        obj = Project.objects.filter(pk=int(project_raw)).first()
    if obj is None:
        # slug 로 검색
        obj = Project.objects.filter(slug=project_raw).first()
    if obj is None and project_raw:
        # name 기준으로 최신 수정 프로젝트 한 개 선택
        obj = Project.objects.filter(name=project_raw).order_by("-updated_at").first()

    # 프로젝트 id를 폴더명으로 사용 (없으면 misc)
    proj_id = obj.id if obj else "misc"

    # 저장 디렉터리: MEDIA_ROOT / floor_images / <project_id>
    proj_dir = settings.MEDIA_ROOT / "floor_images" / str(proj_id)
    proj_dir.mkdir(parents=True, exist_ok=True)

    # 저장 파일명: <floor>_<원본파일명>
    safe_name = file.name.replace("/", "_").replace("\\", "_")
    save_name = f"{floor}_{safe_name}"

    fs = FileSystemStorage(location=proj_dir)
    saved_name = fs.save(save_name, file)

    # URL 구성: /media/floor_images/<project_id>/<saved_name>
    rel_url = f"{settings.MEDIA_URL}floor_images/{proj_id}/{saved_name}"
    abs_url = request.build_absolute_uri(rel_url)

    
    # ----- 서버의 Project.data.images에 바로 반영 -----
    # 서버에 바로 DB에 반영
    if obj:
        data = obj.data or {}
        images = data.get("images") or []
        
        # floor 인덱스까지 리스트 길이를 확장
        if floor >= len(images):
            images.extend([None] * (floor + 1 - len(images)))
            
        # 해당 층의 이미지 URL을 저장 (상대/절대 중 하나로 통일해서 쓰면 좋음)
        images[floor] = rel_url
        data["images"] = images
        obj.data = data
        obj.save(update_fields=["data", "updated_at"])

    # 업로드 완료 응답 (프론트는 abs_url을 바로 <img src>로 사용할 수 있다)
    return JsonResponse({"ok": True, "url": abs_url})


# ----- 보조 조회 API -----

def project_by_name(request, name: str):
    """
    /api/projects/by-name/<name>/ 같은 형태로 사용 가능한 뷰.

    - 같은 이름의 프로젝트가 여러 개 있을 수 있으므로
      updated_at 기준으로 가장 최근 것을 돌려준다.
    """    
    obj = Project.objects.filter(name=name).order_by("-updated_at").first()
    if not obj:
        return JsonResponse({"error": "not found"}, status=404)
    return JsonResponse(obj.to_response())

def project_by_slug(request, slug: str):
    """
    /api/projects/by-slug/<slug>/ 엔드포인트.

    - slug는 유니크하므로 get() 사용
    - GET 이외 메서드는 허용하지 않는다.
    """    
    try:
        p = Project.objects.get(slug=slug)
    except Project.DoesNotExist:
        return HttpResponseNotFound()
    if request.method == "GET":
        return JsonResponse(p.to_response())
    return HttpResponseNotAllowed(["GET"])

def export_txt(request, pid: int):
    """
    (미구현) node.txt 등 텍스트 포맷으로 내보내기 기능용 엔드포인트.

    - 현재는 501 Not Implemented 를 반환한다.
    - 나중에 필요하면 여기서 실제 export 로직을 작성하면 된다.
    """
    return JsonResponse({"detail": "Not Implemented"}, status=501)