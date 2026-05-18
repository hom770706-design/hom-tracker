/* ── Podcast Transcriber ── */
'use strict';

// ── State ──
let currentFile = null;
let isCancelled = false;
let transcriptData = null;
let summaryData = null;

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
  setupEyeButtons();
  setupDropZone();
  setupInputTabs();
  setupButtons();
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
    // Try rss2json.com first — purpose-built RSS service with proper CORS headers
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

    // Fallback: fetch raw XML via CORS proxy
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

async function fetchAudioUrl(url) {
  dom.fetchUrlBtn.disabled = true;
  dom.fetchUrlBtn.textContent = '載入中...';
  clearError();

  try {
    const blob = await fetchBlobWithFallback(url);
    if (blob.size > 25 * 1024 * 1024) throw new Error('檔案大小超過 25MB 限制。');

    const filename = url.split('/').pop().split('?')[0] || 'audio.mp3';
    currentFile = new File([blob], filename, { type: blob.type || 'audio/mpeg' });

    dom.urlFileName.textContent = filename;
    dom.urlFileMeta.textContent = `${formatFileSize(blob.size)} · 從網址載入`;
    dom.urlFileInfo.classList.remove('hidden');
    dom.fetchUrlBtn.textContent = '✓ 已載入';
    updateStartBtn();
  } catch (err) {
    showError(err.message);
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
  }
}

async function fetchBlobWithFallback(url) {
  // Try direct fetch first
  try {
    const res = await fetch(url);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('audio') || ct.includes('video') || ct.includes('octet-stream') || ct.includes('mpeg')) {
        return await res.blob();
      }
      throw new Error(`WRONG_TYPE:${ct}`);
    }
  } catch (err) {
    if (err.message.startsWith('WRONG_TYPE:')) {
      throw new Error(`此網址回傳的不是音訊檔案（${err.message.slice(11)}）`);
    }
    // CORS or network error — fall through to proxy
  }

  // Retry via CORS proxy (with fallback)
  try {
    const res = await fetchViaProxy(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — 無法存取此網址`);
    return await res.blob();
  } catch (err) {
    throw new Error(err.message.includes('Proxy') ? err.message : '無法載入此音訊（網址錯誤或連結已失效）。');
  }
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
  const MAX_MB = 25;

  if (!ALLOWED.includes(file.type) && !file.name.match(/\.(mp3|mp4|m4a|wav|webm|mpeg|mpga)$/i)) {
    showError('不支援的檔案格式。請上傳 MP3、MP4、WAV、M4A 或 WEBM 音訊檔案。');
    return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    showError(`檔案大小超過 ${MAX_MB}MB 限制（Groq Whisper API 限制）。`);
    return;
  }

  currentFile = file;
  dom.fileName.textContent = file.name;
  dom.fileMeta.textContent = `${formatFileSize(file.size)} · ${file.type || '音訊檔案'}`;
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
    currentFile = null;
    dom.audioUrl.value = '';
    dom.urlFileInfo.classList.add('hidden');
    clearEpisodeList();
    dom.fetchUrlBtn.disabled = false;
    dom.fetchUrlBtn.textContent = '⬇️ 載入';
    updateStartBtn();
  });
  dom.audioUrl.addEventListener('keydown', e => { if (e.key === 'Enter') handleFetchUrl(); });
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
    setStep('upload', 'active', '正在傳送音訊檔案...');

    let result;
    try {
      result = await transcribeAudio(currentFile, groqKey, lang);
    } catch (err) {
      setStep('upload', 'error', '上傳失敗');
      setStep('transcribe', 'error', err.message);
      showError(`語音辨識失敗：${err.message}`);
      return;
    }

    if (isCancelled) return;

    setStep('upload', 'done', '上傳完成');
    setStep('transcribe', 'done', `偵測語言：${result.language || '未知'}，共 ${formatDuration(result.duration || 0)}`);
    transcriptData = result;

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

// ── Groq LLaMA API ──
async function summarizeWithGroq(text, apiKey, model) {
  const truncated = text.length > 60000 ? text.slice(0, 60000) + '\n...[內容過長，已截斷]' : text;

  const prompt = `以下是一段 Podcast 的文字稿內容。請仔細閱讀後，用繁體中文提供以下分析：

1. 整體摘要（2-3句話說明主旨）
2. 5-8個重點條列（最重要的資訊、論點或發現）
3. 3-6個主要話題關鍵字
4. 行動建議（如有）

請嚴格回傳以下 JSON 格式，不要包含任何 JSON 以外的文字：
{
  "summary": "2-3句整體摘要...",
  "keyPoints": ["重點1", "重點2", "重點3"],
  "topics": ["話題1", "話題2", "話題3"],
  "actionItems": ["建議1", "建議2"]
}

注意：如果沒有行動建議，actionItems 請回傳空陣列 []。

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
      max_tokens: 2048,
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
  if (transcriptData.segments?.length) {
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
  if (transcriptData.segments?.length) {
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

// ── Start ──
init();
