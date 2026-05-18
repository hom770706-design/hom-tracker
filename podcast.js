/* ── Podcast Transcriber ── */
'use strict';

let currentFile = null;
let isCancelled = false;
let transcriptData = null;
let summaryData = null;

const dom = {
  settingsToggle: document.getElementById('settings-toggle'),
  settingsBody: document.getElementById('settings-body'),
  settingsChevron: document.getElementById('settings-chevron'),
  settingsBadge: document.getElementById('settings-badge'),
  groqKey: document.getElementById('groq-key'),
  saveKeysBtn: document.getElementById('save-keys-btn'),
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
  upload: { el: document.getElementById('step-upload'), desc: document.getElementById('step-upload-desc') },
  transcribe: { el: document.getElementById('step-transcribe'), desc: document.getElementById('step-transcribe-desc') },
  summarize: { el: document.getElementById('step-summarize'), desc: document.getElementById('step-summarize-desc') },
};

function init() {
  loadKeys();
  setupSettingsToggle();
  setupEyeButtons();
  setupDropZone();
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
    dom.settingsBody.classList.contains('collapsed') ? expandSettings() : collapseSettings();
  });
  dom.settingsToggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom.settingsToggle.click(); }
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

// ── File Handling ──
function setupDropZone() {
  dom.dropZone.addEventListener('click', () => dom.fileInput.click());
  dom.dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') dom.fileInput.click(); });
  dom.fileInput.addEventListener('change', e => { if (e.target.files[0]) selectFile(e.target.files[0]); });
  dom.dropZone.addEventListener('dragover', e => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
  dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
  dom.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dom.dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
  });
  dom.removeFileBtn.addEventListener('click', clearFile);
}

function selectFile(file) {
  const ALLOWED = ['audio/mpeg','audio/mp3','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/m4a','audio/x-m4a','video/mp4'];
  const MAX_MB = 25;
  if (!ALLOWED.includes(file.type) && !file.name.match(/\.(mp3|mp4|m4a|wav|webm|mpeg|mpga)$/i)) {
    showError('不支援的檔案格式。請上傳 MP3、MP4、WAV、M4A 或 WEBM 音訊檔案。'); return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    showError(`檔案大小超過 ${MAX_MB}MB 限制（Groq Whisper API 限制）。`); return;
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
  dom.copySummaryBtn.addEventListener('click', copySummary);
  dom.copyTranscriptBtn.addEventListener('click', copyTranscript);
  dom.downloadBtn.addEventListener('click', downloadTranscript);
  dom.newBtn.addEventListener('click', resetToUpload);
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
  if (!groqKey) { showError('請先設定 Groq API 金鑰。'); expandSettings(); return; }

  isCancelled = false;
  clearError();
  showProgress();

  try {
    setStep('upload', 'active', '正在上傳至 Groq...');
    setStep('transcribe', 'idle', '等待上傳完成...');
    setStep('summarize', 'idle', '等待語音辨識完成...');
    if (isCancelled) return;

    const lang = dom.langSelect.value;
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
    try { const err = await res.json(); msg = err.error?.message || msg; } catch (_) {}
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
{"summary":"...","keyPoints":["..."],"topics":["..."],"actionItems":["..."]}

注意：如果沒有行動建議，actionItems 請回傳空陣列 []。

文字稿：
${truncated}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('無法解析 Groq 回應');
  try { return JSON.parse(m[0]); } catch (_) { throw new Error('摘要格式解析失敗'); }
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
  (s.keyPoints || []).forEach(pt => { const li = document.createElement('li'); li.textContent = pt; dom.keyPointsList.appendChild(li); });
  dom.topicsTags.innerHTML = '';
  (s.topics || []).forEach(t => { const span = document.createElement('span'); span.className = 'topic-tag'; span.textContent = t; dom.topicsTags.appendChild(span); });
  const actions = s.actionItems || [];
  if (actions.length > 0) {
    dom.actionItemsList.innerHTML = '';
    actions.forEach(a => { const li = document.createElement('li'); li.textContent = a; dom.actionItemsList.appendChild(li); });
    dom.actionsBlock.classList.remove('hidden');
  } else {
    dom.actionsBlock.classList.add('hidden');
  }
}

function displayTranscript(data) {
  const parts = [data.language && `語言：${data.language}`, data.duration && `時長：${formatDuration(data.duration)}`].filter(Boolean);
  dom.transcriptMeta.textContent = parts.join('　|　');
  dom.transcriptContent.innerHTML = '';
  const segments = data.segments;
  if (segments && segments.length > 0) {
    const groups = [[segments[0]]];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].start - segments[i-1].end > 2.5) groups.push([segments[i]]);
      else groups[groups.length-1].push(segments[i]);
    }
    groups.forEach(group => {
      const div = document.createElement('div');
      div.className = 'transcript-segment';
      const ts = document.createElement('span');
      ts.className = 'transcript-timestamp';
      ts.textContent = formatTimestamp(group[0].start);
      const txt = document.createElement('div');
      txt.className = 'transcript-text';
      txt.textContent = group.map(s => s.text.trim()).join(' ');
      div.appendChild(ts); div.appendChild(txt);
      dom.transcriptContent.appendChild(div);
    });
  } else {
    const p = document.createElement('p');
    p.className = 'transcript-text';
    p.textContent = data.text || '';
    dom.transcriptContent.appendChild(p);
  }
}

