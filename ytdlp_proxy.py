#!/usr/bin/env python3
"""
Podcast 轉文字稿 — YouTube 本機代理伺服器
啟動後在 http://localhost:8765 提供音訊串流服務
"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import atexit
import shutil
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

# ── 快取 ──
duration_cache = {}
audio_file_cache = {}   # yt_url -> local_audio_path
cache_lock = threading.Lock()
CACHE_TTL = 300  # 5 分鐘

# 同一 URL 只允許一個下載同時進行
_dl_locks = {}
_dl_locks_lock = threading.Lock()

def _get_dl_lock(yt_url):
    with _dl_locks_lock:
        if yt_url not in _dl_locks:
            _dl_locks[yt_url] = threading.Lock()
        return _dl_locks[yt_url]


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


def get_local_audio(yt_url):
    """
    第一次呼叫：用 yt-dlp 把完整音訊下載到暫存目錄並回傳路徑。
    後續呼叫：直接回傳快取路徑，跳過下載。
    """
    with cache_lock:
        cached = audio_file_cache.get(yt_url)
        if cached and os.path.exists(cached):
            print(f'  [快取] 本地音訊已存在')
            return cached

    # 同一 URL 序列化下載（避免重複下載）
    dl_lock = _get_dl_lock(yt_url)
    with dl_lock:
        # 再次確認（另一個執行緒可能已完成下載）
        with cache_lock:
            cached = audio_file_cache.get(yt_url)
            if cached and os.path.exists(cached):
                return cached

        print(f'  [yt-dlp] 下載完整音訊... {yt_url[:60]}')
        tmp_dir = tempfile.mkdtemp(prefix='podcast_proxy_')

        result = subprocess.run(
            [sys.executable, '-m', 'yt_dlp',
             '-f', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
             '--no-playlist', '--quiet', '--no-part',
             '-o', os.path.join(tmp_dir, 'audio.%(ext)s'),
             yt_url],
            capture_output=True, timeout=600
        )

        if result.returncode != 0:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            lines = result.stderr.decode(errors='replace').strip().splitlines()
            err = lines[-1] if lines else 'yt-dlp 下載失敗'
            raise RuntimeError(err)

        files = [f for f in os.listdir(tmp_dir) if f.startswith('audio.')]
        if not files:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise RuntimeError('找不到下載的音訊檔案')

        audio_path = os.path.join(tmp_dir, files[0])
        size_mb = os.path.getsize(audio_path) // 1024 // 1024
        print(f'  [yt-dlp] 下載完成：{size_mb} MB → {audio_path}')

        with cache_lock:
            audio_file_cache[yt_url] = audio_path

        return audio_path


def cleanup_audio_files():
    for path in list(audio_file_cache.values()):
        try:
            shutil.rmtree(os.path.dirname(path), ignore_errors=True)
        except Exception:
            pass


atexit.register(cleanup_audio_files)


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

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

        # ── /ping ──
        if parsed.path == '/ping':
            self.send_json(200, {'status': 'ok', 'ffmpeg': HAS_FFMPEG})
            return

        # ── /info?url= ──
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

        # ── /segment?url=&start=&end= ──
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
                end   = float(params.get('end',   ['480'])[0])
            except ValueError:
                self.send_error(400, 'start/end must be numbers')
                return

            # 1. 確保完整音訊已下載到本機
            try:
                local_audio = get_local_audio(yt_url)
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

            # 2. ffmpeg 從本機檔案切出片段（很快，不需要下載）
            print(f'  [ffmpeg] 切割 {start:.0f}s - {end:.0f}s（本機）')
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
                    tmp_path = f.name

                result = subprocess.run(
                    [FFMPEG_EXE,
                     '-ss', str(start), '-to', str(end),
                     '-i', local_audio,
                     '-vn',
                     '-c:a', 'libmp3lame',
                     '-b:a', '128k',
                     '-y',
                     tmp_path],
                    capture_output=True,
                    timeout=60,   # 本機切割很快，60 秒夠了
                )

                if result.returncode != 0:
                    lines = result.stderr.decode(errors='replace').strip().splitlines()
                    err_msg = next((l for l in reversed(lines) if l.strip()), 'ffmpeg 失敗')
                    print(f'  [ffmpeg] 錯誤: {err_msg[:120]}')
                    self.send_json(500, {'error': f'ffmpeg 錯誤: {err_msg[:120]}'})
                    return

                file_size = os.path.getsize(tmp_path)
                if file_size < 1000:
                    # 時間超出影片長度時輸出為空，視為正常結束
                    self.send_json(200, {'done': True, 'size': file_size})
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
                    self.send_json(500, {'error': 'ffmpeg 切割超時'})
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
    print('>>> 音訊會在第一次轉錄時自動完整下載，後續各段很快')
    print('>>> 按 Ctrl+C 可停止伺服器（暫存音訊檔將自動刪除）')
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
