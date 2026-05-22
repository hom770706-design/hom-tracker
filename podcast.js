/* ── Podcast Transcriber ── */
'use strict';

// ── State ──
let currentFile = null;
let isCancelled = false;
let transcriptData = null;
let summaryData = null;

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
  modelSelect: document.getElementById('model-select'),
  startBtn: document.getElementById('start-btn'),
  progressCard: document.getElementById('progress-card'),
  cancelBtn: document.getElementById('cancel-btn'),
  errorBanner: document.getElementById('error-banner'),
  errorText: document.getElementById('error-text'),
  errorClose: document.getElementById('error-close'),
  resultsSection: document.getElementById('results-section'),
  summaryText: document.getElementById('summary-text'),
  keyPointsList: document.getElementById('key-points-list'),
  topicsTags: document.getElementById('topics-tags'),
  actionsBlock: document.getElementById('actions-block'),
  actionItemsList: document.getElementById('action-items-list'),
  transcriptMeta: document.getElementById('transcript-meta'),
  transcriptContent: document.getElementById('transcript-content'),
  copySummaryBtn: document.getElementById('copy-summary-btn'),
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
  summarize: {
    el: document.getElementById('step-summarize'),
    desc: document.getElementById('step-summarize-desc'),
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
function handleFetchUrl() {
  let url = dom.audioUrl.value.trim().replace(/^<(.+)>$/, '$1');
  dom.audioUrl.value = url;
  if (!url) { showError('請輸入網址。'); return; }
  if (looksLikeRss(url)) {
    fetchRssEpisodes(url);
  } else {
    fetchAudioUrl(url);
  }
}

function looksLikeRss(url) {
  return /\.xml(\?|$)/i.test(url) || /\/feeds?\b/i.test(url) || /feeds\./i.test(url);
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

async function fetchRssEpisodes(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '載入集數中...';
  clearError();
  clearEpisodeList();

  try {
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    try {
      const r = await fetchWithTimeout(rss2jsonUrl, 12000);
      if (r.ok) {
        const data = await r.json();
        if (data.status === 'ok' && data.items?.length > 0) {
          const episodes = data.items.slice(0, 50)
            .filter(item => item.enclosure?.link)
            .map(item => ({
              title: item.title || '無標題',
              url: item.enclosure.link,
              pubDate: item.pubDate || '',
            }));
          if (episodes.length > 0) { showEpisodeList(episodes); return; }
        }
      }
    } catch (_) {}

    const res = await fetchViaProxy(url);
    const text = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('RSS 格式解析失敗');

    const items = Array.from(doc.querySelectorAll('item'));
    if (items.length === 0) throw new Error('找不到集數，請確認是正確的 RSS 訂閱連結');

    const episodes = items.slice(0, 50).map(item => ({
      title: item.querySelector('title')?.textContent?.trim() || '無標題',
      url: item.querySelector('enclosure')?.getAttribute('url') || '',
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
    currentFile = new File([blob], filename, { type: blob.type || 'audio/mpeg' });

    const sizeNote = blob.size > 24 * 1024 * 1024 ? '（將自動分段處理）' : '';
    dom.urlFileName.textContent = filename;
    dom.urlFileMeta.textContent = `${formatFileSize(blob.size)} · 從網址載入 ${sizeNote}`;
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已載入';
    updateStartBtn();
  } catch (err) {
    if (err.name === 'AbortError') return;
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
  }

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
  dom.copySummaryBtn.addEventListener('click', () => copySummary());
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

  const hintRssUrl = document.getElementById('hint-rss-url');
  if (hintRssUrl) {
    hintRssUrl.addEventListener('click', () => {
      dom.audioUrl.value = 'https://feeds.soundon.fm/podcasts/91be014b-9f55-4bf3-a910-b232eda82d11.xml';
      handleFetchUrl();
    });
  }
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
    setStep('summarize', 'idle', '等待語音辨識完成...');

    if (isCancelled) return;

    const lang = dom.langSelect.value;
    const isLarge = currentFile.size > 24 * 1024 * 1024;
    const numChunks = isLarge ? Math.ceil(currentFile.size / (20 * 1024 * 1024)) : 1;
    setStep('upload', 'active', isLarge ? `檔案較大，將分 ${numChunks} 段處理...` : '正在傳送音訊檔案...');

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

    setStep('summarize', 'active', '格式化文字稿（繁體中文 + 標點）...');
    try {
      const formatted = await formatTranscript(result.text, groqKey);
      if (formatted) result.formattedText = formatted;
    } catch (_) {}

    if (isCancelled) return;

    setStep('summarize', 'active', '正在分析內容並生成摘要...');

    const model = dom.modelSelect.value;
    let summary;
    try {
      summary = await summarizeWithGroq(result.text, groqKey, model);
    } catch (err) {
      setStep('summarize', 'error', err.message);
      showError(`摘要生成失敗：${err.message}`);
      displayTranscript(result);
      dom.resultsSection.classList.remove('hidden');
      return;
    }

    if (isCancelled) return;

    setStep('summarize', 'done', '摘要生成完成');
    summaryData = summary;

    displayResults(result, summary);
    saveToHistory();

  } finally {
    hideProgress();
  }
}

// ── Groq Whisper API ──
async function transcribeAudio(file, apiKey, lang) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');
  if (lang) formData.append('language', lang);
  if (!lang || lang === 'zh' || lang === 'yue') {
    formData.append('prompt', '繁體中文，加入標點符號。');
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
    throw new Error(msg);
  }

  return res.json();
}

async function transcribeInChunks(file, apiKey, lang) {
  const CHUNK = 20 * 1024 * 1024;
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

// ── Groq LLaMA API ──
async function summarizeWithGroq(text, apiKey, model) {
  const maxChars = model.includes('8b') ? 20000 : 6000;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + '\n...[內容過長，已截斷]' : text;

  const prompt = `以下是一段 Podcast 的文字稿內容（若包含簡體中文，輸出請全部轉換為繁體中文）。請仔細閱讀後，用繁體中文提供以下分析：

1. 整體摘要：3-5句話，說明主旨、核心觀點與結論。
2. 重點整理：列出 5-8 條。每條必須是「獨立完整的段落」，包含：主題標題、核心觀點、具體論據或例子、延伸說明。每條字數需達 200-300 字，讓讀者不看原始內容也能完全理解該重點。格式：「【主題】內文...」。
3. 主要話題關鍵字：3-6個。
4. 行動建議：具體可執行的建議（如有）。

請嚴格回傳以下 JSON 格式，不要包含任何 JSON 以外的文字：
{
  "summary": "3-5句整體摘要...",
  "keyPoints": ["【主題A】詳細說明200-300字...", "【主題B】詳細說明200-300字..."],
  "topics": ["話題1", "話題2", "話題3"],
  "actionItems": ["具體建議1", "具體建議2"]
}

注意：keyPoints 每條必須是 200-300 字的完整段落，包含論點、例子與說明，絕對不能只有標題或一兩句話。如果沒有行動建議，actionItems 請回傳空陣列 []。

文字稿：
${truncated}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: model.includes('8b') ? 6000 : 4500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('無法解析 Groq 回應');

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (_) {
    throw new Error('摘要格式解析失敗');
  }
}

// ── Display ──
function displayResults(transcript, summary) {
  displaySummary(summary);
  displayTranscript(transcript);
  dom.resultsSection.classList.remove('hidden');
  dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displaySummary(s) {
  dom.summaryText.textContent = s.summary || '';

  dom.keyPointsList.innerHTML = '';
  (s.keyPoints || []).forEach(pt => {
    const li = document.createElement('li');
    li.textContent = pt;
    dom.keyPointsList.appendChild(li);
  });

  dom.topicsTags.innerHTML = '';
  (s.topics || []).forEach(t => {
    const span = document.createElement('span');
    span.className = 'topic-tag';
    span.textContent = t;
    dom.topicsTags.appendChild(span);
  });

  const actions = s.actionItems || [];
  if (actions.length > 0) {
    dom.actionItemsList.innerHTML = '';
    actions.forEach(a => {
      const li = document.createElement('li');
      li.textContent = a;
      dom.actionItemsList.appendChild(li);
    });
    dom.actionsBlock.classList.remove('hidden');
  } else {
    dom.actionsBlock.classList.add('hidden');
  }
}

function displayTranscript(data) {
  const duration = data.duration ? `時長：${formatDuration(data.duration)}` : '';
  const lang = data.language ? `語言：${data.language}` : '';
  const parts = [lang, duration].filter(Boolean);
  dom.transcriptMeta.textContent = parts.join('　|　');

  dom.transcriptContent.innerHTML = '';

  if (data.formattedText) {
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

  const allSteps = ['upload', 'transcribe', 'summarize'];
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
  setStep('summarize', 'idle', '等待語音辨識完成...');
  clearFile();
  dom.audioUrl.value = '';
  dom.urlFileInfo.classList.add('hidden');
  clearEpisodeList();
  dom.fetchUrlBtn.disabled = false;
  dom.fetchUrlBtn.textContent = '⬇️ 載入';
  switchTab('file');
  transcriptData = null;
  summaryData = null;
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
function copySummary() {
  if (!summaryData) return;
  const lines = [
    '【內容概要】',
    summaryData.summary || '',
    '',
    '【重點整理】',
    ...(summaryData.keyPoints || []).map(p => `• ${p}`),
    '',
    '【主要話題】',
    (summaryData.topics || []).join('、'),
  ];
  if ((summaryData.actionItems || []).length > 0) {
    lines.push('', '【行動建議】', ...(summaryData.actionItems).map(a => `☐ ${a}`));
  }
  copyText(lines.join('\n'), dom.copySummaryBtn);
}

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
  let content = `Podcast 文字稿\n`;
  content += `${'='.repeat(40)}\n\n`;

  if (summaryData) {
    content += `【摘要】\n${summaryData.summary}\n\n`;
    if (summaryData.keyPoints?.length) {
      content += `【重點整理】\n${(summaryData.keyPoints).map(p => `• ${p}`).join('\n')}\n\n`;
    }
    if (summaryData.topics?.length) {
      content += `【主要話題】\n${summaryData.topics.join('、')}\n\n`;
    }
    content += `${'='.repeat(40)}\n\n`;
  }

  content += `【完整文字稿】\n`;
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
  if (!summaryData || !transcriptData) return;
  const title = (currentFile?.name || '未知').replace(/\.[^.]+$/, '');
  const item = {
    id: Date.now().toString(),
    title,
    date: new Date().toISOString(),
    duration: transcriptData.duration || 0,
    language: transcriptData.language || '',
    summary: summaryData,
    transcriptText: (transcriptData.formattedText || transcriptData.text || '').slice(0, 15000),
  };
  const history = loadHistory();
  history.unshift(item);
  if (history.length > HISTORY_MAX) history.splice(HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (_) {
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
  summaryData = item.summary;
  displayResults(transcriptData, summaryData);
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
    const s = item.summary?.summary || '';
    preview.textContent = s.length > 70 ? s.slice(0, 70) + '…' : s;

    const viewBtn = document.createElement('button');
    viewBtn.className = 'history-view-btn';
    viewBtn.type = 'button';
    viewBtn.textContent = '查看完整摘要 →';
    viewBtn.addEventListener('click', () => viewHistoryItem(item.id));

    el.appendChild(header);
    el.appendChild(preview);
    el.appendChild(viewBtn);
    list.appendChild(el);
  });
}

// ── Start ──
init();
