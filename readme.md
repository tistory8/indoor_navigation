# 초기 세팅 (initialize settings)

## packge install

```bash
pip install django django-cors-headers mysqlclient
```

---

## 백엔드 설정 (django)

```bash
cd ~/gilmin/MapEditor/backend
python manage.py runserver
```

---

## 프론트엔드 설정 (web)

```bash
mkvirtualenv mapeditor python3.12
workon mapeditor
```

```bash
cd ~/gilmin/MapEditor/frontend
python serve.py
```

완료되면 `127.0.0.1:5151` 접속


- 작동 확인

```bash
curl -s http://127.0.0.1:8000/api/ping/
```

- {"ok": true} 출력되면 정상 작동


---
---

# migrations

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```


```bash
python manage.py runserver
```

- data 확인

1. 새로 만들기 -> 프로젝트 생성
2. python manage.py shell
3. 
   ```bash
    >>> from maps.models import Project
    >>> Project.objects.all().values("id", "name", "updated_at", "data")
    <QuerySet [{'id': 1, 'name': '새 프로젝트', 'updated_at': datetime.datetime(2025, 11, 6, 13, 57, 38, 583527)}]>
   ```
4. 노드 생성 후 저장 버튼 클릭
5. (3) 다시 실행
   ```bash
   >>> Project.objects.all().values("id", "name", "updated_at", "data")
   <[{'id': 4, 
   'name': 'test_1106', 
   'updated_at': datetime.datetime(2025, 11, 6, 14, 10, 59, 306930), 
   'data': 
   {'meta': {'projectName': 'test_1106', 'projectAuthor': ''}, 
   'scale': 0.33167, 
   'nodes': {'N_0': {'x': 220, 'y': 119}, 'N_1': {'x': 717, 'y': 409}, 'N_2': {'x': 406, 'y': 520}, 'N_3': {'x': 676, 'y': 158}}, 
   'connections': {}, 
   'special_points': {}, 
   'north_reference': {'from_node': None, 'to_node': None, 'azimuth': 0.0}, 
   'images': {'0': 'instar2_1f.png', '1': None, '2': None, '3': None}, 
   'startFloor': 0}}]>
   ```
