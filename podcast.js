/* ── Podcast Transcriber ── */
'use strict';

// ── State ──
let currentFile = null;
let currentAudioUrl = null;     // URL-range transcribe mode (skips full pre-download)
let currentYouTubeUrl = null;   // YouTube URL for local proxy time-based segmentation
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
  cobaltKey: document.getElementById('cobalt-key'),
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
  dom.cobaltKey.value = localStorage.getItem('podcast_cobalt_key') || '';
  updateSettingsBadge();
}

function saveKeys() {
  localStorage.setItem('podcast_groq_key', dom.groqKey.value.trim());
  localStorage.setItem('podcast_cobalt_key', dom.cobaltKey.value.trim());
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
  if (isYouTubeUrl(url)) {
    fetchYouTubeAudio(url);
  } else if (isSpotifyUrl(url)) {
    fetchSpotifyPodcast(url);
  } else if (looksLikeDirectoryPage(url)) {
    fetchRssFromDirectoryPage(url);
  } else if (looksLikeRss(url)) {
    fetchRssEpisodes(url);
  } else {
    fetchAudioUrl(url);
  }
}

// ── YouTube via cobalt.tools ──
function isYouTubeUrl(url) {
  return /(?:youtube\.com\/(?:watch|shorts\/|live\/)|youtu\.be\/)/i.test(url);
}

// ── Spotify ──
function isSpotifyUrl(url) {
  return /open\.spotify\.com\/(show|episode)\//i.test(url);
}

async function fetchCobaltInstances(apiKey) {
  const attempts = [];

  // Official instance (with key)
  if (apiKey) {
    attempts.push({
      url: 'https://api.cobalt.tools/',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Api-Key ${apiKey}`,
      },
    });
  }

  // Discover public community instances that don't require auth
  try {
    const res = await fetchWithTimeout('https://instances.cobalt.best/api/v1/instances.json', 8000);
    if (res.ok) {
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : (raw.instances || raw.data || []);
      list
        .filter(i => i.online !== false && !i.api_key_required && i.api_url)
        .slice(0, 5)
        .forEach(i => attempts.push({
          url: i.api_url.replace(/\/?$/, '/'),
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        }));
    }
  } catch (_) {}

  return attempts;
}

async function resolveYouTubeAudioUrl(ytUrl, apiKey) {
  const attempts = await fetchCobaltInstances(apiKey);

  if (attempts.length === 0) {
    throw new Error('找不到可用的 cobalt 實例，請在「API 設定」填入 Cobalt API Key');
  }

  const body = JSON.stringify({ url: ytUrl, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '128' });

  for (const { url, headers } of attempts) {
    try {
      const res = await fetchWithTimeout(url, 15000, { method: 'POST', headers, body });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === 'tunnel' || data.status === 'redirect') return data.url;
    } catch (_) {}
  }

  throw new Error('所有 cobalt 實例均無法解析此影片，請確認網址正確或稍後再試');
}

const LOCAL_PROXY = 'http://localhost:8765';

async function isLocalProxyRunning() {
  try {
    const res = await fetchWithTimeout(`${LOCAL_PROXY}/ping`, 2000);
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function fetchYouTubeAudio(ytUrl) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '檢查本機代理...';
  clearError();

  const videoId = ytUrl.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/)?.[1];

  // ── 優先：本機 yt-dlp 代理（時間分段，避免 M4A 容器問題）──
  const proxyRunning = await isLocalProxyRunning();
  if (proxyRunning) {
    currentFile = null;
    currentAudioUrl = null;
    currentYouTubeUrl = ytUrl;
    dom.urlFileName.textContent = videoId ? `youtube_${videoId}` : 'YouTube 影片';
    dom.urlFileMeta.textContent = '本機代理就緒，點擊「開始轉錄」';
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已就緒';
    updateStartBtn();
    return;
  }

  // ── 備用：cobalt API ──
  dom.fetchUrlBtn.textContent = '搜尋 cobalt 實例...';
  const cobaltKey = localStorage.getItem('podcast_cobalt_key') || '';

  try {
    const audioUrl = await resolveYouTubeAudioUrl(ytUrl, cobaltKey);
    currentFile = null;
    currentAudioUrl = audioUrl;
    dom.urlFileName.textContent = videoId ? `youtube_${videoId}` : 'YouTube 影片';
    dom.urlFileMeta.textContent = '✅ 音訊解析完成，點擊「開始轉錄」';
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已解析';
    updateStartBtn();
  } catch (err) {
    showError(`YouTube 解析失敗：${err.message}。請先執行「啟動YouTube代理.bat」再試。`);
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  }
}

// ── Spotify: try to extract RSS then fall back to helpful error ──
async function fetchSpotifyPodcast(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '解析 Spotify 頁面...';
  clearError();

  const isEpisodePage = /open\.spotify\.com\/episode\//i.test(url);
  const contentId = url.match(/open\.spotify\.com\/(?:show|episode)\/([A-Za-z0-9]+)/i)?.[1];

  // Try main page + embed page (embed is simpler, less likely Cloudflare-blocked)
  const pagesToTry = contentId
    ? [url, isEpisodePage
        ? `https://open.spotify.com/embed/episode/${contentId}`
        : `https://open.spotify.com/embed/show/${contentId}`]
    : [url];

  const rssPatterns = [
    /"rssUrl"\s*:\s*"(https?:[^"]+)"/i,
    /"feedUrl"\s*:\s*"(https?:[^"]+)"/i,
    /"rss_url"\s*:\s*"(https?:[^"]+)"/i,
    /"feed_url"\s*:\s*"(https?:[^"]+)"/i,
    /type="application\/rss\+xml"[^>]+href="([^"]+)"/i,
    /href="([^"]+)"[^>]+type="application\/rss\+xml"/i,
  ];

  for (const pageUrl of pagesToTry) {
    let html;
    try {
      const res = await fetchViaProxy(pageUrl);
      html = await res.text();
    } catch (_) {
      continue; // proxy failed for this URL, try next
    }

    // Search for RSS URL patterns in raw HTML
    for (const pat of rssPatterns) {
      const m = html.match(pat);
      if (m) {
        const rssUrl = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        if (rssUrl.startsWith('http')) {
          dom.audioUrl.value = rssUrl;
          await fetchRssEpisodes(rssUrl);
          return;
        }
      }
    }

    // Parse __NEXT_DATA__ JSON blob (Next.js SSR pages)
    const ndMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i);
    if (ndMatch) {
      try {
        const pageData = JSON.parse(ndMatch[1]);
        const rssUrl = findValueInObject(pageData, ['rssUrl', 'feedUrl', 'rss_url', 'feed_url', 'feedlink', 'rssFeedUrl']);
        if (rssUrl && typeof rssUrl === 'string' && rssUrl.startsWith('http')) {
          dom.audioUrl.value = rssUrl;
          await fetchRssEpisodes(rssUrl);
          return;
        }
      } catch (_) {}
    }
  }

  // No RSS found — show actionable error
  if (isEpisodePage) {
    showError('Spotify 單集受 DRM 保護，無法直接下載音訊。請改用 Apple Podcasts 或 SoundOn 找到同一集，複製其 RSS 或音訊連結後貼入');
  } else {
    showError('找不到此 Spotify 節目的 RSS 連結。請嘗試：① 在 Apple Podcasts 搜尋同一節目，複製節目網址貼入；② 在 Podcast Addict 搜尋後複製 RSS 連結；③ 直接貼上單集 MP3 連結');
  }
  dom.fetchUrlBtn.disabled = false;
  dom.fetchUrlBtn.textContent = '⬇️ 載入';
}

