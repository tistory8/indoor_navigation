# maps/urls.py
"""
maps 앱의 URL 라우팅 설정.

실내 지도 에디터의 모든 API 및 페이지 라우트가 이 파일을 통해 연결된다.

크게 3가지 영역:
1) HTML 페이지 렌더링 (프로젝트 목록, 에디터)
2) 프로젝트 API (CRUD)
3) 이미지 업로드 (층 이미지)
"""
from django.urls import path
from . import views

urlpatterns = [
    # -------------------------
    # HTML 페이지 라우트
    # -------------------------   
    # /maps/ 로 들어왔을 때 프로젝트 목록 페이지(index.html)를 보여준다.
    # (템플릿: maps/index.html) 
    path('', views.projects_home, name="projects_home"),

    # 에디터 페이지 접근 URL.
    # 예: /editor/school-1f
    # 프론트에서 slug를 이용해 해당 프로젝트 데이터를 /api에서 불러온다.
    path('editor/<slug:slug>', views.editor_page, name='editor_by_slug'),
    
    # -------------------------
    # 헬스 체크
    # -------------------------
    # 단순 서버 작동 확인(Ping)용 API.
    # 응답: {"ok": true}        
    path('ping/', views.ping),


    # -------------------------
    # 프로젝트 CRUD API
    # -------------------------
    # 프로젝트 목록 조회(GET) + 새 프로젝트 생성(POST)
    # GET  /projects/  → 프로젝트 목록 반환
    # POST /projects/  → 새 프로젝트 생성    
    path('projects/', views.projects),              # GET(list), POST(create)
    
    # 특정 프로젝트 조회 / 수정 / 삭제
    # GET    /projects/<id>/ → 단일 프로젝트 조회
    # PUT    /projects/<id>/ → 전체 갱신
    # PATCH  /projects/<id>/ → 부분 갱신
    # DELETE /projects/<id>/ → 삭제    
    path('projects/<int:pid>/', views.project_id),
    
    # -------------------------
    # slug 기반 프로젝트 조회
    # -------------------------   
    # slug로 프로젝트를 조회하기 위한 엔드포인트.
    # slug는 유니크이므로 한 개만 반환.
    # 사용 예: /projects/slug/our-campus/     
    path("projects/slug/<slug:slug>/", views.project_by_slug, name="project_by_slug"),

    # -------------------------
    # 이름 기반 프로젝트 조회
    # (백업용 또는 레거시 용도)
    # -------------------------
    # 프로젝트 이름(name)으로 조회.
    # 이름이 같은 프로젝트가 여러 개일 수 있으므로
    # updated_at 기준 가장 최근 프로젝트를 반환한다.    
    path('api/projects/by-name/<str:name>/', views.project_by_name),
    
    # -------------------------
    # 층 이미지 업로드 API
    # -------------------------    
    path("upload_floor_image/", views.upload_floor_image, name="upload_floor_image"),
    # 층별 배경 이미지 업로드 엔드포인트.

    # form-data:
    #     - file   : 이미지 파일
    #     - project: id / slug / name 중 하나
    #     - floor  : 층 번호(int)

    # 업로드 후 Project.data.images[floor]에 URL이 자동 반영된다.
]