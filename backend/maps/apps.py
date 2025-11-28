from django.apps import AppConfig

class MapsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'maps'

    def ready(self):
        # 서버 기동 시 1번만 표시 (개발 확인용)
        print('{"ok": true}  # maps app ready')