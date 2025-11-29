#!/usr/bin/env python
"""
Django 프로젝트용 manage.py

- 로컬 개발에서 가장 많이 사용하는 진입점 스크립트.
  예: 
    python manage.py runserver
    python manage.py makemigrations
    python manage.py migrate
    python manage.py createsuperuser
  등 모든 manage 명령이 여기에서 시작된다.
"""

import os
import sys

def main():
    """
    Django 관리 커맨드 실행 함수.

    1) DJANGO_SETTINGS_MODULE 환경변수를 'config.settings'로 설정하고
    2) django.core.management.execute_from_command_line()에
       현재 명령행 인자(sys.argv)를 넘겨서 실제 명령을 실행한다.
    """
    # settings 모듈 기본값 설정
    # (서버나 OS 환경변수에서 이미 지정해줬으면 그 값을 사용)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        # Django 내부 관리 명령 실행 함수 import
        from django.core.management import execute_from_command_line
    # Django가 설치되어 있지 않거나, 가상환경 문제일 경우 여기로 떨어진다.
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Make sure it's installed and available on your PYTHONPATH."
        ) from exc
        
    # 실제로 명령어 실행 (예: runserver, migrate 등)
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    # 이 파일을 스크립트로 직접 실행했을 때만 main()을 호출
    main()
