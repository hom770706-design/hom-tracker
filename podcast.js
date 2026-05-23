/* ── Podcast Transcriber ── */
'use strict';

// ── State ──
let currentFile = null;
let isCancelled = false;
let transcriptData = null;

// ── History ──
const HISTORY_KEY = 'podcast_history';
const HISTORY_MAX = 30;

// ── DOM ──
const dom = {
  settingsToggle: document.getElementById('settings-toggle'),
  settingsBody: document.getElementById('settings-body'),
  settingsChevron: document.getElementById('settings-chevron'),
  settingsBadge: document.getElementById('settings-badge'),
  groqKey: document.getElementById('groq-key'),
  saveKeysBtn: document.getElementById('save-keys-btn'),
  tabFile: document.getElementById('tab-file'),
  tabUrl: document.getElementById('tab-url'),
  panelFile: document.getElementById('panel-file'),
  panelUrl: document.getElementById('panel-url'),
  audioUrl: document.getElementById('audio-url'),
  fetchUrlBtn: document.getElementById('fetch-url-btn'),
  urlFileInfo: document.getElementById('url-file-info'),
  urlFileName: document.getElementById('url-file-name'),
  urlFileMeta: document.getElementById('url-file-meta'),
  removeUrlBtn: document.getElementById('remove-url-btn'),
  episodeListWrap: document.getElementById('episode-list-wrap'),
  episodeList: document.getElementById('episode-list'),
  episodeCount: document.getElementById('episode-count'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  fileInfo: document.getElementById('file-info'),
  fileName: document.getElementById('file-name'),
  fileMeta: document.getElementById('file-meta'),
  removeFileBtn: document.getElementById('remove-file-btn'),
  langSelect: document.getElementById('lang-select'),
  startBtn: document.getElementById('start-btn'),
  progressCard: document.getElementById('progress-card'),
  cancelBtn: document.getElementById('cancel-btn'),
  errorBanner: document.getElementById('error-banner'),
  errorText: document.getElementById('error-text'),
  errorClose: document.getElementById('error-close'),
  resultsSection: document.getElementById('results-section'),
  transcriptMeta: document.getElementById('transcript-meta'),
  transcriptContent: document.getElementById('transcript-content'),
  copyTranscriptBtn: document.getElementById('copy-transcript-btn'),
  downloadBtn: document.getElementById('download-btn'),
  newBtn: document.getElementById('new-btn'),
};

const steps = {
  upload: {
    el: document.getElementById('step-upload'),
    desc: document.getElementById('step-upload-desc'),
    connector: null,
  },
  transcribe: {
    el: document.getElementById('step-transcribe'),
    desc: document.getElementById('step-transcribe-desc'),
    connector: null,
  },
  format: {
    el: document.getElementById('step-format'),
    desc: document.getElementById('step-format-desc'),
    connector: null,
  },
};

// ── Init ──
function init() {
  loadKeys();
  setupSettingsToggle();
  setupHistoryToggle();
  setupEyeButtons();
  setupDropZone();
  setupInputTabs();
  setupButtons();
  renderHistory();
}

// ── Keys ──
function loadKeys() {
  dom.groqKey.value = localStorage.getItem('podcast_groq_key') || '';
  updateSettingsBadge();
}

function saveKeys() {
  localStorage.setItem('podcast_groq_key', dom.groqKey.value.trim());
  updateSettingsBadge();
  showToast(dom.saveKeysBtn, '已儲存 ✓');
  collapseSettings();
}

function updateSettingsBadge() {
  const ok = !!localStorage.getItem('podcast_groq_key');
  dom.settingsBadge.textContent = ok ? '已設定' : '未設定';
  dom.settingsBadge.classList.toggle('ok', ok);
  updateStartBtn();
}

function collapseSettings() {
  dom.settingsBody.classList.add('collapsed');
  dom.settingsChevron.classList.remove('open');
}

function expandSettings() {
  dom.settingsBody.classList.remove('collapsed');
  dom.settingsChevron.classList.add('open');
}

// ── Settings Toggle ──
function setupSettingsToggle() {
  const keysSet = !!localStorage.getItem('podcast_groq_key');
  if (!keysSet) expandSettings();

  dom.settingsToggle.addEventListener('click', () => {
    const collapsed = dom.settingsBody.classList.contains('collapsed');
    collapsed ? expandSettings() : collapseSettings();
  });
  dom.settingsToggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dom.settingsToggle.click();
    }
  });
}