function findValueInObject(obj, keys, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findValueInObject(item, keys, depth + 1);
      if (r) return r;
    }
    return null;
  }
  for (const k of Object.keys(obj)) {
    if (keys.includes(k) && typeof obj[k] === 'string' && obj[k].startsWith('http')) return obj[k];
    const r = findValueInObject(obj[k], keys, depth + 1);
    if (r) return r;
  }
  return null;
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
  // Apple Podcasts — try multiple iTunes lookup variants
  const appleId = url.match(/\/id(\d{6,12})/i)?.[1];
  if (appleId && /apple\.com/i.test(url)) {
    // Try several query variations: entity filter, country, no filter
    const itunesVariants = [
      `https://itunes.apple.com/lookup?id=${appleId}&entity=podcast`,
      `https://itunes.apple.com/lookup?id=${appleId}&entity=podcast&country=tw`,
      `https://itunes.apple.com/lookup?id=${appleId}`,
    ];

    for (const itunesUrl of itunesVariants) {
      // Direct fetch
      try {
        const res = await fetchWithTimeout(itunesUrl, 10000);
        if (res.ok) {
          const data = await res.json();
          const feedUrl = data.results?.find(r => r.feedUrl)?.feedUrl;
          if (feedUrl) return feedUrl;
        }
      } catch (_) {}

      // Proxy fallback
      try {
        const res = await fetchViaProxy(itunesUrl);
        if (res.ok) {
          const data = await res.json();
          const feedUrl = data.results?.find(r => r.feedUrl)?.feedUrl;
          if (feedUrl) return feedUrl;
        }
      } catch (_) {}
    }

    throw new Error('Apple Podcasts 查無 RSS。請直接到 Apple Podcasts 節目頁面，複製 RSS 連結（通常在「分享」選單或節目介紹中）');
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

async function fetchWithTimeout(url, ms = 12000, options = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
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
  // Try multiple SoundOn page URLs — player + main website
  const pagesToTry = [
    `https://player.soundon.fm/p/${soundonId}`,
    `https://soundon.fm/podcasts/${soundonId}`,
  ];

  for (const pageUrl of pagesToTry) {
    let html;
    try {
      const res = await fetchViaProxy(pageUrl);
      html = await res.text();
    } catch (_) { continue; }

    // Look for alternate RSS/feed URL in the page
    const feedMatch = html.match(/feeds\.soundon\.fm\/podcasts\/[a-f0-9-]+\.xml/i);
    if (feedMatch) {
      const altUrl = `https://${feedMatch[0]}`;
      if (altUrl !== originalFeedUrl) {
        dom.audioUrl.value = altUrl;
        await fetchRssEpisodes(altUrl);
        return true;
      }
    }

    // Parse __NEXT_DATA__ JSON (Next.js SSR pages)
    const ndMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i);
    if (ndMatch) {
      try {
        const pageData = JSON.parse(ndMatch[1]);
        const eps = extractSoundOnEpisodes(pageData);
        if (eps.length > 0) { showEpisodeList(eps); return true; }
      } catch (_) {}
    }

    // Fallback: scan for audio URLs anywhere in page HTML
    const audioUrls = [...html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|aac)(?:\?[^\s"'<>]*)?/gi)]
      .map(m => m[0]);
    if (audioUrls.length > 0) {
      const unique = [...new Set(audioUrls)].slice(0, 50);
      const episodes = unique.map((u, i) => ({ title: `集數 ${i + 1}`, url: u, pubDate: '' }));
      showEpisodeList(episodes);
      return true;
    }
  }
  return false;
}

function extractSoundOnEpisodes(data) {
  const results = [];
  const seen = new Set();
  function traverse(obj, depth) {
    if (depth > 12 || !obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(i => traverse(i, depth + 1)); return; }
    const audioUrl = obj.audio_url || obj.audioUrl || obj.enclosure?.url || obj.enclosureUrl;
    if (audioUrl && typeof audioUrl === 'string' && !seen.has(audioUrl) &&
        /\.(mp3|m4a|aac)(\?|$)/i.test(audioUrl)) {
      seen.add(audioUrl);
      results.push({
        title: obj.title || obj.name || `集數 ${results.length + 1}`,
        url: audioUrl,
        pubDate: obj.publish_date || obj.publishDate || obj.pub_date || '',
      });
    }
    Object.values(obj).forEach(v => traverse(v, depth + 1));
  }
  traverse(data, 0);
  return results;
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
    // 1. Try direct fetch — works if the server sends CORS headers
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (res.ok) {
        const text = await res.text();
        if (!/<html[\s>]/i.test(text.slice(0, 300))) {
          const eps = parseRssText(text);
          if (eps.length > 0) { showEpisodeList(eps); return; }
        }
      }
    } catch (_) {}

    // 2. rss2json.com — purpose-built RSS service with CORS headers
    try {
      const r = await fetchWithTimeout(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, 12000
      );
      if (r.ok) {
        const data = await r.json();
        if (data.status === 'ok' && data.items?.length > 0) {
          const episodes = data.items.slice(0, 50).map(item => ({
            title: item.title || '無標題',
            url: item.enclosure?.link || item.enclosure?.url
              || extractAudioUrlFromHtml(item.content || item.description || ''),
            pubDate: item.pubDate || '',
          })).filter(ep => ep.url);
          if (episodes.length > 0) { showEpisodeList(episodes); return; }
        }
      }
    } catch (_) {}

    // 3. Raw XML via CORS proxies — allorigins /get returns JSON with actual status code
    const proxyAttempts = [
      () => fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(url)}`, 15000)
              .then(r => r.ok ? r.text() : Promise.reject()),
      () => fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, 15000)
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(d => (d.status?.http_code ?? 200) < 400 ? (d.contents || '') : Promise.reject()),
      () => fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, 15000)
              .then(r => r.ok ? r.text() : Promise.reject()),
    ];

    for (const attempt of proxyAttempts) {
      try {
        const text = await attempt();
        if (!text || text.length < 100) continue;
        if (/<html[\s>]/i.test(text.slice(0, 400))) {
          const soundonId = url.match(/feeds\.soundon\.fm\/podcasts\/([0-9a-f-]{36})\.xml/i)?.[1];
          if (soundonId) {
            const found = await trySoundOnPlayerFallback(soundonId, url);
            if (found) return;
          }
          continue;
        }
        if (/host.not.in.allowlist/i.test(text.slice(0, 200))) continue;
        const eps = parseRssText(text);
        if (eps.length > 0) { showEpisodeList(eps); return; }
      } catch (_) {}
    }

    // 4. SoundOn internal API — try multiple endpoint variants
    const soundonApiId = url.match(/feeds\.soundon\.fm\/podcasts\/([0-9a-f-]{36})\.xml/i)?.[1];
    if (soundonApiId) {
      dom.fetchUrlBtn.textContent = '嘗試 SoundOn API...';
      const apiEndpoints = [
        `https://api.soundon.fm/v2/podcasts/${soundonApiId}/episodes?limit=50&page=1`,
        `https://api.soundon.fm/v2/podcasts/${soundonApiId}/episodes`,
        `https://api.soundon.fm/v1/podcasts/${soundonApiId}/episodes?limit=50`,
        `https://api.soundon.fm/podcasts/${soundonApiId}/episodes`,
      ];
      for (const endpoint of apiEndpoints) {
        try {
          const apiRes = await fetchWithTimeout(endpoint, 8000);
          if (!apiRes.ok) continue;
          const data = await apiRes.json();
          const epList = data.data || data.episodes || data.items || data.results || [];
          if (!Array.isArray(epList) || epList.length === 0) continue;
          const eps = epList.map(ep => ({
            title: ep.title || ep.name || '無標題',
            url: ep.enclosure?.url || ep.audio_url || ep.audioUrl || ep.enclosure_url || ep.url || '',
            pubDate: ep.publish_date || ep.publishDate || ep.pub_date || ep.publishedAt || '',
          })).filter(ep => ep.url);
          if (eps.length > 0) { showEpisodeList(eps); return; }
        } catch (_) {}
      }
    }

    // 5. iTunes feedUrl lookup — Apple indexes most SoundOn podcasts; their RSS may be accessible
    try {
      dom.fetchUrlBtn.textContent = '查找 Apple Podcasts 版本...';
      const itunesRes = await fetchWithTimeout(
        `https://itunes.apple.com/lookup?feedUrl=${encodeURIComponent(url)}&entity=podcast`, 12000
      );
      if (itunesRes.ok) {
        const data = await itunesRes.json();
        const appleRss = data.results?.[0]?.feedUrl;
        if (appleRss && appleRss.startsWith('http') && appleRss !== url) {
          dom.audioUrl.value = appleRss;
          // Try to load the Apple-indexed RSS directly
          try {
            const rssRes = await fetchWithTimeout(appleRss, 12000);
            if (rssRes.ok) {
              const text = await rssRes.text();
              if (!/<html[\s>]/i.test(text.slice(0, 300))) {
                const eps = parseRssText(text);
                if (eps.length > 0) { showEpisodeList(eps); return; }
              }
            }
          } catch (_) {}
          // If direct fails, load via proxy
          try {
            const text = await fetchViaProxy(appleRss).then(r => r.text());
            const eps = parseRssText(text);
            if (eps.length > 0) { showEpisodeList(eps); return; }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 6. Wayback Machine — has CORS headers, archives RSS feeds periodically
    try {
      dom.fetchUrlBtn.textContent = '嘗試備用存檔...';
      const avail = await fetchWithTimeout(
        `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, 10000
      );
      if (avail.ok) {
        const snap = await avail.json();
        const snapUrl = snap.archived_snapshots?.closest?.url;
        if (snapUrl && snap.archived_snapshots?.closest?.available === true) {
          // Use "if_" suffix to get raw content without Wayback toolbar injection
          const rawUrl = snapUrl.replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1if_/');
          const snapRes = await fetchWithTimeout(rawUrl, 15000);
          if (snapRes.ok) {
            const text = await snapRes.text();
            if (text && text.length > 100 && !/<html[\s>]/i.test(text.slice(0, 200))) {
              const eps = parseRssText(text);
              if (eps.length > 0) {
                showEpisodeList(eps);
                showError('⚠️ 以存檔資料載入，集數可能非最新（Wayback Machine 快取）');
                return;
              }
            }
          }
        }
      }
    } catch (_) {}

    const isSoundOn = /feeds\.soundon\.fm/i.test(url);
    if (isSoundOn) {
      throw new Error('無法載入 SoundOn 集數（RSS 受防盜連限制）。請直接貼上音訊連結：到 SoundOn 節目頁面 → 點進集數播放 → 在播放器按右鍵 → 「複製音訊位置」');
    }
    throw new Error('無法載入集數。此節目的 RSS 受到存取限制，請直接貼上單集音訊網址來轉錄');
  } catch (err) {
    showError(`RSS 載入失敗：${err.message}`);
  } finally {
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  }
}

function parseRssText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.querySelector('parseerror') || doc.querySelector('parsererror')) return [];
  const items = Array.from(doc.querySelectorAll('item'));
  return items.slice(0, 50).map(item => ({
    title: item.querySelector('title')?.textContent?.trim() || '無標題',
    url: getItemAudioUrl(item),
    pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
  })).filter(ep => ep.url);
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

  // Store URL directly — no pre-download; transcription will range-fetch on demand
  currentFile = null;
  currentAudioUrl = ep.url;

  dom.urlFileName.textContent = ep.title || ep.url.split('/').pop().split('?')[0] || 'audio';
  dom.urlFileMeta.textContent = '已選取，點擊「開始轉錄」即自動分段下載轉錄';
  dom.urlFileInfo.classList.remove('hidden');
  dom.fetchUrlBtn.textContent = '✓ 已選擇';

  updateStartBtn();
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
    const detectedMime = await detectAudioMime(blob);
    const mimeType = detectedMime || getMimeType(filename, blob.type);
    currentFile = new File([blob], filename, { type: mimeType });

    const sizeNote = blob.size > 24 * 1024 * 1024 ? '（將自動分段處理）' : '';
    dom.urlFileName.textContent = filename;
    dom.urlFileMeta.textContent = `${formatFileSize(blob.size)} · 從網址載入 ${sizeNote}`;
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已載入';
    updateStartBtn();
  } catch (err) {
    if (err.name === 'AbortError') return; // user cancelled
    // If the error is clearly "not audio", show the error directly
    if (err.message.includes('音訊檔案') || err.message.includes('WRONG_TYPE') || err.message.includes('過期或失效')) {
      showError(err.message);
      dom.fetchUrlBtn.disabled = false;
      dom.fetchUrlBtn.textContent = '⬇️ 載入';
    } else {
      // CORS / size limit — fall back to range-transcribe mode
      currentAudioUrl = url;
      const filename = url.split('/').pop().split('?')[0] || 'audio.mp3';
      dom.urlFileName.textContent = filename;
      dom.urlFileMeta.textContent = '⚡ 串流模式 — 點擊「開始轉錄」直接分段轉錄，無需預下載';
      dom.urlFileInfo.classList.remove('hidden');
      dom.fetchUrlBtn.textContent = '⚡ 串流就緒';
      updateStartBtn();
    }
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
        const blob = await streamToBlob(res, signal, onProgress);
        if (blob.size < 20 * 1024) {
          const detected = await detectAudioMime(blob);
          if (!detected) throw new Error('下載到的檔案太小、不是有效的音訊內容（網址可能已過期或失效）。請重新取得網址後立即重試。');
        }
        return blob;
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
    const blob = await streamToBlob(res, signal, onProgress);
    if (blob.size < 20 * 1024) {
      const detected = await detectAudioMime(blob);
      if (!detected) {
        throw new Error('下載到的檔案太小、不是有效的音訊內容（網址可能已過期或失效）。請重新取得網址後立即重試。');
      }
    }
    return blob;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (err.message.includes('過期或失效')) throw err;
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

async function detectAudioMime(blob) {
  try {
    const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());

    // Scan first 28 bytes for 'ftyp' marker — catches most MP4/M4A container variants
    for (let i = 0; i <= 24; i++) {
      if (header[i] === 0x66 && header[i + 1] === 0x74 && header[i + 2] === 0x79 && header[i + 3] === 0x70) {
        return 'audio/mp4';
      }
    }

    // MP3: plain sync frame (no ID3 tag)
    if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) return 'audio/mpeg';
    // OGG
    if (header[0] === 0x4F && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) return 'audio/ogg';
    // WAV: RIFF
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) return 'audio/wav';
    // WebM
    if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) return 'audio/webm';

    // MP3 with ID3 tag: skip the full ID3 block and inspect what follows.
    // Some platforms (e.g. SoundOn) serve M4A/AAC files with an ID3 tag prepended
    // and a .mp3 extension, causing byte-level chunking to fail on Groq's server.
    if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33 && header.length >= 10) {
      const id3Size = ((header[6] & 0x7F) << 21) | ((header[7] & 0x7F) << 14) |
                      ((header[8] & 0x7F) << 7)  | (header[9] & 0x7F);
      const postId3 = 10 + id3Size;
      const after = new Uint8Array(await blob.slice(postId3, postId3 + 12).arrayBuffer());
      // After ID3: scan for ftyp → this is M4A audio with ID3 metadata wrapper
      for (let i = 0; i <= 8; i++) {
        if (after[i] === 0x66 && after[i + 1] === 0x74 && after[i + 2] === 0x79 && after[i + 3] === 0x70) {
          return 'audio/mp4';
        }
      }
      if (after[0] === 0xFF && (after[1] & 0xE0) === 0xE0) return 'audio/mpeg';
      return 'audio/mpeg'; // genuine MP3 with ID3
    }
  } catch (_) {}
  return null;
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
    currentAudioUrl = null;
    currentYouTubeUrl = null;
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
  const hasAudio = !!(currentFile || currentAudioUrl || currentYouTubeUrl);
  dom.startBtn.disabled = !hasAudio || !hasKeys;
  dom.startBtn.title = !hasKeys ? '請先設定 Groq API 金鑰' : !hasAudio ? '請先選擇音訊檔案' : '';
}

// ── Main Processing ──
async function startProcessing() {
  if (!currentFile && !currentAudioUrl && !currentYouTubeUrl) return;
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
    setStep('upload', 'active', '準備中...');
    setStep('transcribe', 'idle', '等待中...');
    setStep('format', 'idle', '等待語音辨識完成...');

    if (isCancelled) return;

    const lang = dom.langSelect.value;
    let result;

    if (currentYouTubeUrl) {
      // ── YouTube local proxy path (time-based segments via ffmpeg) ──
      try {
        result = await transcribeFromLocalProxy(currentYouTubeUrl, groqKey, lang);
        if (!result) return;
      } catch (err) {
        setStep('upload', 'error', '代理失敗');
        setStep('transcribe', 'error', err.message);
        showError(`轉錄失敗：${err.message}`);
        return;
      }
    } else if (currentAudioUrl) {
      // ── URL range-transcribe path (no full pre-download needed) ──
      try {
        result = await transcribeUrlInRanges(currentAudioUrl, groqKey, lang);
        if (!result) return;
      } catch (err) {
        setStep('upload', 'error', '下載失敗');
        setStep('transcribe', 'error', err.message);
        showError(`轉錄失敗：${err.message}`);
        return;
      }
    } else {
      // ── File-based path (existing behaviour) ──
      const fileMB = (currentFile.size / 1024 / 1024).toFixed(1);
      const mime = currentFile.type || '';
      const isAAC = /mp4|m4a|aac/i.test(mime) || /\.(m4a|aac|mp4)$/i.test(currentFile.name);
      const GROQ_LIMIT = 24.5 * 1024 * 1024;
      const CHUNK_SIZE = 8 * 1024 * 1024;
      const isLarge = currentFile.size > GROQ_LIMIT;
      const numChunks = isLarge ? Math.ceil(currentFile.size / CHUNK_SIZE) : 1;

      if (isLarge && isAAC) {
        setStep('upload', 'error', '檔案過大');
        setStep('transcribe', 'error', `M4A 格式 ${fileMB} MB，無法分段`);
        showError(`此集數音訊為 M4A 格式（${fileMB} MB），超過 Groq 25 MB 上限。M4A 容器格式無法安全分段，建議：① 換一集較短的集數試試，② 或手動下載後用工具剪短再上傳`);
        return;
      }

      setStep('upload', 'active', isLarge ? `MP3 ${fileMB} MB，分 ${numChunks} 段處理...` : `${fileMB} MB，正在傳送...`);

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

      setStep('upload', 'done', isLarge ? `分段上傳完成（${numChunks} 段）` : '上傳完成');
    }

    if (isCancelled) return;

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
// attempt: 0-1 = whisper-large-v3-turbo, 2-3 = whisper-large-v3 (fallback)
async function transcribeAudio(file, apiKey, lang, attempt = 0) {
  const model = attempt >= 2 ? 'whisper-large-v3' : 'whisper-large-v3-turbo';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  if (lang) formData.append('language', lang);
  if (!lang || lang === 'zh' || lang === 'yue') {
    formData.append('prompt', '繁體中文，加入標點符號。以下是常見財經詞彙：股票、基金、ETF、殖利率、本益比、市值、股息、除權息、法說會、財報、營收、毛利率、EPS、漲停、跌停、多頭、空頭、技術分析、籌碼、外資、投信、自營商。');
  }

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
  } catch (fetchErr) {
    if (attempt < 3) {
      const delay = [3000, 5000, 8000][attempt] || 5000;
      setStep('transcribe', 'active', `網路錯誤，${delay / 1000} 秒後重試...`);
      await new Promise(r => setTimeout(r, delay));
      return transcribeAudio(file, apiKey, lang, attempt + 1);
    }
    throw new Error(`網路連線失敗，請確認網路穩定後再試（${fetchErr.message}）`);
  }

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
    if (res.status === 500 && attempt < 3) {
      const delays = [3000, 5000, 8000];
      const delay = delays[attempt] || 5000;
      const labels = ['重試中...', '改用備用模型重試...', '再次重試...'];
      setStep('transcribe', 'active', `伺服器錯誤，${delay / 1000} 秒後${labels[attempt] || '重試...'}`);
      await new Promise(r => setTimeout(r, delay));
      return transcribeAudio(file, apiKey, lang, attempt + 1);
    }
    throw new Error(msg);
  }

  return res.json();
}

async function transcribeInChunks(file, apiKey, lang) {
  // SoundOn (and some other platforms) serve M4A/AAC audio with a .mp3 extension
  // and an ID3 tag prepended. Byte-slicing an MP4/M4A container breaks every
  // chunk except the one holding the moov atom — usually only the first one —
  // which is why later segments fail with Groq's generic "not a valid media
  // file" error. Detect the real container and decode+re-chunk as WAV instead.
  const detectedMime = await detectAudioMime(file);
  if (detectedMime === 'audio/mp4') {
    try {
      return await transcribeInChunksViaDecode(file, apiKey, lang);
    } catch (err) {
      throw new Error(`此音訊實際為 M4A/AAC 格式（雖然副檔名是 .mp3），自動轉檔分段失敗：${err.message}。請改用「📁 上傳檔案」直接上傳原始檔案再試一次。`);
    }
  }

  const CHUNK = 8 * 1024 * 1024; // 8 MB per chunk (mobile-friendly)
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

// Decode the full file via Web Audio API and re-chunk as 16kHz mono WAV.
// WAV chunks have no container metadata dependency, so each slice is
// independently decodable — unlike raw-byte-sliced MP4/M4A fragments.
async function transcribeInChunksViaDecode(file, apiKey, lang) {
  setStep('upload', 'active', '解碼音訊中（大型 M4A 檔案需要一些時間）...');
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    ctx.close();
  }

  const TARGET_RATE = 16000; // Whisper's native sample rate — also keeps WAV chunks small
  const CHUNK_SECONDS = 600; // 10 min ≈ 19.2 MB PCM16 mono, safely under Groq's 25 MB limit
  const totalSamplesAtTarget = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));

  setStep('upload', 'active', '重新取樣音訊中...');
  const offlineCtx = new OfflineAudioContext(1, totalSamplesAtTarget, TARGET_RATE);
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);
  const rendered = await offlineCtx.startRendering();
  const samples = rendered.getChannelData(0);

  const samplesPerChunk = CHUNK_SECONDS * TARGET_RATE;
  const totalChunks = Math.max(1, Math.ceil(samples.length / samplesPerChunk));
  const results = [];

  for (let i = 0; i < totalChunks; i++) {
    if (isCancelled) return null;
    const start = i * samplesPerChunk;
    const end = Math.min(start + samplesPerChunk, samples.length);
    const wavBlob = encodeWavPCM16(samples.subarray(start, end), TARGET_RATE);
    const chunkFile = new File([wavBlob], `part${i + 1}.wav`, { type: 'audio/wav' });
    setStep('upload', 'active', `傳送第 ${i + 1} / ${totalChunks} 段...`);
    setStep('transcribe', 'active', `語音辨識第 ${i + 1} / ${totalChunks} 段...`);
    results.push(await transcribeAudio(chunkFile, apiKey, lang));
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

function encodeWavPCM16(floatSamples, sampleRate) {
  const numSamples = floatSamples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ── YouTube Local Proxy Transcribe (time-based segments via ffmpeg) ──
async function transcribeFromLocalProxy(ytUrl, apiKey, lang) {
  const SEG_SECS = 480; // 8 minutes per segment (~7.5 MB at 128 kbps)

  // Get total duration so we know how many segments to expect
  setStep('upload', 'active', '取得影片時長...');
  let totalDuration = null;
  try {
    const infoRes = await fetchWithTimeout(
      `${LOCAL_PROXY}/info?url=${encodeURIComponent(ytUrl)}`, 60000
    );
    if (infoRes.ok) {
      const info = await infoRes.json();
      totalDuration = info.duration || null;
    }
  } catch (_) {}

  const numSegs = totalDuration ? Math.ceil(totalDuration / SEG_SECS) : null;
  const results = [];
  let segIndex = 0;
  let start = 0;

  while (true) {
    if (isCancelled) return null;
    segIndex++;
    const end = start + SEG_SECS;
    const label = numSegs ? `${segIndex} / ${numSegs}` : String(segIndex);

    const startMin = Math.floor(start / 60);
    const endMin = Math.floor(end / 60);

    // First segment triggers full audio download on the proxy (takes 1-3 min).
    // Subsequent segments are cut from the already-downloaded local file (seconds).
    const isFirstSeg = segIndex === 1;
    const baseMsg = isFirstSeg
      ? `下載影片音訊中（首次需 1-3 分鐘，後續各段很快）...`
      : `切割第 ${label} 段（${startMin}分 - ${endMin}分）...`;
    setStep('upload', 'active', baseMsg);

    const segUrl = `${LOCAL_PROXY}/segment?url=${encodeURIComponent(ytUrl)}&start=${start}&end=${end}`;
    let blob;
    try {
      let elapsed = 0;
      const progressTimer = setInterval(() => {
        elapsed++;
        const timeStr = elapsed >= 60
          ? `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`
          : `${elapsed}秒`;
        const msg = isFirstSeg
          ? `下載影片音訊中... 已等待 ${timeStr}（完成後各段只需幾秒）`
          : `切割第 ${label} 段（${startMin}分 - ${endMin}分）... ${timeStr}`;
        setStep('upload', 'active', msg);
      }, 1000);

      let res;
      try {
        // First segment: allow up to 10 min for full audio download + first cut
        // Subsequent segments: local ffmpeg cut only needs 60 s at most
        const timeout = isFirstSeg ? 600000 : 90000;
        res = await fetchWithTimeout(segUrl, timeout);
      } finally {
        clearInterval(progressTimer);
      }

      if (!res.ok) {
        if (segIndex === 1) {
          let errMsg = `代理伺服器錯誤 ${res.status}`;
          try { const j = await res.json(); errMsg = j.error || errMsg; } catch (_) {}
          throw new Error(errMsg);
        }
        break;
      }

      // Proxy returns JSON {"done":true} when time range exceeds audio length
      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) {
        break;
      }
      blob = await res.blob();
    } catch (err) {
      if (segIndex === 1) throw err;
      break; // later segments failing = end of audio
    }

    if (!blob || blob.size < 1000) {
      if (segIndex === 1) throw new Error('代理回傳空音訊，請確認 YouTube 網址正確');
      break;
    }

    setStep('transcribe', 'active', `語音辨識第 ${label} 段...`);
    const chunkFile = new File([blob], `segment${segIndex}.mp3`, { type: 'audio/mpeg' });
    results.push(await transcribeAudio(chunkFile, apiKey, lang));

    start = end;
    if (totalDuration && start >= totalDuration) break;
    if (!totalDuration && blob.size < SEG_SECS * 128 * 1024 / 8 * 0.3) break; // blob much smaller than expected = near end
  }

  if (results.length === 0) throw new Error('無法取得任何音訊片段，請確認代理伺服器正在運行');

  setStep('upload', 'done', `分段完成（共 ${results.length} 段）`);

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

// ── URL Range-Request Transcribe (handles large files without full pre-download) ──
async function transcribeUrlInRanges(url, apiKey, lang) {
  const CHUNK = 8 * 1024 * 1024; // 8 MB per chunk
  let offset = 0;
  let chunkIndex = 0;
  let totalSize = null;
  const results = [];

  while (true) {
    if (isCancelled) return null;

    chunkIndex++;
    const label = () => totalSize
      ? `${chunkIndex} / ${Math.ceil(totalSize / CHUNK)}`
      : String(chunkIndex);

    setStep('upload', 'active', `下載第 ${label()} 段...`);

    let blob, contentRange;
    try {
      ({ blob, contentRange } = await fetchRangeViaProxy(url, offset, offset + CHUNK - 1));
    } catch (err) {
      if (chunkIndex === 1) throw err;
      break; // later chunks failing = end of file
    }

    if (!blob || blob.size === 0) break;

    // Discover total size from first Content-Range response
    if (totalSize === null && contentRange) {
      const m = contentRange.match(/\/(\d+)$/);
      if (m) totalSize = parseInt(m[1]);
    }

    const mime = await detectAudioMime(blob) || 'audio/mpeg';
    const ext = mime.includes('mp4') ? '.m4a' : '.mp3';
    const GROQ_LIMIT = 24.5 * 1024 * 1024;

    if (blob.size > GROQ_LIMIT) {
      // Server ignored Range header and returned the full file at once.
      // MP3 can be safely byte-split; M4A cannot.
      if (mime.includes('mp4')) {
        throw new Error(`音訊為 M4A 格式（${Math.round(blob.size / 1024 / 1024)} MB），超過 Groq 25MB 限制且無法分段`);
      }
      const subTotal = Math.ceil(blob.size / CHUNK);
      for (let s = 0; s < subTotal; s++) {
        if (isCancelled) return null;
        const subBlob = blob.slice(s * CHUNK, Math.min((s + 1) * CHUNK, blob.size), mime);
        setStep('upload', 'active', `處理第 ${s + 1} / ${subTotal} 段...`);
        setStep('transcribe', 'active', `語音辨識第 ${s + 1} / ${subTotal} 段...`);
        const subFile = new File([subBlob], `chunk_${s + 1}${ext}`, { type: mime });
        results.push(await transcribeAudio(subFile, apiKey, lang));
      }
      break; // whole file already processed
    }

    setStep('transcribe', 'active', `語音辨識第 ${label()} 段...`);
    const chunkFile = new File([blob], `chunk${chunkIndex}${ext}`, { type: mime });
    results.push(await transcribeAudio(chunkFile, apiKey, lang));

    offset += blob.size;
    const isLast = totalSize ? offset >= totalSize : blob.size < CHUNK;
    if (isLast) break;
  }

  if (results.length === 0) throw new Error('無法下載任何音訊資料，請確認網路連線');

  setStep('upload', 'done', `分段下載完成（共 ${results.length} 段）`);

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

async function fetchRangeViaProxy(url, start, end) {
  const rangeHeader = `bytes=${start}-${end}`;

  // Try direct fetch first (works when server allows CORS + range)
  try {
    const res = await fetchWithTimeout(url, 30000, { headers: { Range: rangeHeader } });
    if (res.ok || res.status === 206) {
      const contentRange = res.headers.get('Content-Range');
      const blob = await streamToBlob(res, null, null);
      if (blob.size > 0) return { blob, contentRange };
    }
  } catch (_) {}

  // CORS proxies — pass Range header so they forward it to the origin
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetchWithTimeout(proxyUrl, 45000, { headers: { Range: rangeHeader } });
      if (res.ok || res.status === 206) {
        const contentRange = res.headers.get('Content-Range');
        const blob = await streamToBlob(res, null, null);
        if (blob.size > 0) return { blob, contentRange };
      }
    } catch (_) {}
  }

  throw new Error('所有下載管道均失敗，請確認網路連線後再試');
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
  currentAudioUrl = null;
  currentYouTubeUrl = null;
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
  const rawName = currentFile?.name || dom.urlFileName.textContent || 'transcript';
  const filename = rawName.replace(/\.[^.]+$/, '') + '_transcript.txt';
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
  const title = currentFile
    ? currentFile.name.replace(/\.[^.]+$/, '')
    : (dom.urlFileName.textContent || '未知');
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
