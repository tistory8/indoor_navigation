# maps/views.py
import json
from copy import deepcopy
from django.http import JsonResponse, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt
from .models import Project

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

    # special_points (선택)
    if "special_points" in data and not isinstance(data["special_points"], dict):
        data["special_points"] = {}

    # north_reference (선택)
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
            out.append({"id": p.id, "name": p.name})
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
        obj.name = (data.get("meta") or {}).get("projectName") or obj.name
        obj.save(update_fields=["data", "name", "updated_at"])
        return JsonResponse(obj.to_response())

    if request.method == "DELETE":
        obj.delete()
        return JsonResponse({"ok": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])

def export_txt(request, pid: int):
    # (나중에 구현) node.txt 등으로 내보내기
    return JsonResponse({"detail": "Not Implemented"}, status=501)


# # maps/views.py
# import json
# from copy import deepcopy
# from django.http import JsonResponse, HttpResponseNotAllowed
# from django.views.decorators.csrf import csrf_exempt

# # ===== In-memory store (개발용: 서버 재시작 시 초기화) =====
# STORE = {
#     "seq": 1,           # auto-increment project id
#     "projects": {},     # id -> instar json (그대로 저장)
# }

# def ping(request):
#     return JsonResponse({"ok": True})

# def _normalize_instar(payload: dict) -> dict:
#     """프론트(app.js)가 만드는 Instar 포맷을 그대로 존중하면서
#     최소한의 기본값만 보충."""
#     data = deepcopy(payload) if isinstance(payload, dict) else {}

#     # meta
#     meta = data.get("meta") or {}
#     if not isinstance(meta, dict):
#         meta = {}
#     meta.setdefault("projectName", "새 프로젝트")
#     meta.setdefault("projectAuthor", "")
#     data["meta"] = meta

#     # scale
#     try:
#         data["scale"] = float(data.get("scale", 0))
#     except Exception:
#         data["scale"] = 0.0

#     # nodes (객체)
#     if not isinstance(data.get("nodes"), dict):
#         data["nodes"] = {}

#     # connections (객체)
#     if not isinstance(data.get("connections"), dict):
#         data["connections"] = {}

#     # special_points (선택)
#     if "special_points" in data and not isinstance(data["special_points"], dict):
#         data["special_points"] = {}

#     # north_reference (선택)
#     nr = data.get("north_reference")
#     if isinstance(nr, dict):
#         out = {
#             "from_node": nr.get("from_node") or None,
#             "to_node": nr.get("to_node") or None,
#             "azimuth": float(nr.get("azimuth") or 0),
#         }
#         data["north_reference"] = out
#     elif nr is not None:
#         # 형식이 이상하면 제거
#         data.pop("north_reference", None)

#     # images: 배열/객체 모두 허용 (app.js는 배열로 저장)
#     imgs = data.get("images")
#     if imgs is None:
#         data["images"] = []
#     else:
#         # 리스트/딕셔너리 외는 초기화
#         if not isinstance(imgs, (list, dict)):
#             data["images"] = []

#     return data

# @csrf_exempt
# def projects(request):
#     """
#     GET  /api/projects/            -> 전체 목록(id, meta.projectName 정도)
#     POST /api/projects/            -> Instar JSON 그대로 생성 저장, {id, ...} 반환
#     """
#     if request.method == "GET":
#         out = []
#         for pid, proj in STORE["projects"].items():
#             name = (proj.get("meta") or {}).get("projectName") or "새 프로젝트"
#             out.append({"id": pid, "name": name})
#         return JsonResponse(out, safe=False)

#     if request.method == "POST":
#         try:
#             payload = json.loads(request.body.decode("utf-8") or "{}")
#         except Exception:
#             payload = {}
#         proj = _normalize_instar(payload)
#         pid = STORE["seq"]; STORE["seq"] += 1
#         proj["id"] = pid
#         STORE["projects"][pid] = proj
#         return JsonResponse(proj, status=201)

#     return HttpResponseNotAllowed(["GET", "POST"])

# @csrf_exempt
# def project_id(request, pid: int):
#     """
#     GET    /api/projects/<pid>/    -> Instar JSON 반환
#     PUT    /api/projects/<pid>/    -> Instar JSON 업데이트
#     PATCH  /api/projects/<pid>/    -> 동일 (부분 업데이트 용도로 써도 됨)
#     DELETE /api/projects/<pid>/    -> 삭제
#     """
#     proj = STORE["projects"].get(pid)
#     if not proj:
#         return JsonResponse({"error": "not found"}, status=404)

#     if request.method == "GET":
#         return JsonResponse(proj)

#     if request.method in ["PUT", "PATCH"]:
#         try:
#             payload = json.loads(request.body.decode("utf-8") or "{}")
#         except Exception:
#             payload = {}
#         updated = _normalize_instar({**proj, **payload})
#         updated["id"] = pid
#         STORE["projects"][pid] = updated
#         return JsonResponse(updated)

#     if request.method == "DELETE":
#         del STORE["projects"][pid]
#         return JsonResponse({"ok": True})

#     return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])

# def export_txt(request, pid: int):
#     # (나중에 구현) node.txt 등으로 내보내기
#     return JsonResponse({"detail": "Not Implemented"}, status=501)