// ── Eye Buttons ──
function setupEyeButtons() {
  document.querySelectorAll('.eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

// ── Input Tabs ──
function setupInputTabs() {
  dom.tabFile.addEventListener('click', () => switchTab('file'));
  dom.tabUrl.addEventListener('click', () => switchTab('url'));
}

function switchTab(tab) {
  const isFile = tab === 'file';
  dom.tabFile.classList.toggle('active', isFile);
  dom.tabUrl.classList.toggle('active', !isFile);
  dom.panelFile.classList.toggle('hidden', !isFile);
  dom.panelUrl.classList.toggle('hidden', isFile);
  if (isFile) {
    dom.audioUrl.value = '';
    dom.urlFileInfo.classList.add('hidden');
    clearEpisodeList();
    if (!currentFile) updateStartBtn();
  } else {
    clearFile();
  }
}

// ── URL / RSS Fetch ──
function convertSoundOnUrl(url) {
  const m = url.match(/soundon\.fm\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (m) return `https://feeds.soundon.fm/podcasts/${m[1]}.xml`;
  return url;
}

function handleFetchUrl() {
  let url = dom.audioUrl.value.trim().replace(/^<(.+)>$/, '$1');
  url = convertSoundOnUrl(url);
  dom.audioUrl.value = url;
  if (!url) { showError('請輸入網址。'); return; }
  if (looksLikeDirectoryPage(url)) {
    fetchRssFromDirectoryPage(url);
  } else if (looksLikeRss(url)) {
    fetchRssEpisodes(url);
  } else {
    fetchAudioUrl(url);
  }
}

function looksLikeRss(url) {
  return /\.xml(\?|$)/i.test(url) || /\/feeds?\b/i.test(url) || /feeds\./i.test(url);
}

function looksLikeDirectoryPage(url) {
  return /podcastaddict\.com\/podcast\//i.test(url) ||
         /podcasts\.apple\.com\//i.test(url) ||
         /music\.apple\.com\/.*podcast/i.test(url);
}

async function fetchRssFromDirectoryPage(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '解析頁面中...';
  clearError();

  try {
    const rssUrl = await extractRssUrl(url);
    dom.audioUrl.value = rssUrl;
    await fetchRssEpisodes(rssUrl);
  } catch (err) {
    showError(`無法取得 RSS：${err.message}`);
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  }
}

async function extractRssUrl(url) {
  // Apple Podcasts — use iTunes lookup API (no proxy needed)
  const appleId = url.match(/\/id(\d{6,12})/i)?.[1];
  if (appleId && /apple\.com/i.test(url)) {
    const res = await fetchWithTimeout(
      `https://itunes.apple.com/lookup?id=${appleId}&entity=podcast`, 10000
    );
    if (res.ok) {
      const data = await res.json();
      const feedUrl = data.results?.[0]?.feedUrl;
      if (feedUrl) return feedUrl;
    }
    throw new Error('Apple Podcasts 查無 RSS，請直接搜尋節目的 RSS 連結');
  }

  // Podcast Addict — fetch page HTML and extract RSS link
  if (/podcastaddict\.com/i.test(url)) {
    const res = await fetchViaProxy(url);
    const html = await res.text();

    // Try standard <link rel="alternate"> tag first
    const linkTag = html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i)
                 || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i);
    if (linkTag) return linkTag[1];

    // Try any href containing a feed/rss XML URL
    const hrefFeed = html.match(/href=["'](https?:\/\/[^"']*(?:feed|rss)[^"']*\.xml(?:\?[^"']*)?)/i)
                  || html.match(/href=["'](https?:\/\/feeds\.[^"']+)/i);
    if (hrefFeed) return hrefFeed[1];

    // Try bare URL pattern in page source
    const bareUrl = html.match(/(https?:\/\/[^\s"'<>]+\.xml(?:\?[^\s"'<>]*)?)/i);
    if (bareUrl) return bareUrl[1];

    throw new Error('在 Podcast Addict 頁面找不到 RSS 連結，請直接貼上 RSS 網址');
  }

  throw new Error('不支援的 Podcast 目錄網址');
}

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchViaProxy(url) {
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const proxyUrl of proxies) {
    try {
      const res = await fetchWithTimeout(proxyUrl, 12000);
      if (res.ok) return res;
    } catch (_) {}
  }
  throw new Error('所有 Proxy 均無法連線，請確認網路連線正常後再試');
}

function extractAudioUrlFromHtml(html) {
  const m = html.match(/https?:\/\/[^\s"'<>]+\.(mp3|m4a|aac|ogg|wav|webm)(\?[^\s"'<>]*)?/i);
  return m ? m[0] : '';
}

async function trySoundOnPlayerFallback(soundonId, originalFeedUrl) {
  try {
    const playerUrl = `https://player.soundon.fm/p/${soundonId}`;
    const res = await fetchViaProxy(playerUrl);
    const html = await res.text();

    // Look for a different RSS/feed URL embedded in the page
    const feedMatch = html.match(/feeds\.soundon\.fm\/podcasts\/[a-f0-9-]+\.xml/i);
    if (feedMatch) {
      const altUrl = `https://${feedMatch[0]}`;
      if (altUrl !== originalFeedUrl) {
        dom.audioUrl.value = altUrl;
        await fetchRssEpisodes(altUrl);
        return true;
      }
    }

    // Try to find episode audio URLs directly in the page
    const audioUrls = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac)(?:\?[^\s"'<>]*)?/gi)]
      .map(m => m[0]);
    if (audioUrls.length > 0) {
      const unique = [...new Set(audioUrls)].slice(0, 50);
      const episodes = unique.map((u, i) => ({ title: `集數 ${i + 1}`, url: u, pubDate: '' }));
      showEpisodeList(episodes);
      return true;
    }
  } catch (_) {}
  return false;
}

function getItemAudioUrl(item) {
  // Standard <enclosure url="...">
  const enc = item.querySelector('enclosure');
  if (enc?.getAttribute('url')) return enc.getAttribute('url');

  // <media:content url="..."> (used by some podcast platforms)
  try {
    const mc = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
    if (mc?.getAttribute('url')) return mc.getAttribute('url');
  } catch (_) {}

  // Any attribute named "url" that looks like an audio file
  for (const el of item.querySelectorAll('[url]')) {
    const u = el.getAttribute('url') || '';
    if (/\.(mp3|m4a|aac|ogg|wav|webm|mpeg)(\?|$)/i.test(u)) return u;
  }

  return '';
}

async function fetchRssEpisodes(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '載入集數中...';
  clearError();
  clearEpisodeList();

  try {
    // Try rss2json.com first — purpose-built RSS service with proper CORS headers
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    try {
      const r = await fetchWithTimeout(rss2jsonUrl, 12000);
      if (r.ok) {
        const data = await r.json();
        if (data.status === 'ok' && data.items?.length > 0) {
          const episodes = data.items.slice(0, 50)
            .map(item => ({
              title: item.title || '無標題',
              url: item.enclosure?.link || item.enclosure?.url
                || extractAudioUrlFromHtml(item.content || item.description || ''),
              pubDate: item.pubDate || '',
            }))
            .filter(ep => ep.url);
          if (episodes.length > 0) { showEpisodeList(episodes); return; }
        }
      }
    } catch (_) {}

    // Fallback: fetch raw XML via CORS proxy
    const res = await fetchViaProxy(url);
    const text = await res.text();

    // If proxy returns HTML instead of XML, give a better error
    if (/<html[\s>]/i.test(text.slice(0, 500))) {
      const soundonId = url.match(/feeds\.soundon\.fm\/podcasts\/([0-9a-f-]{36})\.xml/i)?.[1];
      if (soundonId) {
        const found = await trySoundOnPlayerFallback(soundonId, url);
        if (found) return;
      }
      throw new Error('此節目的 RSS 無法存取，請嘗試直接貼上音訊網址');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    if (doc.querySelector('parseerror') || doc.querySelector('parsererror')) {
      const soundonId = url.match(/feeds\.soundon\.fm\/podcasts\/([0-9a-f-]{36})\.xml/i)?.[1];
      if (soundonId) {
        const found = await trySoundOnPlayerFallback(soundonId, url);
        if (found) return;
      }
      throw new Error('RSS 格式解析失敗，請確認網址是否正確');
    }

    const items = Array.from(doc.querySelectorAll('item'));
    if (items.length === 0) throw new Error('找不到集數，請確認是正確的 RSS 訂閱連結');

    const episodes = items.slice(0, 50).map(item => ({
      title: item.querySelector('title')?.textContent?.trim() || '無標題',
      url: getItemAudioUrl(item),
      pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
    })).filter(ep => ep.url);

    if (episodes.length === 0) throw new Error('此 RSS 沒有可用的音訊集數');

    showEpisodeList(episodes);
  } catch (err) {
    showError(`RSS 載入失敗：${err.message}`);
  } finally {
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  }
}

function showEpisodeList(episodes) {
  dom.episodeCount.textContent = `共 ${episodes.length} 集`;
  dom.episodeList.innerHTML = '';
  episodes.forEach(ep => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'episode-item';
    const title = document.createElement('div');
    title.className = 'episode-title';
    title.textContent = ep.title;
    const meta = document.createElement('div');
    meta.className = 'episode-date';
    meta.textContent = formatEpisodeDate(ep.pubDate);
    btn.appendChild(title);
    btn.appendChild(meta);
    btn.addEventListener('click', () => selectEpisode(ep, btn));
    dom.episodeList.appendChild(btn);
  });
  dom.episodeListWrap.classList.remove('hidden');
}

function selectEpisode(ep, btnEl) {
  dom.episodeList.querySelectorAll('.episode-item').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');
  fetchAudioUrl(ep.url);
}

function clearEpisodeList() {
  dom.episodeListWrap.classList.add('hidden');
  dom.episodeList.innerHTML = '';
}

function formatEpisodeDate(pubDate) {
  if (!pubDate) return '';
  try {
    const d = new Date(pubDate);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return pubDate.slice(0, 16);
  }
}

let currentDownloadCtrl = null;

async function fetchAudioUrl(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '連線中...';
  clearError();
  if (currentDownloadCtrl) currentDownloadCtrl.abort();
  currentDownloadCtrl = new AbortController();

  try {
    const blob = await fetchBlobWithFallback(url, currentDownloadCtrl.signal, (received, total) => {
      const mb = (received / 1024 / 1024).toFixed(1);
      if (total > 0) {
        const pct = Math.round(received / total * 100);
        dom.fetchUrlBtn.textContent = `下載中 ${pct}%（${mb} MB）`;
      } else {
        dom.fetchUrlBtn.textContent = `下載中...（${mb} MB）`;
      }
    });

    if (blob.size > 300 * 1024 * 1024) throw new Error('檔案超過 300MB，無法載入至瀏覽器。');

    const filename = url.split('/').pop().split('?')[0] || 'audio.mp3';
    currentFile = new File([blob], filename, { type: getMimeType(filename, blob.type) });

    const sizeNote = blob.size > 24 * 1024 * 1024 ? '（將自動分段處理）' : '';
    dom.urlFileName.textContent = filename;
    dom.urlFileMeta.textContent = `${formatFileSize(blob.size)} · 從網址載入 ${sizeNote}`;
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已載入';
    updateStartBtn();
  } catch (err) {
    if (err.name === 'AbortError') return; // user cancelled
    showError(err.message);
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  } finally {
    currentDownloadCtrl = null;
  }
}

async function streamToBlob(res, signal, onProgress) {
  const contentLength = +res.headers.get('Content-Length') || 0;
  const ct = res.headers.get('content-type') || '';
  if (!res.body) return res.blob();

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, contentLength);
  }

  const arr = new Uint8Array(received);
  let pos = 0;
  for (const chunk of chunks) { arr.set(chunk, pos); pos += chunk.length; }
  return new Blob([arr], { type: ct });
}

async function fetchBlobWithFallback(url, signal, onProgress) {
  // Try direct fetch first (2-minute timeout)
  const timeoutCtrl = new AbortController();
  const combined = combineSignals(signal, timeoutCtrl.signal);
  const tid = setTimeout(() => timeoutCtrl.abort(), 120000);

  try {
    const res = await fetch(url, { signal: combined });
    clearTimeout(tid);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('audio') || ct.includes('video') || ct.includes('octet-stream') || ct.includes('mpeg')) {
        return await streamToBlob(res, signal, onProgress);
      }
      throw new Error(`WRONG_TYPE:${ct}`);
    }
  } catch (err) {
    clearTimeout(tid);
    if (err.name === 'AbortError') throw err;
    if (err.message.startsWith('WRONG_TYPE:')) {
      throw new Error(`此網址回傳的不是音訊檔案（${err.message.slice(11)}）`);
    }
    // CORS or network error — fall through to proxy
  }

  // Retry via CORS proxy
  try {
    const res = await fetchViaProxy(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — 無法存取此網址`);
    return await streamToBlob(res, signal, onProgress);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(err.message.includes('Proxy') ? err.message : '無法載入此音訊（網址錯誤或連結已失效）。');
  }
}

function combineSignals(...signals) {
  const ctrl = new AbortController();
  for (const sig of signals) {
    if (!sig) continue;
    if (sig.aborted) { ctrl.abort(); break; }
    sig.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

// ── File Handling ──
function setupDropZone() {
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') dom.fileInput.click();
  });
  dom.fileInput.addEventListener('change', e => {
    if (e.target.files[0]) selectFile(e.target.files[0]);
  });

  dom.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.dropZone.classList.add('drag-over');
  });
  dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
  dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
  });

  dom.removeFileBtn.addEventListener('click', clearFile);
}

function selectFile(file) {
  const ALLOWED = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/x-wav',
    'audio/webm', 'audio/m4a', 'audio/x-m4a', 'video/mp4'];

  if (!ALLOWED.includes(file.type) && !file.name.match(/\.(mp3|mp4|m4a|wav|webm|mpeg|mpga)$/i)) {
    showError('不支援的檔案格式。請上傳 MP3、MP4、WAV、M4A 或 WEBM 音訊檔案。');
    return;
  }

  currentFile = file;
  dom.fileName.textContent = file.name;
  const sizeNote = file.size > 24 * 1024 * 1024 ? '（將自動分段處理）' : '';
  dom.fileMeta.textContent = `${formatFileSize(file.size)} · ${file.type || '音訊檔案'} ${sizeNote}`;
  dom.dropZone.classList.add('hidden');
  dom.fileInfo.classList.remove('hidden');
  clearError();
  updateStartBtn();
}

function clearFile() {
  currentFile = null;
  dom.fileInput.value = '';
  dom.dropZone.classList.remove('hidden');
  dom.fileInfo.classList.add('hidden');
  updateStartBtn();
}

function getMimeType(filename, blobType) {
  if (blobType && blobType !== 'application/octet-stream' && blobType !== 'binary/octet-stream') return blobType;
  const ext = filename.match(/\.([^.?]+)(?:\?|$)/i)?.[1]?.toLowerCase();
  const map = { mp3: 'audio/mpeg', mpga: 'audio/mpeg', mpeg: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg' };
  return map[ext] || 'audio/mpeg';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Button Setup ──
function setupButtons() {
  dom.saveKeysBtn.addEventListener('click', saveKeys);
  dom.startBtn.addEventListener('click', startProcessing);
  dom.cancelBtn.addEventListener('click', () => { isCancelled = true; resetToUpload(); });
  dom.errorClose.addEventListener('click', clearError);
  dom.copyTranscriptBtn.addEventListener('click', () => copyTranscript());
  dom.downloadBtn.addEventListener('click', downloadTranscript);
  dom.newBtn.addEventListener('click', resetToUpload);
  dom.fetchUrlBtn.addEventListener('click', handleFetchUrl);
  dom.removeUrlBtn.addEventListener('click', () => {
    if (currentDownloadCtrl) { currentDownloadCtrl.abort(); currentDownloadCtrl = null; }
    currentFile = null;
    dom.audioUrl.value = '';
    dom.urlFileInfo.classList.add('hidden');
    clearEpisodeList();
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
    updateStartBtn();
  });
  dom.audioUrl.addEventListener('keydown', e => { if (e.key === 'Enter') handleFetchUrl(); });

  document.querySelectorAll('.hint-podcast').forEach(el => {
    el.addEventListener('click', () => {
      dom.audioUrl.value = el.dataset.url;
      handleFetchUrl();
    });
  });
}

function updateStartBtn() {
  const hasKeys = !!localStorage.getItem('podcast_groq_key');
  dom.startBtn.disabled = !currentFile || !hasKeys;
  dom.startBtn.title = !hasKeys ? '請先設定 Groq API 金鑰' : !currentFile ? '請先選擇音訊檔案' : '';
}

// ── Main Processing ──
async function startProcessing() {
  if (!currentFile) return;
  const groqKey = localStorage.getItem('podcast_groq_key');
  if (!groqKey) {
    showError('請先設定 Groq API 金鑰。');
    expandSettings();
    return;
  }

  isCancelled = false;
  clearError();
  showProgress();

  try {
    setStep('upload', 'active', '正在上傳至 Groq...');
    setStep('transcribe', 'idle', '等待上傳完成...');
    setStep('format', 'idle', '等待語音辨識完成...');

    if (isCancelled) return;

    const lang = dom.langSelect.value;
    const fileMB = (currentFile.size / 1024 / 1024).toFixed(1);
    const mime = currentFile.type || '';
    const isAAC = /mp4|m4a|aac/i.test(mime) || /\.(m4a|aac|mp4)$/i.test(currentFile.name);
    const GROQ_LIMIT = 24.5 * 1024 * 1024;
    const isLarge = currentFile.size > GROQ_LIMIT;
    const numChunks = isLarge ? Math.ceil(currentFile.size / (20 * 1024 * 1024)) : 1;

    if (isLarge && isAAC) {
      setStep('upload', 'error', '檔案過大');
      setStep('transcribe', 'error', `M4A 格式 ${fileMB} MB，無法分段`);
      showError(`此集數音訊為 M4A 格式（${fileMB} MB），超過 Groq 25 MB 上限。M4A 容器格式無法安全分段，建議：① 換一集較短的集數試試，② 或手動下載後用工具剪短再上傳`);
      return;
    }

    setStep('upload', 'active', isLarge ? `MP3 ${fileMB} MB，分 ${numChunks} 段處理...` : `${fileMB} MB，正在傳送...`);

    let result;
    try {
      if (isLarge) {
        result = await transcribeInChunks(currentFile, groqKey, lang);
        if (!result) return;
      } else {
        result = await transcribeAudio(currentFile, groqKey, lang);
      }
    } catch (err) {
      setStep('upload', 'error', '上傳失敗');
      setStep('transcribe', 'error', err.message);
      showError(`語音辨識失敗：${err.message}`);
      return;
    }

    if (isCancelled) return;

    setStep('upload', 'done', isLarge ? `分段上傳完成（${numChunks} 段）` : '上傳完成');
    setStep('transcribe', 'done', `偵測語言：${result.language || '未知'}，共 ${formatDuration(result.duration || 0)}`);
    transcriptData = result;

    setStep('format', 'active', '格式化文字稿（繁體中文 + 標點）...');
    try {
      const formatted = await formatTranscript(result.text, groqKey);
      if (formatted) result.formattedText = formatted;
    } catch (_) {}

    if (isCancelled) return;

    setStep('format', 'done', '格式化完成');

    displayTranscript(result);
    dom.resultsSection.classList.remove('hidden');
    dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveToHistory();

  } finally {
    hideProgress();
  }
}

// ── Groq Whisper API ──
async function transcribeAudio(file, apiKey, lang, attempt = 0) {
  const model = attempt >= 1 ? 'whisper-large-v3' : 'whisper-large-v3-turbo';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  if (lang) formData.append('language', lang);
  if (!lang || lang === 'zh' || lang === 'yue') {
    formData.append('prompt', '繁體中文，加入標點符號。以下是常見財經詞彙：股票、基金、ETF、殖利率、本益比、市值、股息、除權息、法說會、財報、營收、毛利率、EPS、漲停、跌停、多頭、空頭、技術分析、籌碼、外資、投信、自營商。');
  }

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || msg;
    } catch (_) {}
    if (res.status === 429) {
      const wait = msg.match(/try again in\s+([\d.]+m[\d.]+s|[\d.]+s)/i)?.[1] || '';
      throw new Error(`已達到 Groq 每小時語音辨識上限，請稍候${wait ? '約 ' + wait : '幾分鐘'}後再試`);
    }
    if (res.status === 500 && attempt === 0) {
      setStep('transcribe', 'active', '伺服器錯誤，改用備用模型重試...');
      await new Promise(r => setTimeout(r, 2000));
      return transcribeAudio(file, apiKey, lang, 1);
    }
    throw new Error(msg);
  }

  return res.json();
}

async function transcribeInChunks(file, apiKey, lang) {
  const CHUNK = 20 * 1024 * 1024; // 20 MB per chunk
  const total = Math.ceil(file.size / CHUNK);
  const ext = file.name.match(/\.[^.]+$/)?.[0] || '.mp3';
  const mime = file.type || 'audio/mpeg';
  const results = [];

  for (let i = 0; i < total; i++) {
    if (isCancelled) return null;
    const slice = file.slice(i * CHUNK, Math.min((i + 1) * CHUNK, file.size), mime);
    const chunk = new File([slice], `part${i + 1}${ext}`, { type: mime });
    setStep('upload', 'active', `傳送第 ${i + 1} / ${total} 段...`);
    setStep('transcribe', 'active', `語音辨識第 ${i + 1} / ${total} 段...`);
    results.push(await transcribeAudio(chunk, apiKey, lang));
  }

  let timeOffset = 0;
  const allSegments = [];
  for (const r of results) {
    (r.segments || []).forEach(seg => {
      allSegments.push({ ...seg, start: seg.start + timeOffset, end: seg.end + timeOffset });
    });
    timeOffset += r.duration || 0;
  }

  return {
    text: results.map(r => r.text || '').join(' '),
    segments: allSegments.length > 0 ? allSegments : undefined,
    language: results[0]?.language,
    duration: timeOffset,
  };
}

// ── Format Transcript (Traditional Chinese + Punctuation) ──
async function formatTranscript(text, apiKey) {
  const MAX = 12000;
  const input = text.slice(0, MAX);
  const isTruncated = text.length > MAX;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `請將以下語音辨識的原始文字稿重新格式化：\n1. 簡體中文轉繁體中文\n2. 加入適當標點符號（句號、逗號、問號、感嘆號）\n3. 依語意自然分段（段落間空一行）\n\n只回傳格式化後的文字，不加任何說明。\n\n文字稿：\n${input}` }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim() || null;
  return result ? result + (isTruncated ? '\n\n[以下內容因長度限制未格式化]' : '') : null;
}

// ── Display ──
function displayTranscript(data) {
  const duration = data.duration ? `時長：${formatDuration(data.duration)}` : '';
  const lang = data.language ? `語言：${data.language}` : '';
  const parts = [lang, duration].filter(Boolean);
  dom.transcriptMeta.textContent = parts.join('　|　');

  dom.transcriptContent.innerHTML = '';

  if (data.formattedText) {
    // Show formatted (Traditional Chinese + punctuation) text as paragraphs
    data.formattedText.split(/\n{2,}/).filter(p => p.trim()).forEach(para => {
      const div = document.createElement('div');
      div.className = 'transcript-segment';
      const text = document.createElement('div');
      text.className = 'transcript-text';
      text.textContent = para.trim();
      div.appendChild(text);
      dom.transcriptContent.appendChild(div);
    });
    return;
  }

  const segments = data.segments;

  if (segments && segments.length > 0) {
    const groups = [];
    let current = [segments[0]];
    for (let i = 1; i < segments.length; i++) {
      const gap = segments[i].start - segments[i - 1].end;
      if (gap > 2.5) {
        groups.push(current);
        current = [segments[i]];
      } else {
        current.push(segments[i]);
      }
    }
    if (current.length) groups.push(current);

    groups.forEach(group => {
      const div = document.createElement('div');
      div.className = 'transcript-segment';
      const ts = document.createElement('span');
      ts.className = 'transcript-timestamp';
      ts.textContent = formatTimestamp(group[0].start);
      const text = document.createElement('div');
      text.className = 'transcript-text';
      text.textContent = group.map(s => s.text.trim()).join(' ');
      div.appendChild(ts);
      div.appendChild(text);
      dom.transcriptContent.appendChild(div);
    });
  } else {
    const p = document.createElement('p');
    p.className = 'transcript-text';
    p.textContent = data.text || '';
    dom.transcriptContent.appendChild(p);
  }
}

// ── Progress UI ──
function showProgress() {
  document.getElementById('upload-card').classList.add('hidden');
  dom.progressCard.classList.remove('hidden');
}

function hideProgress() {
  dom.progressCard.classList.add('hidden');
}

function setStep(name, state, desc) {
  const s = steps[name];
  s.el.dataset.state = state;
  s.desc.textContent = desc;

  const allSteps = ['upload', 'transcribe', 'format'];
  const connectors = dom.progressCard.querySelectorAll('.step-connector');
  allSteps.forEach((stepName, i) => {
    const connector = connectors[i];
    if (!connector) return;
    if (steps[stepName].el.dataset.state === 'done') {
      connector.classList.add('done');
    } else {
      connector.classList.remove('done');
    }
  });
}

// ── Reset ──
function resetToUpload() {
  dom.progressCard.classList.add('hidden');
  dom.resultsSection.classList.add('hidden');
  document.getElementById('upload-card').classList.remove('hidden');
  clearError();
  setStep('upload', 'idle', '準備上傳...');
  setStep('transcribe', 'idle', '等待上傳完成...');
  setStep('format', 'idle', '等待語音辨識完成...');
  clearFile();
  dom.audioUrl.value = '';
  dom.urlFileInfo.classList.add('hidden');
  clearEpisodeList();
  dom.fetchUrlBtn.disabled = false;
  dom.fetchUrlBtn.textContent = '⬇️ 載入';
  switchTab('file');
  transcriptData = null;
}

// ── Error ──
function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBanner.classList.remove('hidden');
}

function clearError() {
  dom.errorBanner.classList.add('hidden');
  dom.errorText.textContent = '';
}

// ── Copy / Download ──
function copyTranscript() {
  if (!transcriptData) return;
  let text = '';
  if (transcriptData.formattedText) {
    text = transcriptData.formattedText;
  } else if (transcriptData.segments?.length) {
    text = transcriptData.segments
      .map(s => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
      .join('\n');
  } else {
    text = transcriptData.text || '';
  }
  copyText(text, dom.copyTranscriptBtn);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(btn, '已複製 ✓');
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(btn, '已複製 ✓');
  }
}

function downloadTranscript() {
  if (!transcriptData) return;
  const filename = (currentFile?.name || 'transcript').replace(/\.[^.]+$/, '') + '_transcript.txt';
  let content = `Podcast 文字稿\n${'='.repeat(40)}\n\n`;

  if (transcriptData.formattedText) {
    content += transcriptData.formattedText;
  } else if (transcriptData.segments?.length) {
    content += transcriptData.segments
      .map(s => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
      .join('\n');
  } else {
    content += transcriptData.text || '';
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Utilities ──
function formatTimestamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '00')}`;
}

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分 ${sec} 秒`;
  return `${sec} 秒`;
}

function showToast(btn, msg) {
  const original = btn.innerHTML;
  btn.innerHTML = msg;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerHTML = original;
    btn.classList.remove('copied');
  }, 2000);
}

// ── History ──
function setupHistoryToggle() {
  const toggle = document.getElementById('history-toggle');
  const body = document.getElementById('history-body');
  const chevron = document.getElementById('history-chevron');
  toggle.addEventListener('click', () => {
    const collapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed', !collapsed);
    chevron.classList.toggle('open', collapsed);
  });
  toggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
  });
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
}

function saveToHistory() {
  if (!transcriptData) return;
  const title = (currentFile?.name || '未知').replace(/\.[^.]+$/, '');
  const item = {
    id: Date.now().toString(),
    title,
    date: new Date().toISOString(),
    duration: transcriptData.duration || 0,
    language: transcriptData.language || '',
    transcriptText: (transcriptData.formattedText || transcriptData.text || '').slice(0, 15000),
  };
  const history = loadHistory();
  history.unshift(item);
  if (history.length > HISTORY_MAX) history.splice(HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (_) {
    // Storage full — drop oldest until it fits
    while (history.length > 5) {
      history.pop();
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); break; } catch (_) {}
    }
  }
  renderHistory();
}

function deleteHistoryItem(id) {
  const history = loadHistory().filter(h => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function viewHistoryItem(id) {
  const item = loadHistory().find(h => h.id === id);
  if (!item) return;
  transcriptData = {
    text: item.transcriptText || '',
    formattedText: item.transcriptText || '',
    duration: item.duration,
    language: item.language,
  };
  displayTranscript(transcriptData);
  dom.resultsSection.classList.remove('hidden');
  dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderHistory() {
  const history = loadHistory();
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const badge = document.getElementById('history-badge');

  badge.textContent = `${history.length} 筆`;
  badge.classList.toggle('hidden', history.length === 0);
  empty.classList.toggle('hidden', history.length > 0);
  list.innerHTML = '';

  history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-item-header';

    const info = document.createElement('div');
    info.className = 'history-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'history-item-title';
    titleEl.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'history-item-meta';
    const d = new Date(item.date);
    const dateStr = d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    meta.textContent = `${dateStr} ${timeStr}${item.duration ? '　·　' + formatDuration(item.duration) : ''}`;

    info.appendChild(titleEl);
    info.appendChild(meta);

    const delBtn = document.createElement('button');
    delBtn.className = 'history-delete-btn';
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', '刪除');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteHistoryItem(item.id); });

    header.appendChild(info);
    header.appendChild(delBtn);

    const preview = document.createElement('div');
    preview.className = 'history-item-preview';
    const s = item.transcriptText || '';
    preview.textContent = s.length > 70 ? s.slice(0, 70) + '…' : s;

    const viewBtn = document.createElement('button');
    viewBtn.className = 'history-view-btn';
    viewBtn.type = 'button';
    viewBtn.textContent = '查看文字稿 →';
    viewBtn.addEventListener('click', () => viewHistoryItem(item.id));

    el.appendChild(header);
    el.appendChild(preview);
    el.appendChild(viewBtn);
    list.appendChild(el);
  });
}

// ── Start ──
init();
