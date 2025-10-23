import json
from django.http import JsonResponse, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt

# ===== In-memory store (서버 재시작 시 초기화됨) =====
STORE = {
    "seq": 1,          # auto-increment project id
    "projects": {},    # id -> project(json)
}

def ping(request):
    return JsonResponse({"ok": True})

# 유효성 간단 체크(필요 최소 필드만)
def normalize_project(data: dict):
    name = data.get("name", "새 프로젝트")
    floors = int(data.get("floors", 4))
    startFloor = int(data.get("startFloor", data.get("start_floor", 1)))
    scale = float(data.get("scale", 0.33167))
    currentFloor = int(data.get("currentFloor", startFloor))
    floorData = data.get("floorData", [])
    # floorData가 없으면 기본 생성
    if not floorData:
        floorData = [ {"bg": None, "nodes": [], "links": [], "arrows": [], "polygons": [], "rects": [], "startPoint": None}
                      for _ in range(floors) ]
    modified = bool(data.get("modified", False))
    return {
        "name": name,
        "floors": floors,
        "startFloor": startFloor,
        "scale": scale,
        "currentFloor": currentFloor,
        "floorData": floorData,
        "modified": modified,
    }

@csrf_exempt
def projects(request):
    if request.method == "GET":
        # 전체 프로젝트 목록
        return JsonResponse(list(STORE["projects"].values()), safe=False)

    if request.method == "POST":
        # body 전체를 프로젝트 JSON으로 간주(없으면 기본 생성)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        proj = normalize_project(payload)
        pid = STORE["seq"]; STORE["seq"] += 1
        proj["id"] = pid
        STORE["projects"][pid] = proj
        return JsonResponse(proj, status=201)

    return HttpResponseNotAllowed(["GET", "POST"])

@csrf_exempt
def project_id(request, pid: int):
    proj = STORE["projects"].get(pid)
    if not proj:
        return JsonResponse({"error": "not found"}, status=404)

    if request.method == "GET":
        return JsonResponse(proj)

    if request.method in ["PUT", "PATCH"]:
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        updated = normalize_project({**proj, **payload})
        updated["id"] = pid
        STORE["projects"][pid] = updated
        return JsonResponse(updated)

    if request.method == "DELETE":
        del STORE["projects"][pid]
        return JsonResponse({"ok": True})

    return HttpResponseNotAllowed(["GET", "PUT", "PATCH", "DELETE"])

# --- Export 자리 (나중에 구현) ---
def export_txt(request, pid: int):
    # 여기서는 아직 미구현
    return JsonResponse({"detail": "Not Implemented in A-plan"}, status=501)
