#!/usr/bin/env python3
"""
本機 yt-dlp 代理伺服器 — 供 Podcast 轉文字稿使用
啟動後在 http://localhost:8765 提供音訊串流服務
"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import time
import threading
import urllib.request
import urllib.error
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs, quote

url_cache = {}
cache_lock = threading.Lock()
CACHE_TTL = 300  # 5 分鐘快取

def get_audio_url(yt_url):
    with cache_lock:
        cached = url_cache.get(yt_url)
        if cached and time.time() - cached[1] < CACHE_TTL:
            print(f'  [快取] {yt_url[:60]}')
            return cached[0]

    print(f'  [yt-dlp] 解析中... {yt_url[:60]}')
    result = subprocess.run(
        [sys.executable, '-m', 'yt_dlp',
         '-f', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
         '--get-url', '--no-playlist',
         '--quiet', yt_url],
        capture_output=True, text=True, timeout=40
    )

    if result.returncode != 0:
        err = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'yt-dlp 執行失敗'
        raise RuntimeError(err)

    direct_url = result.stdout.strip().split('\n')[0]
    if not direct_url:
        raise RuntimeError('yt-dlp 未回傳音訊網址')

    print(f'  [yt-dlp] 解析成功')
    with cache_lock:
        url_cache[yt_url] = (direct_url, time.time())

    return direct_url


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 關閉預設 log

    def cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Access-Control-Expose-Headers',
                         'Content-Length, Content-Range, Accept-Ranges')

    def do_OPTIONS(self):
        self.send_response(200)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # ── /ping — 存活檢查 ──
        if parsed.path == '/ping':
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # ── /audio?url=YOUTUBE_URL — 音訊代理 ──
        if parsed.path == '/audio':
            yt_url = params.get('url', [''])[0]
            if not yt_url:
                self.send_error(400, 'Missing url parameter')
                return

            try:
                direct_url = get_audio_url(yt_url)
            except Exception as e:
                body = json.dumps({'error': str(e)}).encode()
                self.send_response(500)
                self.cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # 轉發 Range header（支援分段下載）
            req_headers = {
                'User-Agent': 'Mozilla/5.0 (compatible)',
                'Accept': '*/*',
            }
            range_val = self.headers.get('Range')
            if range_val:
                req_headers['Range'] = range_val

            try:
                req = urllib.request.Request(direct_url, headers=req_headers)
                with urllib.request.urlopen(req, timeout=60) as resp:
                    status = resp.status
                    self.send_response(status)
                    self.cors_headers()
                    for hdr in ('Content-Type', 'Content-Length',
                                'Content-Range', 'Accept-Ranges'):
                        val = resp.headers.get(hdr)
                        if val:
                            self.send_header(hdr, val)
                    self.end_headers()
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # 瀏覽器關閉連線
            except urllib.error.HTTPError as e:
                try:
                    self.send_error(e.code, str(e))
                except Exception:
                    pass
            except Exception as e:
                try:
                    self.send_error(502, str(e))
                except Exception:
                    pass
            return

        self.send_error(404)


class ThreadedServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def check_yt_dlp():
    try:
        r = subprocess.run([sys.executable, '-m', 'yt_dlp', '--version'],
                           capture_output=True, text=True)
        return r.returncode == 0, r.stdout.strip()
    except Exception:
        return False, ''


def install_yt_dlp():
    print('正在安裝 yt-dlp...')
    result = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', 'yt-dlp'],
        capture_output=True, text=True
    )
    return result.returncode == 0


if __name__ == '__main__':
    print('=' * 50)
    print(' Podcast 轉文字稿 — YouTube 本機代理')
    print('=' * 50)

    ok, ver = check_yt_dlp()
    if not ok:
        print('yt-dlp 未安裝，自動安裝中...')
        if install_yt_dlp():
            ok, ver = check_yt_dlp()

    if not ok:
        print('\n[錯誤] yt-dlp 安裝失敗，請手動執行：')
        print('   pip install yt-dlp')
        input('按 Enter 關閉...')
        sys.exit(1)

    print(f'[OK] yt-dlp {ver}')

    port = 8765
    try:
        server = ThreadedServer(('localhost', port), ProxyHandler)
    except OSError:
        print(f'\n[錯誤] Port {port} 已被佔用，請關閉其他同名程式後重試')
        input('按 Enter 關閉...')
        sys.exit(1)

    print(f'[OK] 代理伺服器已啟動：http://localhost:{port}')
    print()
    print('>>> 現在可以回到 podcast 網頁貼上 YouTube 連結了！')
    print('>>> 按 Ctrl+C 可停止伺服器')
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
