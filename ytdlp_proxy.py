#!/usr/bin/env python3
"""
Podcast 轉文字稿 — YouTube 本機代理伺服器
啟動後在 http://localhost:8765 提供音訊串流服務
"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import time
import threading
import tempfile
import os
import urllib.request
import urllib.error
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs

# ── ffmpeg (bundled via imageio-ffmpeg) ──
try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
    HAS_FFMPEG = True
except Exception:
    FFMPEG_EXE = 'ffmpeg'
    HAS_FFMPEG = False

url_cache = {}
duration_cache = {}
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


def get_duration_secs(yt_url):
    with cache_lock:
        cached = duration_cache.get(yt_url)
        if cached and time.time() - cached[1] < CACHE_TTL:
            return cached[0]

    print(f'  [yt-dlp] 取得時長... {yt_url[:60]}')
    result = subprocess.run(
        [sys.executable, '-m', 'yt_dlp',
         '--print', 'duration',
         '--no-playlist', '--quiet', yt_url],
        capture_output=True, text=True, timeout=40
    )

    if result.returncode != 0 or not result.stdout.strip():
        return None

    try:
        duration = float(result.stdout.strip().split('\n')[0])
        with cache_lock:
            duration_cache[yt_url] = (duration, time.time())
        return duration
    except ValueError:
        return None


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

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # ── /ping — 存活檢查 ──
        if parsed.path == '/ping':
            self.send_json(200, {'status': 'ok', 'ffmpeg': HAS_FFMPEG})
            return

        # ── /info?url=YOUTUBE_URL — 取得影片時長 ──
        if parsed.path == '/info':
            yt_url = params.get('url', [''])[0]
            if not yt_url:
                self.send_error(400, 'Missing url parameter')
                return
            try:
                duration = get_duration_secs(yt_url)
                self.send_json(200, {'duration': duration, 'ffmpeg': HAS_FFMPEG})
            except Exception as e:
                self.send_json(500, {'error': str(e)})
            return

        # ── /segment?url=YOUTUBE_URL&start=S&end=E — 擷取時間區段 (MP3) ──
        if parsed.path == '/segment':
            yt_url = params.get('url', [''])[0]
            if not yt_url:
                self.send_error(400, 'Missing url parameter')
                return
            if not HAS_FFMPEG:
                self.send_json(500, {'error': 'ffmpeg 未安裝，請執行：pip install imageio-ffmpeg'})
                return

            try:
                start = float(params.get('start', ['0'])[0])
                end = float(params.get('end', ['480'])[0])
            except ValueError:
                self.send_error(400, 'start/end must be numbers')
                return

            try:
                direct_url = get_audio_url(yt_url)
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

            print(f'  [ffmpeg] 擷取 {start:.0f}s - {end:.0f}s')
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
                    tmp_path = f.name

                result = subprocess.run(
                    [FFMPEG_EXE,
                     '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                     '-headers', 'Referer: https://www.youtube.com/\r\n',
                     '-ss', str(start), '-to', str(end),
                     '-i', direct_url,
                     '-vn',
                     '-c:a', 'libmp3lame',
                     '-b:a', '128k',
                     '-y',
                     tmp_path],
                    capture_output=True,
                    timeout=150,
                )

                if result.returncode != 0:
                    lines = result.stderr.decode(errors='replace').strip().splitlines()
                    err_msg = next((l for l in reversed(lines) if l.strip()), 'ffmpeg 失敗')
                    print(f'  [ffmpeg] 錯誤: {err_msg[:120]}')
                    self.send_json(500, {'error': f'ffmpeg 錯誤: {err_msg[:120]}'})
                    return

                file_size = os.path.getsize(tmp_path)
                if file_size < 1000:
                    self.send_json(500, {'error': '音訊輸出為空，時間範圍可能超出影片長度'})
                    return

                print(f'  [ffmpeg] 完成，{file_size // 1024} KB')
                self.send_response(200)
                self.cors_headers()
                self.send_header('Content-Type', 'audio/mpeg')
                self.send_header('Content-Length', str(file_size))
                self.end_headers()
                with open(tmp_path, 'rb') as fh:
                    while True:
                        chunk = fh.read(65536)
                        if not chunk:
                            break
                        self.wfile.write(chunk)

            except subprocess.TimeoutExpired:
                try:
                    self.send_json(500, {'error': 'ffmpeg 超時（超過 150 秒），請稍後再試'})
                except Exception:
                    pass
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as e:
                try:
                    self.send_json(502, {'error': str(e)})
                except Exception:
                    pass
            finally:
                if tmp_path:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
            return

        # ── /audio?url=YOUTUBE_URL — 原始音訊串流（備用） ──
        if parsed.path == '/audio':
            yt_url = params.get('url', [''])[0]
            if not yt_url:
                self.send_error(400, 'Missing url parameter')
                return

            try:
                direct_url = get_audio_url(yt_url)
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

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
                pass
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

    if HAS_FFMPEG:
        print(f'[OK] ffmpeg (imageio-ffmpeg)')
    else:
        print('[警告] imageio-ffmpeg 未安裝，YouTube 轉錄將無法使用')
        print('       請執行：pip install imageio-ffmpeg')

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
