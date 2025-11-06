# maps/models.py
from django.utils.text import slugify
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
    slug = models.SlugField(max_length=150, unique=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def _make_unique_slug(self, base):
        s = slugify(base or "untitled")
        if not s:
            s = "untitled"
        cand, i = s, 2
        while Project.objects.filter(slug=cand).exclude(pk=self.pk).exists():
            cand = f"{s}-{i}"
            i += 1
        return cand

    def save(self, *args, **kwargs):
        # 이름은 meta.projectName과 동기화될 수 있으니, 비었으면 data에서 보완
        # models.py (save 안의 name 동기화 부분)
        meta = {}
        if isinstance(self.data, dict):
            meta = self.data.get("meta") or {}
        incoming = (meta.get("projectName") or "").strip()

        # 1) 들어온 이름이 '실제 값'일 때만 name 동기화
        if incoming:
            # '새 프로젝트' 같이 초기 기본문구는 무시하고, 진짜 바꾸려는 이름만 반영
            if incoming not in ("새 프로젝트", "Untitled"):
                self.name = incoming

        # 2) name이 여전히 비어 있으면 마지막 보루
        if not self.name:
            self.name = incoming or "Untitled"

        if not self.slug:
            self.slug = self._make_unique_slug(self.name)
        super().save(*args, **kwargs)

    def to_response(self) -> dict:
        """API 응답용: data + id 를 합쳐 돌려준다."""
        obj = dict(self.data) if isinstance(self.data, dict) else {}
        obj["id"] = self.id
        obj["slug"] = self.slug
        return obj

    def __str__(self):
        return f"{self.id}: {self.name}"
