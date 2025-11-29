"""
Django ASGI 설정 파일.

- ASGI(Asynchronous Server Gateway Interface)는 비동기 서버/프로토콜
  (예: uvicorn, daphne 등)에서 Django 앱을 실행할 때 진입점(entrypoint)이 되는 모듈이다.
- 이 파일에서 `application` 객체를 만들어 서버가 import해서 사용한다.
"""

import os
from django.core.asgi import get_asgi_application

# DJANGO_SETTINGS_MODULE 환경변수가 없을 경우 기본값으로
# 'config.settings' 모듈을 사용하도록 설정한다.
# (manage.py와 wsgi.py에서도 동일한 설정을 사용)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


# 실제 ASGI application 객체 생성
# 비동기 서버(uvicorn 등)가 이 객체를 통해 요청을 Django에 전달한다.
application = get_asgi_application()
