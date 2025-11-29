"""
프로젝트 전역 URL 라우팅 설정.

- 여기서 각 앱(maps 등)의 URL 구성을 include 시킨다.
- /admin/ : Django 기본 관리자 페이지
- /api/   : maps 앱에서 제공하는 API 엔드포인트(prefix: /api/)
- DEBUG 모드일 때만 media 파일을 개발용으로 서빙한다.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


# 최상위 URL 패턴 리스트
urlpatterns = [
    # Django 기본 admin 사이트 [아직 구현 X]
    path('admin/', admin.site.urls),
    
    # /api/ 이하 URL은 maps.urls에서 처리
    # 예: /api/projects/, /api/projects/<id>/ 등    
    path('api/', include('maps.urls')),
]

# 개발 환경(DEBUG=True)일 때만,
# MEDIA_URL(/media/)로 들어오는 요청을 Django가 직접 파일로 서빙해 준다.
# 운영 환경에서는 nginx 등의 웹 서버가 /media/ 경로를 처리하는 것이 일반적이다.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)