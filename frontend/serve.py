import http.server
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver

# ---------------------------------------------------------------------------
# 간단한 개발용 정적 웹 서버 스크립트
#
# - python serve.py 로 실행하면
#   현재 폴더(그리고 하위 폴더)의 정적 파일들을  http://localhost:5151  에서 서비스
# - index.html, editor.html, js, css, 이미지 등 프론트 파일 테스트 용도
# ---------------------------------------------------------------------------

# 사용할 포트 번호 (필요하면 5500, 5501 등으로 변경해서 사용)
PORT = 5050

# 기본 SimpleHTTPRequestHandler 사용
# - GET /index.html, GET /js/editor.js 같은 정적 파일을 자동으로 서빙
Handler = http.server.SimpleHTTPRequestHandler

# MIME 타입 매핑 확장
# - 브라우저가 파일을 올바른 타입으로 인식하도록 도와줌
Handler.extensions_map = {
    ".manifest": "text/cache-manifest",
    ".html": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".svg": "image/svg+xml",
    ".css": "text/css",
    ".js": "text/javascript",
    ".module.js": "module",  # ES module 용 확장자가 필요할 때
    "": "application/octet-stream",  # 기본값 (알 수 없는 확장자)
}

# TCP 서버 생성: ('', PORT) → 모든 인터페이스에서 PORT 수신
httpd = socketserver.TCPServer(("", PORT), Handler)

print("serving at port", PORT)

# Ctrl+C 로 중단할 때까지 무한 루프
httpd.serve_forever()