function showProgress() {
  document.getElementById('upload-card').classList.add('hidden');
  dom.progressCard.classList.remove('hidden');
}
function hideProgress() { dom.progressCard.classList.add('hidden'); }

function setStep(name, state, desc) {
  steps[name].el.dataset.state = state;
  steps[name].desc.textContent = desc;
  const connectors = dom.progressCard.querySelectorAll('.step-connector');
  ['upload','transcribe','summarize'].forEach((n, i) => {
    if (connectors[i]) connectors[i].classList.toggle('done', steps[n].el.dataset.state === 'done');
  });
}

function resetToUpload() {
  dom.progressCard.classList.add('hidden');
  dom.resultsSection.classList.add('hidden');
  document.getElementById('upload-card').classList.remove('hidden');
  clearError();
  setStep('upload', 'idle', '準備上傳...');
  setStep('transcribe', 'idle', '等待上傳完成...');
  setStep('summarize', 'idle', '等待語音辨識完成...');
  clearFile();
  transcriptData = null; summaryData = null;
}

function showError(msg) { dom.errorText.textContent = msg; dom.errorBanner.classList.remove('hidden'); }
function clearError() { dom.errorBanner.classList.add('hidden'); dom.errorText.textContent = ''; }

function copySummary() {
  if (!summaryData) return;
  const lines = ['【內容概要】', summaryData.summary || '', '', '【重點整理】',
    ...(summaryData.keyPoints || []).map(p => `• ${p}`), '', '【主要話題】',
    (summaryData.topics || []).join('、')];
  if ((summaryData.actionItems || []).length > 0)
    lines.push('', '【行動建議】', ...summaryData.actionItems.map(a => `☐ ${a}`));
  copyText(lines.join('\n'), dom.copySummaryBtn);
}

function copyTranscript() {
  if (!transcriptData) return;
  const text = transcriptData.segments?.length
    ? transcriptData.segments.map(s => `[${formatTimestamp(s.start)}] ${s.text.trim()}`).join('\n')
    : transcriptData.text || '';
  copyText(text, dom.copyTranscriptBtn);
}

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
  showToast(btn, '已複製 ✓');
}

function downloadTranscript() {
  if (!transcriptData) return;
  const filename = (currentFile?.name || 'transcript').replace(/\.[^.]+$/, '') + '_transcript.txt';
  let content = 'Podcast 文字稿\n' + '='.repeat(40) + '\n\n';
  if (summaryData) {
    content += `【摘要】\n${summaryData.summary || ''}\n\n`;
    if (summaryData.keyPoints?.length) content += `【重點整理】\n${summaryData.keyPoints.map(p => `• ${p}`).join('\n')}\n\n`;
    if (summaryData.topics?.length) content += `【主要話題】\n${summaryData.topics.join('、')}\n\n`;
    content += '='.repeat(40) + '\n\n';
  }
  content += '【完整文字稿】\n';
  content += transcriptData.segments?.length
    ? transcriptData.segments.map(s => `[${formatTimestamp(s.start)}] ${s.text.trim()}`).join('\n')
    : (transcriptData.text || '');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(seconds) {
  const s = Math.floor(seconds), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formatDuration(seconds) {
  const s = Math.floor(seconds), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return `${h} 小時 ${m} 分`;
  if (m > 0) return `${m} 分 ${sec} 秒`;
  return `${sec} 秒`;
}

function showToast(btn, msg) {
  const orig = btn.innerHTML;
  btn.innerHTML = msg; btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
}

init();