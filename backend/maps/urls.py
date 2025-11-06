# maps/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('', views.projects_home, name="projects_home"),
    path('editor/<slug:slug>', views.editor_page, name='editor_by_slug'),
    
    path('ping/', views.ping),

    # 프로젝트 CRUD (프론트 payload 그대로)
    path('projects/', views.projects),              # GET(list), POST(create)
    path('projects/<int:pid>/', views.project_id),  # GET, PUT/PATCH, DELETE
    path("projects/slug/<slug:slug>/", views.project_by_slug, name="project_by_slug"),

    path('api/projects/by-name/<str:name>/', views.project_by_name),  # name으로 조회
    path("upload_floor_image/", views.upload_floor_image, name="upload_floor_image"),
]