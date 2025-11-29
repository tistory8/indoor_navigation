"""
Django 프로젝트 전역 설정 파일.

- 개발용 설정 기준 (DEBUG=True)
- DB: MySQL (MapEditor 스키마)
- CORS: 모든 오리진 허용 (프론트엔드가 다른 포트/도메인에서 접근 가능하도록)
- 미디어 파일: /media/ 하위에 floor_images 등 저장
"""

from pathlib import Path

# BASE_DIR: 프로젝트 루트 경로 (config/ 상위 디렉터리)
BASE_DIR = Path(__file__).resolve().parent.parent

# 개발용 시크릿 키 (운영환경에서는 반드시 환경변수 등으로 분리)
SECRET_KEY = 'dev-secret-key'

# DEBUG 모드
# - True: 자세한 에러 페이지 / static, media 개발 서버에서 서빙
# - False: 운영 모드 (오류 페이지, 보안 설정 등 달라짐)
DEBUG = True

# Django가 응답을 허용할 호스트 목록
# 개발용으로는 모두 허용('*'), 운영에서는 반드시 도메인만 명시해야 한다.
ALLOWED_HOSTS = ['*']

# 설치된 앱 목록
INSTALLED_APPS = [
    # Django 기본 앱들
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 3rd party
    'corsheaders', # CORS(다른 도메인/포트에서 오는 요청) 허용을 위한 패키지
    # local
    'maps', # 실내 지도 에디터 기능을 담당하는 앱
]

# 요청이 들어올 때마다 순차적으로 거치는 미들웨어들
MIDDLEWARE = [
    # CORS 설정이 가장 먼저 적용되도록 최상단에 배치
    'corsheaders.middleware.CorsMiddleware',
    
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    
    # 프론트엔드가 다른 포트(예: 5500)에서 올 경우
    # CSRF가 막힐 수 있어서, 필요한 뷰에는 @csrf_exempt 데코레이터를 사용함.
    'django.middleware.csrf.CsrfViewMiddleware',
    
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]

# 최상위 URLconf 모듈 (config/urls.py)
ROOT_URLCONF = 'config.urls'

# 템플릿 설정
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        
        # 프로젝트 전역 템플릿 디렉터리 목록
        'DIRS': [],
        
        # 앱 내부의 templates/ 디렉터리를 자동으로 탐색할지 여부
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                # 디버그 정보
                'django.template.context_processors.debug',
                # 현재 request 객체 템플릿에서 사용 가능
                'django.template.context_processors.request',
                # 인증 정보(user 등)
                'django.contrib.auth.context_processors.auth',
                # 메시지 프레임워크
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# WSGI / ASGI 애플리케이션 경로
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# 데이터베이스 설정 (MySQL)
DATABASES = {
    "default": {
        # Django MySQL 백엔드
        "ENGINE": "django.db.backends.mysql",
        # DB 스키마 이름 (MapEditor)
        "NAME": "MapEditor",
        # 접속 계정 정보
        "USER": "root",
        "PASSWORD": "123456789",
        "HOST": "127.0.0.1",
        "PORT": "3306",
    }
}

# 정적 파일(static) 기본 URL 경로
# 예: /static/css/..., /static/js/...
STATIC_URL = '/static/'


# ───────────── CORS 설정 ─────────────

# 개발 단계에서 모든 오리진의 요청 허용
# (프론트엔드를 다른 포트에서 띄울 때 편리)
# 운영 환경에서는 필요한 도메인만 허용하도록 변경하는 것이 안전하다.
CORS_ALLOW_ALL_ORIGINS = True

# ───────────── 미디어 파일 설정 ─────────────

# 업로드된 파일이 서비스 상에서 접근될 때의 URL prefix
# 예: /media/floor_images/1/0_1f.png
MEDIA_URL = '/media/'

# 실제 파일이 저장될 서버 내부 경로
# 예: <프로젝트루트>/media/floor_images/...
MEDIA_ROOT = BASE_DIR / 'media'