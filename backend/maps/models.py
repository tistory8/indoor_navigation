# maps/models.py
from django.utils.text import slugify
from django.db import models

class Project(models.Model):
    """
    실내 지도 에디터의 '프로젝트' 단위.

    - 프론트엔드에서 보내주는 payload(JSON)를 통째로 data 필드에 저장한다.
    - name: 목록 검색/표시용 이름 (meta.projectName을 미러링)
    - slug: 사람이 읽기 좋은 URL 경로 (예: /editor/our-campus-1f)
    """
    
    """
    CREATE TABLE `maps_project` (
    `id` bigint NOT NULL AUTO_INCREMENT,
    `name` varchar(255) NOT NULL,
    `data` json NOT NULL,
    `slug` varchar(150) NOT NULL,
    `created_at` datetime(6) NOT NULL,
    `updated_at` datetime(6) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `slug` (`slug`),
    KEY `maps_project_name_9d345dd5` (`name`)
    ) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    """

    # 목록 조회/검색을 위해 name 별도 보관 (meta.projectName 미러링)
    name = models.CharField(max_length=255, db_index=True)
    
    # 전체 프로젝트 상태를 그대로 JSON으로 보관
    #   예: {
    #       "meta": {...},
    #       "nodes": {...},
    #       "connections": {...},
    #       "images": [...],
    #       ...
    #      }
    data = models.JSONField()
    
    # slug: URL에 쓰이는 짧은 문자열 (유니크)
    #  - 비워두면 save()에서 name 기반으로 자동 생성    
    slug = models.SlugField(max_length=150, unique=True, blank=True)
    
    # 생성/수정 시각 자동 저장
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
   

    def _make_unique_slug(self, base):
        """
        base 문자열로부터 slug를 만들고,
        이미 동일 slug가 있으면 -2, -3 ... 을 붙여서 유니크하게 만든다.

        예)
          base = "우리학교 1층"
          -> "uri-hakgyo-1ceung"
          -> 이미 있으면 "uri-hakgyo-1ceung-2", "uri-hakgyo-1ceung-3" ...
        """
        # 한글/공백 등을 slugify로 안전한 문자열로 변환
        s = slugify(base or "untitled")
        if not s:
            s = "untitled"

        cand, i = s, 2
        # 본인(pk) 제외하고 동일 slug가 있는지 검사
        while Project.objects.filter(slug=cand).exclude(pk=self.pk).exists():
            cand = f"{s}-{i}"
            i += 1
        return cand

    def save(self, *args, **kwargs):
        """
        저장 시 name과 slug를 적절히 보정한다.

        - data.meta.projectName 이 있으면 그 값을 name에 반영
          (단, '새 프로젝트', 'Untitled' 같은 기본 이름은 무시)
        - name이 비어 있을 경우 최종 fallback으로 meta.projectName 또는 'Untitled' 사용
        - slug가 비어 있을 경우 name 기반으로 유니크 slug 생성
        """
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

        # slug가 아직 없으면 name 기반으로 생성
        if not self.slug:
            self.slug = self._make_unique_slug(self.name)
        
        # 실제 DB 저장
        super().save(*args, **kwargs)

    def to_response(self) -> dict:
        """
        API 응답용 헬퍼.

        - DB에 저장된 data(JSON)에 id, slug를 덧붙여서 반환한다.
        - 프론트에서 하나의 JSON으로 받기 편하도록 묶어주는 용도.
        """
        obj = dict(self.data) if isinstance(self.data, dict) else {}
        obj["id"] = self.id
        obj["slug"] = self.slug
        return obj
    
    class Meta:
        # 필요하다면 기존 테이블에 맞추기 위해 managed/db_table 옵션을 열어둘 수 있음
        # (현재는 Django 기본 동작 그대로 사용)
        # managed = False
        # db_table = "project"
        pass
        
    def __str__(self):
        # admin 등에서 객체를 문자열로 표시할 때 사용
        return f"{self.id}: {self.name}"
