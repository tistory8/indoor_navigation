# maps/apps.py
"""
Django 앱 설정 모듈.

- Django가 이 앱을 인식하도록 하는 설정 클래스(MapsConfig)를 정의한다.
- INSTALLED_APPS에 'maps.apps.MapsConfig' 또는 'maps' 로 등록해서 사용.
"""

from django.apps import AppConfig

class MapsConfig(AppConfig):
    """
    실내 지도 에디터용 'maps' 앱 설정.

    - default_auto_field: 기본 PK 타입 (BigAutoField 사용)
    - name: 앱의 Python 경로 (settings INSTALLED_APPS와 매칭)
    """    
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'maps'

    def ready(self):
        """
        앱이 로딩될 때 한 번 호출되는 훅(hook).

        - 개발 단계에서 서버가 제대로 maps 앱을 로딩했는지
          콘솔에 간단한 로그를 출력하는 용도로 사용.
        - 운영환경에서는 불필요하면 지워도 무방하다.
        """
        print('{"ok": true}  # maps app ready')