# maps/admin.py
"""
Django 관리자(admin) 사이트 설정.

- Project 모델을 관리자 페이지에서 조회/검색할 수 있도록 등록한다.
"""
from django.contrib import admin
from .models import Project

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    """
    Project 모델에 대한 관리자 화면 설정.

    - list_display : 목록 화면에서 보여줄 컬럼들
    - search_fields: 우측 상단 검색창에서 검색할 필드들
    - ordering     : 기본 정렬 기준 (최근 수정된 프로젝트가 위로 오도록 -updated_at)
    """
    
    # 목록에 보일 컬럼 (ID, 이름, 마지막 수정일)
    list_display = ("id", "name", "updated_at")
    
    # 이름으로 검색 가능
    search_fields = ("name",)
    
    # 최근 수정 순으로 정렬
    ordering = ("-updated_at",)
