# 초기 세팅 (initialize settings)

## 백엔드 설정 (django)

```bash
cd ~/MapEditor/backend
python manage.py runserver
```

---

## 프론트엔드 설정 (web)

```bash
cd ~/MapEditor/frontend
python -m http.server 5500
```

완료되면 `127.0.0.1:5500` 접속


- 작동 확인

```bash
curl -s http://127.0.0.1:8000/api/ping/
```

- {"ok": true} 출력되면 정상 작동


---
---

# django migrations


- Django의 DB 테이블 생성


```bash
cd backend
python manage.py makemigrations maps
python manage.py migrate 
```

- django 실행

```bash
python manage.py runserver
```

- 확인

1. 새로 만들기 -> 프로젝트 생성
2. python manage.py shell
3. 
   ```bash
    >>> from maps.models import Project
    >>> Project.objects.all().values("id", "name", "updated_at")
    <QuerySet [{'id': 1, 'name': '새 프로젝트', 'updated_at': datetime.datetime(2025, 11, 6, 13, 57, 38, 583527)}]>
   ```
