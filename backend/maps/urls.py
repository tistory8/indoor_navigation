# maps/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('ping/', views.ping),

    # Instar 포맷 프로젝트 CRUD (프론트 payload 그대로)
    path('projects/', views.projects),              # GET(list), POST(create)
    path('projects/<int:pid>/', views.project_id),  # GET, PUT/PATCH, DELETE

    # Export (자리만)
    path('projects/<int:pid>/export_txt/', views.export_txt),
]
