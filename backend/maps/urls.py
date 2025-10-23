from django.urls import path
from . import views

urlpatterns = [
    path('ping/', views.ping),

    # 메모리 기반 프로젝트 CRUD
    path('projects/', views.projects),              # GET(list), POST(create)
    path('projects/<int:pid>/', views.project_id),  # GET, PUT/PATCH, DELETE

    # (선택) Export 자리
    path('projects/<int:pid>/export_txt/', views.export_txt),
]
