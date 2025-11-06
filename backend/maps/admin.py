# maps/admin.py
from django.contrib import admin
from .models import Project

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "updated_at")
    search_fields = ("name",)
    ordering = ("-updated_at",)
