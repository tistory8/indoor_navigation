# maps/views.py
from django.shortcuts import render
from django.http import JsonResponse, HttpResponseNotAllowed, HttpResponseNotFound
from django.views.decorators.csrf import csrf_exempt

from django.core.files.storage import FileSystemStorage
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

from .models import Project

from pathlib import Path
import json
from copy import deepcopy

# ----- 페이지 렌더링 -----
def projects_home(request):
    """프로젝트 목록 페이지 (index.html)"""
    return render(request, 'maps/index.html')

def editor_page(request, slug: str):
    """
    에디터 페이지 (editor.html)
    - URL로 받은 projectName을 그대로 넘겨줌
    - JS가 /api/projects/by-name/{name} 로 최초 로드
    """
    return render(request, 'maps/editor.html', {"project_slug": slug})




def ping(request):
    return JsonResponse({"ok": True})

def _normalize_instar(payload: dict) -> dict:
    """프론트(app.js)가 만드는 Instar 포맷을 그대로 존중하면서
    최소 기본값만 보충."""
    data = deepcopy(payload) if isinstance(payload, dict) else {}

    # meta
    meta = data.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}
    meta.setdefault("projectName", "새 프로젝트")
    meta.setdefault("projectAuthor", "")
    data["meta"] = meta

    # scale
    try:
        data["scale"] = float(data.get("scale", 0))
    except Exception:
        data["scale"] = 0.0

    # nodes / connections
    if not isinstance(data.get("nodes"), dict):
        data["nodes"] = {}
    if not isinstance(data.get("connections"), dict):
        data["connections"] = {}

    # special_points
    if "special_points" in data and not isinstance(data["special_points"], dict):
        data["special_points"] = {}

    # north_reference
    nr = data.get("north_reference")
    if isinstance(nr, dict):
        out = {
            "from_node": nr.get("from_node") or None,
            "to_node": nr.get("to_node") or None,
            "azimuth": float(nr.get("azimuth") or 0),
        }
        data["north_reference"] = out
    elif nr is not None:
        data.pop("north_reference", None)

    # images: 배열/객체 허용
    imgs = data.get("images")
    if imgs is None:
        data["images"] = []
    else:
        if not isinstance(imgs, (list, dict)):
            data["images"] = []

    # id 는 저장 필드가 아니므로 제거
    data.pop("id", None)
    return data

@csrf_exempt
def projects(request):
    """
    GET  /api/projects/   -> [{id, name}]
    POST /api/projects/   -> Instar JSON 생성 저장, {id, ...data} 반환
    """
    if request.method == "GET":
        out = []
        for p in Project.objects.all().order_by("-updated_at"):
            out.append({"id": p.id, 
                        "name": p.name,
                        "slug": p.slug,
                        "updated_at": p.updated_at.isoformat(),
                        })
        return JsonResponse(out, safe=False)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        data = _normalize_instar(payload)
        name = (data.get("meta") or {}).get("projectName") or "새 프로젝트"
        obj = Project.objects.create(name=name, data=data)
        return JsonResponse(obj.to_response(), status=201)

    return HttpResponseNotAllowed(["GET", "POST"])

import shutil

@csrf_exempt
def project_id(request, pid: int):
    """
    GET    /api/projects/<pid>/ -> {id, ...data}
    PUT    /api/projects/<pid>/ -> 전체 업데이트(병합 후 normalize)
    PATCH  /api/projects/<pid>/ -> 부분 업데이트(동일 처리)
    DELETE /api/projects/<pid>/ -> 삭제
    """
    try:
        obj = Project.objects.get(pk=pid)
    except Project.DoesNotExist:
        return JsonResponse({"error": "not found"}, status=404)

    if request.method == "GET":
        return JsonResponse(obj.to_response())

    if request.method in ["PUT", "PATCH"]:
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        # 기존 data와 얕은 병합 후 normalize
        merged = {}
        if isinstance(obj.data, dict):
            merged.update(obj.data)
        if isinstance(payload, dict):
            merged.update(payload)
        data = _normalize_instar(merged)
        obj.data = data
        new_name = (data.get("meta") or {}).get("projectName") or obj.name
        # 이름 바뀌었으면 slug 재발급 되도록 비워둠(모델 save()에서 생성)
        if new_name != obj.name:
                obj.name = new_name
                obj.slug = None
        obj.save(update_fields=["data", "name", "slug", "updated_at"])
        
        return JsonResponse(obj.to_response())

    if request.method == "DELETE":
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

@csrf_exempt
def upload_floor_image(request):
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

    # 프로젝트 찾기 (id → slug → name 순)
    obj = None
    if project_raw.isdigit():
        obj = Project.objects.filter(pk=int(project_raw)).first()
    if obj is None:
        obj = Project.objects.filter(slug=project_raw).first()
    if obj is None and project_raw:
        obj = Project.objects.filter(name=project_raw).order_by("-updated_at").first()

    # 프로젝트 id를 폴더명으로 사용 (없으면 'misc')
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

    # 서버에 바로 DB에 반영
    if obj:
        data = obj.data or {}
        images = data.get("images") or []
        if floor >= len(images):
            images.extend([None] * (floor + 1 - len(images)))
        images[floor] = rel_url  # 절대/상대 중 하나로 통일, 프론트에서 API_ORIGIN 붙여도 됨
        data["images"] = images
        obj.data = data
        obj.save(update_fields=["data", "updated_at"])

    return JsonResponse({"ok": True, "url": abs_url})


def project_by_name(request, name: str):
    obj = Project.objects.filter(name=name).order_by("-updated_at").first()
    if not obj:
        return JsonResponse({"error": "not found"}, status=404)
    return JsonResponse(obj.to_response())

def project_by_slug(request, slug: str):
    try:
        p = Project.objects.get(slug=slug)
    except Project.DoesNotExist:
        return HttpResponseNotFound()
    if request.method == "GET":
        return JsonResponse(p.to_response())
    return HttpResponseNotAllowed(["GET"])

def export_txt(request, pid: int):
    # (나중에 구현) node.txt 등으로 내보내기
    return JsonResponse({"detail": "Not Implemented"}, status=501)