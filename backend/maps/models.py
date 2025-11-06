# maps/models.py
from django.db import models

class Project(models.Model):
    # 목록 조회/검색을 위해 name 별도 보관 (meta.projectName 미러링)
    name = models.CharField(max_length=255, db_index=True)
    # 프런트 payload(Instar 포맷)를 그대로 저장
    """
    {
        "meta": { "projectName": "test1", "projectAuthor": "" },
        "scale": 0.33167,
        "nodes": {},
        "connections": {},
        "special_points": {},
        "north_reference": null,
        "images": [null, null, null],
        "startFloor": 1
    }
    """
    data = models.JSONField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def to_response(self) -> dict:
        """API 응답용: data + id 를 합쳐 돌려준다."""
        obj = dict(self.data) if isinstance(self.data, dict) else {}
        obj["id"] = self.id
        return obj

    def __str__(self):
        return f"{self.id}: {self.name}"
