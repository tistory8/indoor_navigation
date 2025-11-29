"""
Django WSGI 설정 파일.

- WSGI(Web Server Gateway Interface)는 전통적인 동기 웹 서버
  (예: gunicorn, uWSGI, mod_wsgi 등)에서 Django 앱을 실행할 때 사용하는 인터페이스이다.
- 이 파일에서 생성한 `application` 객체를 서버가 import하여 사용한다.
"""

import os
from django.core.wsgi import get_wsgi_application

# DJANGO_SETTINGS_MODULE 환경변수 기본값 설정
# 운영 환경에서 다른 설정 모듈을 쓰고 싶으면
# 서버 설정에서 이 값을 덮어쓸 수 있다.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# 실제 WSGI application 객체 생성
# gunicorn, uWSGI 등이 이 객체를 통해 요청을 Django에 전달한다.
application = get_wsgi_application()
