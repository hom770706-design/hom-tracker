'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  profile:       null,   // { name, gender, birthYear, height, currentWeight, targetWeight, activityLevel, injectionDose, injectionDay }
  weightLogs:    [],     // [{ date:'YYYY-MM-DD', weight:number, note:string }]
  foodLogs:      {},     // { 'YYYY-MM-DD': [{ name, calories, protein, carbs, fat, mealType, time }] }
  injectionLogs: [],     // [{ date, time, dose, site, notes }]
  currentFoodDate: '',
};

let _selectedMealType = 'breakfast';
let _searchResults    = [];
let _toastTimer       = null;

// ─── Storage ─────────────────────────────────────────────────────────────────
function loadData() {
  state.profile       = JSON.parse(localStorage.getItem('hom_profile')    || 'null');
  state.weightLogs    = JSON.parse(localStorage.getItem('hom_weights')    || '[]');
  state.foodLogs      = JSON.parse(localStorage.getItem('hom_foods')      || '{}');
  state.injectionLogs = JSON.parse(localStorage.getItem('hom_injections') || '[]');
}

function saveData() {
  localStorage.setItem('hom_profile',    JSON.stringify(state.profile));
  localStorage.setItem('hom_weights',    JSON.stringify(state.weightLogs));
  localStorage.setItem('hom_foods',      JSON.stringify(state.foodLogs));
  localStorage.setItem('hom_injections', JSON.stringify(state.injectionLogs));
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
}

function fmtDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// ─── Nutrition calculations ────────────────────────────────────────────────────
function calcBMR(p) {
  if (!p || !p.height || !p.currentWeight || !p.birthYear) return 1600;
  const age = new Date().getFullYear() - p.birthYear;
  return p.gender === 'female'
    ? 10 * p.currentWeight + 6.25 * p.height - 5 * age - 161
    : 10 * p.currentWeight + 6.25 * p.height - 5 * age + 5;
}

function calcTDEE(p) {
  const m = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  return calcBMR(p) * (m[p.activityLevel] || 1.2);
}

function calcTargets(p) {
  if (!p || !p.height) return { calories: 1600, protein: 100 };
  const tdee = calcTDEE(p);
  const minCal = p.gender === 'female' ? 1200 : 1500;
  const targetCal = Math.max(minCal, Math.round(tdee - 600));
  // GLP-1 users need more protein (1.4–1.6 g/kg) to preserve muscle during rapid loss
  const targetProt = Math.round(p.currentWeight * 1.5);
  return { calories: targetCal, protein: targetProt };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('today-date').textContent = fmtDateFull(todayStr());

  // Weight
  const sorted = [...state.weightLogs].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] || null;
  const prev   = sorted[sorted.length - 2] || null;

  document.getElementById('current-weight').textContent = latest ? latest.weight : '--';

  const changeEl = document.getElementById('weight-change');
  const metaEl   = document.getElementById('weight-meta');
  if (latest && prev) {
    const diff = (latest.weight - prev.weight).toFixed(1);
    changeEl.textContent = (diff > 0 ? '+' : '') + diff + ' kg';
    changeEl.className = 'weight-change ' + (diff > 0 ? 'up' : 'down');
  } else {
    changeEl.textContent = '';
    changeEl.className = 'weight-change';
  }

  if (latest && state.profile?.targetWeight) {
    const remaining = (latest.weight - state.profile.targetWeight).toFixed(1);
    metaEl.textContent = remaining > 0
      ? `距離目標還剩 ${remaining} kg`
      : '已達目標！恭喜！';
  } else {
    metaEl.textContent = '';
  }

  // Nutrition
  const targets = calcTargets(state.profile);
  document.getElementById('calories-target').textContent = targets.calories;
  document.getElementById('protein-target').textContent  = targets.protein;

  const foods = state.foodLogs[todayStr()] || [];
  const eaten = sumNutrition(foods);

  document.getElementById('calories-eaten').textContent = Math.round(eaten.calories);
  document.getElementById('protein-eaten').textContent  = Math.round(eaten.protein);

  setBar('calories-bar', eaten.calories, targets.calories);
  setBar('protein-bar',  eaten.protein,  targets.protein, true);

  const calRemain  = targets.calories - Math.round(eaten.calories);
  const protRemain = targets.protein  - Math.round(eaten.protein);
  document.getElementById('calories-remain').textContent =
    calRemain  > 0 ? `還可以吃 ${calRemain} kcal` : `已超出 ${Math.abs(calRemain)} kcal`;
  document.getElementById('protein-remain').textContent  =
    protRemain > 0 ? `還需要 ${protRemain} g 蛋白質` : '蛋白質目標達成！';

  renderInjectionStatusDash();
  renderDailyTips(eaten, targets);
}

function setBar(id, val, max, isProtein) {
  const el = document.getElementById(id);
  const pct = Math.min(100, (val / max) * 100);
  el.style.width = pct + '%';
  el.className = 'progress-fill' + (isProtein ? ' protein' : '') + (pct >= 100 ? ' over' : '');
}

function sumNutrition(foods) {
  return foods.reduce((acc, f) => ({
    calories: acc.calories + (parseFloat(f.calories) || 0),
    protein:  acc.protein  + (parseFloat(f.protein)  || 0),
    carbs:    acc.carbs    + (parseFloat(f.carbs)     || 0),
    fat:      acc.fat      + (parseFloat(f.fat)       || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderInjectionStatusDash() {
  const el = document.getElementById('injection-status-dash');
  if (!state.profile?.injectionDay && state.profile?.injectionDay !== 0) {
    el.innerHTML = '<span style="color:var(--text-light);font-size:14px">請在設定中填入注射日</span>';
    return;
  }
  el.innerHTML = buildInjectionStatusHTML();
}

function buildInjectionStatusHTML() {
  const today       = new Date();
  const targetDay   = parseInt(state.profile.injectionDay);
  const dayNames    = ['日','一','二','三','四','五','六'];
  const lastInj     = getLastInjection();

  if (lastInj) {
    const lastDate = new Date(lastInj.date + 'T00:00:00');
    const diffDays = daysBetween(lastInj.date, todayStr());

    if (diffDays === 0) {
      return `<p class="status-ok" style="font-size:15px">✓ 今天已打針（${lastInj.dose}）</p>
              <p style="font-size:13px;color:var(--text-light);margin-top:4px">下次預計 7 天後</p>`;
    }

    const nextDate     = addDays(lastInj.date, 7);
    const daysToNext   = daysBetween(todayStr(), nextDate);

    if (daysToNext > 0) {
      return `<p style="font-size:14px">距離下次打針</p>
              <p style="font-size:38px;font-weight:800;color:var(--primary);line-height:1.1">${daysToNext} <span style="font-size:18px">天</span></p>
              <p style="font-size:13px;color:var(--text-light);margin-top:4px">預計：${fmtDate(nextDate)}（${lastInj.dose}）</p>`;
    }

    if (daysToNext === 0) {
      return `<p class="status-warn" style="font-size:15px">今天是打針日！</p>
              <p style="font-size:13px;color:var(--text-light);margin-top:4px">上次：${fmtDate(lastInj.date)}</p>`;
    }

    return `<p class="status-warn" style="font-size:15px">已逾期 ${Math.abs(daysToNext)} 天未打針</p>
            <p style="font-size:13px;color:var(--text-light);margin-top:4px">上次：${fmtDate(lastInj.date)}</p>`;
  }

  let daysUntil = (targetDay - today.getDay() + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  return `<p style="font-size:14px">預定注射日：<strong>星期${dayNames[targetDay]}</strong></p>
          <p style="font-size:14px;color:var(--amber);margin-top:4px">還有 ${daysUntil} 天</p>`;
}

function getLastInjection() {
  if (state.injectionLogs.length === 0) return null;
  return [...state.injectionLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
}

const GLP1_TIPS = [
  '💧 記得補水！建議每天至少 2000ml，配合猛健樂效果更好。',
  '🥩 每餐優先吃蛋白質，再吃蔬菜，最後才吃主食，有助控制血糖。',
  '🍽️ 注射猛健樂後食慾會降低，請注意每餐仍需攝取足夠蛋白質，避免肌肉流失。',
  '💊 建議每日補充複合維生素，特別是維生素B12、維生素D和鐵。',
  '🚶 適度有氧運動（如快走、游泳）搭配阻力訓練，有效維持肌肉量。',
  '😴 充足睡眠（7–8小時）有助於控制飢餓素，減少夜間飢餓感。',
  '🥗 進食速度放慢，充分咀嚼，更容易感覺飽足，也減少腸胃不適。',
];

function renderDailyTips(eaten, targets) {
  const tips = [];

  if (eaten.protein < targets.protein * 0.5) {
    tips.push(`⚠️ <strong>蛋白質嚴重不足！</strong>今天還差 ${Math.round(targets.protein - eaten.protein)}g，請盡快補充（雞胸肉、雞蛋、豆腐、蛋白粉均可）。`);
  } else if (eaten.protein < targets.protein * 0.85) {
    tips.push(`💪 蛋白質還差 ${Math.round(targets.protein - eaten.protein)}g，可以再來一份高蛋白食物。`);
  } else {
    tips.push('✅ 蛋白質攝取良好！繼續保持。');
  }

  if (eaten.calories > targets.calories * 1.05) {
    tips.push(`🔥 今日卡路里已超出 ${Math.round(eaten.calories - targets.calories)} kcal，晚餐建議選擇清淡食物。`);
  }

  const dayIdx = new Date().getDay();
  tips.push(GLP1_TIPS[dayIdx % GLP1_TIPS.length]);

  document.getElementById('daily-tips').innerHTML =
    tips.map(t => `<div class="tip-item">${t}</div>`).join('');
}

// ─── Food Tab ─────────────────────────────────────────────────────────────────
function renderFoodTab() {
  const dateStr = state.currentFoodDate;
  document.getElementById('food-date-label').textContent = fmtDate(dateStr);

  const isToday = dateStr === todayStr();
  document.getElementById('date-next-btn').style.opacity = isToday ? '0.3' : '1';
  document.getElementById('date-next-btn').disabled = isToday;

  const foods  = state.foodLogs[dateStr] || [];
  const totals = sumNutrition(foods);

  document.getElementById('food-calories').textContent = Math.round(totals.calories);
  document.getElementById('food-protein').textContent  = +totals.protein.toFixed(1);
  document.getElementById('food-carbs').textContent    = +totals.carbs.toFixed(1);
  document.getElementById('food-fat').textContent      = +totals.fat.toFixed(1);

  const mealsEl = document.getElementById('meals-list');
  if (foods.length === 0) {
    mealsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽️</div>今天還沒有飲食記錄<br>點下方按鈕新增</div>`;
    return;
  }

  const byMeal = {};
  foods.forEach((f, idx) => {
    if (!byMeal[f.mealType]) byMeal[f.mealType] = [];
    byMeal[f.mealType].push({ ...f, _idx: idx });
  });

  const mealNames = { breakfast:'早餐', lunch:'午餐', dinner:'晚餐', snack:'點心' };

  mealsEl.innerHTML = ['breakfast', 'lunch', 'dinner', 'snack']
    .filter(t => byMeal[t])
    .map(t => {
      const mealFoods = byMeal[t];
      const mealCal   = Math.round(mealFoods.reduce((s, f) => s + f.calories, 0));
      return `
        <div class="meal-section">
          <div class="meal-section-header">${mealNames[t]} · ${mealCal} kcal</div>
          ${mealFoods.map(f => `
            <div class="food-item">
              <div class="food-item-left">
                <div class="food-item-name">${escHtml(f.name)}</div>
                <div class="food-item-sub">${f.calories} kcal · 蛋白 ${f.protein}g · 碳水 ${f.carbs}g · 脂肪 ${f.fat}g</div>
              </div>
              <button class="food-item-delete" onclick="deleteFood('${dateStr}', ${f._idx})" title="刪除">🗑</button>
            </div>
          `).join('')}
        </div>`;
    }).join('');
}

function changeDate(delta) {
  const next = addDays(state.currentFoodDate, delta);
  if (next > todayStr()) return;
  state.currentFoodDate = next;
  renderFoodTab();
}

function deleteFood(dateStr, idx) {
  if (!state.foodLogs[dateStr]) return;
  state.foodLogs[dateStr].splice(idx, 1);
  saveData();
  renderFoodTab();
  if (dateStr === todayStr()) renderDashboard();
}

// ─── Weight Tab ───────────────────────────────────────────────────────────────
function renderWeightTab() {
  const sorted = [...state.weightLogs].sort((a, b) => a.date.localeCompare(b.date));
  drawWeightChart(sorted);

  const listEl = document.getElementById('weight-logs-list');
  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div>還沒有體重記錄<br>點下方按鈕開始記錄</div>`;
    return;
  }

  listEl.innerHTML = [...sorted].reverse().map(log => {
    const target = state.profile?.targetWeight;
    const sub = target ? `距離目標 ${(log.weight - target).toFixed(1)} kg` : (log.note || '');
    return `
      <div class="log-item">
        <div class="log-item-left">
          <div class="log-item-date">${fmtDate(log.date)}</div>
          ${sub ? `<div class="log-item-sub">${escHtml(sub)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="log-item-value">${log.weight} kg</span>
          <button class="log-item-delete" onclick="deleteWeight('${log.date}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function drawWeightChart(logs) {
  const canvas = document.getElementById('weight-chart');
  const dpr    = window.devicePixelRatio || 1;
  const cssW   = canvas.parentElement.clientWidth - 24; // card padding
  const cssH   = 200;

  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  if (logs.length < 2) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('至少需要 2 筆數據才能顯示圖表', cssW / 2, cssH / 2);
    return;
  }

  const recent  = logs.slice(-30);
  const weights = recent.map(l => l.weight);
  const targetW = state.profile?.targetWeight;
  const allVals = targetW ? [...weights, targetW] : weights;
  const minW    = Math.min(...allVals) - 0.5;
  const maxW    = Math.max(...allVals) + 0.5;

  const pad = { top: 18, right: 24, bottom: 28, left: 42 };
  const cW  = cssW - pad.left - pad.right;
  const cH  = cssH - pad.top  - pad.bottom;

  const xS = i => pad.left + (i / (recent.length - 1)) * cW;
  const yS = w => pad.top  + cH - ((w - minW) / (maxW - minW)) * cH;

  // Grid
  ctx.strokeStyle = '#f3f4f6';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y   = pad.top + (cH / 4) * i;
    const val = maxW - ((maxW - minW) / 4) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cssW - pad.right, y); ctx.stroke();
    ctx.fillStyle   = '#9ca3af';
    ctx.font        = '10px sans-serif';
    ctx.textAlign   = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 4, y + 4);
  }

  // Target line
  if (targetW && targetW > minW && targetW < maxW) {
    const ty = yS(targetW);
    ctx.save();
    ctx.strokeStyle = '#059669';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, ty); ctx.lineTo(cssW - pad.right, ty); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#059669';
    ctx.font      = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('目標', cssW - pad.right, ty - 4);
  }

  // Gradient fill under line
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
  grad.addColorStop(0, 'rgba(59,130,246,.18)');
  grad.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.beginPath();
  recent.forEach((log, i) => {
    const x = xS(i), y = yS(log.weight);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(xS(recent.length - 1), pad.top + cH);
  ctx.lineTo(xS(0), pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  recent.forEach((log, i) => {
    const x = xS(i), y = yS(log.weight);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  recent.forEach((log, i) => {
    const x = xS(i), y = yS(log.weight);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
  });

  // X-axis labels (first, mid, last)
  ctx.fillStyle = '#9ca3af';
  ctx.font      = '10px sans-serif';
  ctx.textAlign = 'center';
  [0, Math.floor(recent.length / 2), recent.length - 1].forEach(i => {
    const d = new Date(recent[i].date + 'T00:00:00');
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, xS(i), cssH - pad.bottom + 14);
  });
}

function deleteWeight(date) {
  state.weightLogs = state.weightLogs.filter(l => l.date !== date);
  saveData();
  renderWeightTab();
  renderDashboard();
  showToast('已刪除體重記錄');
}

// ─── Injection Tab ────────────────────────────────────────────────────────────
function renderInjectionTab() {
  const infoEl  = document.getElementById('next-injection-info');
  const lastInj = getLastInjection();

  if (lastInj) {
    const nextDate   = addDays(lastInj.date, 7);
    const daysToNext = daysBetween(todayStr(), nextDate);
    let statusHTML;

    if (daysToNext > 0) {
      statusHTML = `
        <div class="card-header"><span class="card-icon">💉</span><span class="card-title">下次打針</span></div>
        <div class="next-inj-days-big">${daysToNext} <span style="font-size:22px">天後</span></div>
        <p style="font-size:14px;color:var(--text-light);margin-top:6px">預計：${fmtDate(nextDate)} · ${lastInj.dose}</p>`;
    } else if (daysToNext === 0) {
      statusHTML = `
        <div class="card-header"><span class="card-icon">💉</span><span class="card-title">今日打針日</span></div>
        <p class="status-warn" style="font-size:20px;margin:8px 0">今天需要打針！</p>
        <p style="font-size:14px;color:var(--text-light)">上次：${fmtDate(lastInj.date)} · ${lastInj.dose}</p>`;
    } else {
      statusHTML = `
        <div class="card-header"><span class="card-icon">💉</span><span class="card-title">打針提醒</span></div>
        <p class="status-warn" style="font-size:16px;margin:8px 0">已逾期 ${Math.abs(daysToNext)} 天！</p>
        <p style="font-size:14px;color:var(--text-light)">上次：${fmtDate(lastInj.date)} · ${lastInj.dose}</p>`;
    }
    infoEl.innerHTML = statusHTML;
  } else {
    infoEl.innerHTML = `<p style="color:var(--text-light);font-size:14px;text-align:center;padding:8px">還沒有注射記錄，請新增第一次打針紀錄</p>`;
  }

  const listEl = document.getElementById('injection-logs-list');
  const sorted = [...state.injectionLogs].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));

  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">💉</div>還沒有注射記錄</div>`;
    return;
  }

  listEl.innerHTML = sorted.map((log, i) => `
    <div class="inj-log-item">
      <div class="inj-log-header">
        <span class="inj-log-date">${fmtDate(log.date)} ${log.time || ''}</span>
        <span class="inj-dose-badge">${escHtml(log.dose)}</span>
      </div>
      <div class="inj-detail">部位：${escHtml(log.site || '未記錄')}</div>
      ${log.notes ? `<div class="inj-notes">備註：${escHtml(log.notes)}</div>` : ''}
      <button class="inj-delete" onclick="deleteInjection(${i})">🗑 刪除</button>
    </div>`).join('');
}

function deleteInjection(sortedIdx) {
  const sorted = [...state.injectionLogs].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
  const target = sorted[sortedIdx];
  if (!target) return;
  state.injectionLogs = state.injectionLogs.filter(l => !(l.date === target.date && l.time === target.time && l.dose === target.dose));
  saveData();
  renderInjectionTab();
  renderDashboard();
  showToast('已刪除注射記錄');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function loadSettings() {
  const p = state.profile;
  if (p) {
    document.getElementById('setting-name').value           = p.name          || '';
    document.getElementById('setting-gender').value         = p.gender        || 'male';
    document.getElementById('setting-birthyear').value      = p.birthYear     || '';
    document.getElementById('setting-height').value         = p.height        || '';
    document.getElementById('setting-weight').value         = p.currentWeight || '';
    document.getElementById('setting-target-weight').value  = p.targetWeight  || '';
    document.getElementById('setting-activity').value       = p.activityLevel || 'sedentary';
    document.getElementById('setting-dose').value           = p.injectionDose || '2.5mg';
    document.getElementById('setting-injection-day').value  = p.injectionDay  ?? 1;
  }
  // API key stored separately (never in profile JSON to avoid accidental leaks)
  const key = getApiKey();
  document.getElementById('setting-api-key').value = key;
  const statusEl = document.getElementById('api-key-status');
  if (key) {
    statusEl.innerHTML = '<span class="status-ok">✓ 已設定 API 金鑰</span>';
  } else {
    statusEl.innerHTML = '<span style="color:var(--text-light)">尚未設定，AI 估算功能暫不可用</span>';
  }
  updateTargetsPreview();
}

function toggleApiKeyVisibility() {
  const el = document.getElementById('setting-api-key');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function updateTargetsPreview() {
  const p = {
    gender:        document.getElementById('setting-gender').value,
    birthYear:     parseInt(document.getElementById('setting-birthyear').value),
    height:        parseFloat(document.getElementById('setting-height').value),
    currentWeight: parseFloat(document.getElementById('setting-weight').value),
    targetWeight:  parseFloat(document.getElementById('setting-target-weight').value),
    activityLevel: document.getElementById('setting-activity').value,
  };
  const el = document.getElementById('targets-preview');
  if (!p.height || !p.currentWeight || !p.birthYear) {
    el.textContent = '請填入身高、體重和出生年份後自動計算';
    return;
  }
  const tdee    = Math.round(calcTDEE(p));
  const targets = calcTargets(p);
  const toGo    = p.targetWeight ? (p.currentWeight - p.targetWeight).toFixed(1) : '--';
  el.innerHTML  = `
    每日總消耗 (TDEE)：<strong>${tdee} kcal</strong><br>
    建議攝取卡路里：<strong>${targets.calories} kcal</strong>（赤字約 600 kcal）<br>
    每日蛋白質目標：<strong>${targets.protein} g</strong>（體重 × 1.5g）<br>
    距離目標體重：<strong>${toGo} kg</strong>`;
}

function saveSettings() {
  // Save API key first — independent of other validation
  const apiKey = document.getElementById('setting-api-key').value.trim();
  if (apiKey) {
    localStorage.setItem('hom_gemini_key', apiKey);
  } else {
    localStorage.removeItem('hom_gemini_key');
  }

  const p = {
    name:          document.getElementById('setting-name').value.trim(),
    gender:        document.getElementById('setting-gender').value,
    birthYear:     parseInt(document.getElementById('setting-birthyear').value),
    height:        parseFloat(document.getElementById('setting-height').value),
    currentWeight: parseFloat(document.getElementById('setting-weight').value),
    targetWeight:  parseFloat(document.getElementById('setting-target-weight').value),
    activityLevel: document.getElementById('setting-activity').value,
    injectionDose: document.getElementById('setting-dose').value,
    injectionDay:  parseInt(document.getElementById('setting-injection-day').value),
  };

  if (!p.height || !p.currentWeight) {
    showToast('API 金鑰已儲存！請再填入身高和體重');
    loadSettings();
    return;
  }

  state.profile = p;
  saveData();
  updateTargetsPreview();
  loadSettings();
  renderDashboard();
  showToast('設定已儲存！');
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const anyOpen = document.querySelector('.modal:not(.hidden)');
  if (!anyOpen) {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  stopBarcodeScanner();
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function openAddFoodModal() {
  document.getElementById('food-name').value      = '';
  document.getElementById('food-cal').value       = '';
  document.getElementById('food-prot').value      = '';
  document.getElementById('food-carb').value      = '';
  document.getElementById('food-fat-input').value = '';
  document.getElementById('food-search').value    = '';
  document.getElementById('food-search-results').classList.add('hidden');
  _searchResults = [];
  openModal('modal-food');
}

function openWeightModal() {
  document.getElementById('weight-input').value = '';
  document.getElementById('weight-date').value  = todayStr();
  document.getElementById('weight-note').value  = '';
  openModal('modal-weight');
}

function openInjectionModal() {
  const now = new Date();
  document.getElementById('inj-date').value  = todayStr();
  document.getElementById('inj-time').value  = now.toTimeString().slice(0, 5);
  document.getElementById('inj-notes').value = '';
  if (state.profile?.injectionDose) {
    document.getElementById('inj-dose').value = state.profile.injectionDose;
  }
  openModal('modal-injection');
}

// ─── Meal type selector ───────────────────────────────────────────────────────
function selectMealType(btn) {
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _selectedMealType = btn.dataset.meal;
}

// ─── Food search ──────────────────────────────────────────────────────────────
function searchFood(query) {
  const resultsEl = document.getElementById('food-search-results');
  const q = query.trim();
  if (!q) {
    resultsEl.classList.add('hidden');
    _searchResults = [];
    return;
  }
  _searchResults = FOOD_DB.filter(f => f.name.includes(q)).slice(0, 10);
  if (_searchResults.length === 0) {
    resultsEl.classList.add('hidden');
    return;
  }
  resultsEl.innerHTML = _searchResults.map((f, i) => `
    <div class="search-result-item" onclick="selectFoodByIndex(${i})">
      <div class="search-result-name">${escHtml(f.name)}</div>
      <div class="search-result-sub">${f.calories} kcal · 蛋白質 ${f.protein}g · 碳水 ${f.carbs}g · 脂肪 ${f.fat}g</div>
    </div>`).join('');
  resultsEl.classList.remove('hidden');
}

function selectFoodByIndex(i) {
  const food = _searchResults[i];
  if (!food) return;
  document.getElementById('food-name').value      = food.name;
  document.getElementById('food-cal').value       = food.calories;
  document.getElementById('food-prot').value      = food.protein;
  document.getElementById('food-carb').value      = food.carbs;
  document.getElementById('food-fat-input').value = food.fat;
  document.getElementById('food-search-results').classList.add('hidden');
  document.getElementById('food-search').value    = '';
  _searchResults = [];
}

// ─── Save actions ─────────────────────────────────────────────────────────────
function addFoodLog() {
  const name     = document.getElementById('food-name').value.trim();
  const calories = parseFloat(document.getElementById('food-cal').value)       || 0;
  const protein  = parseFloat(document.getElementById('food-prot').value)      || 0;
  const carbs    = parseFloat(document.getElementById('food-carb').value)      || 0;
  const fat      = parseFloat(document.getElementById('food-fat-input').value) || 0;

  if (!name) { showToast('請輸入食物名稱'); return; }

  const dateStr = state.currentFoodDate;
  if (!state.foodLogs[dateStr]) state.foodLogs[dateStr] = [];
  state.foodLogs[dateStr].push({
    name, calories, protein, carbs, fat,
    mealType: _selectedMealType,
    time: new Date().toTimeString().slice(0, 5),
  });

  saveData();
  closeModal('modal-food');
  renderFoodTab();
  if (dateStr === todayStr()) renderDashboard();
  showToast('已新增「' + name + '」');
}

function saveWeight() {
  const weight = parseFloat(document.getElementById('weight-input').value);
  const date   = document.getElementById('weight-date').value;
  const note   = document.getElementById('weight-note').value.trim();

  if (!weight || weight < 20 || weight > 300) { showToast('請輸入有效體重 (20–300 kg)'); return; }
  if (!date) { showToast('請選擇日期'); return; }

  state.weightLogs = state.weightLogs.filter(l => l.date !== date);
  state.weightLogs.push({ date, weight, note });
  state.weightLogs.sort((a, b) => a.date.localeCompare(b.date));

  if (state.profile && date === todayStr()) {
    state.profile.currentWeight = weight;
  }

  saveData();
  closeModal('modal-weight');
  renderWeightTab();
  renderDashboard();
  showToast('體重已記錄');
}

function saveInjection() {
  const dose  = document.getElementById('inj-dose').value;
  const date  = document.getElementById('inj-date').value;
  const time  = document.getElementById('inj-time').value;
  const site  = document.getElementById('inj-site').value;
  const notes = document.getElementById('inj-notes').value.trim();

  if (!date) { showToast('請選擇日期'); return; }

  state.injectionLogs.push({ date, time, dose, site, notes });
  state.injectionLogs.sort((a, b) => a.date.localeCompare(b.date));

  if (state.profile) state.profile.injectionDose = dose;

  saveData();
  closeModal('modal-injection');
  renderInjectionTab();
  renderDashboard();
  showToast('注射記錄已儲存');
}

// ─── Tab switching ────────────────────────────────────────────────────────────
const TAB_TITLES = {
  dashboard: '今日總覽',
  food:      '飲食記錄',
  weight:    '體重追蹤',
  injection: '打針記錄',
  settings:  '個人設定',
};

function switchTab(tabName, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  btn.classList.add('active');
  document.getElementById('page-title').textContent = TAB_TITLES[tabName];

  switch (tabName) {
    case 'dashboard': renderDashboard();    break;
    case 'food':      renderFoodTab();      break;
    case 'weight':    renderWeightTab();    break;
    case 'injection': renderInjectionTab(); break;
    case 'settings':  loadSettings();       break;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  clearTimeout(_toastTimer);
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── AI Food Estimation ───────────────────────────────────────────────────────
let _aiItems = []; // [{ name, grams, calories, protein, carbs, fat, selected }]

function getApiKey() {
  // Also migrate old Claude key name if present
  const geminiKey = localStorage.getItem('hom_gemini_key') || '';
  if (geminiKey) return geminiKey;
  const oldKey = localStorage.getItem('hom_claude_key') || '';
  if (oldKey) {
    localStorage.setItem('hom_gemini_key', oldKey);
    localStorage.removeItem('hom_claude_key');
    return oldKey;
  }
  return '';
}

function openAIFoodModal() {
  _aiItems = [];
  document.getElementById('ai-food-desc').value  = '';
  document.getElementById('ai-result').innerHTML  = '';
  document.getElementById('ai-result').classList.add('hidden');
  document.getElementById('ai-submit-btn').disabled = false;
  document.getElementById('ai-submit-btn').textContent = '🤖 AI 估算';

  const noKeyEl = document.getElementById('ai-no-key-hint');
  if (!getApiKey()) {
    noKeyEl.classList.remove('hidden');
  } else {
    noKeyEl.classList.add('hidden');
  }
  openModal('modal-ai');
}

function setAIExample(el) {
  document.getElementById('ai-food-desc').value = el.textContent;
}

async function callAIEstimation() {
  const apiKey = getApiKey();
  if (!apiKey) {
    document.getElementById('ai-no-key-hint').classList.remove('hidden');
    showToast('請先在設定中輸入 Claude API 金鑰');
    return;
  }

  const desc = document.getElementById('ai-food-desc').value.trim();
  if (!desc) { showToast('請描述你吃了什麼'); return; }

  const btn     = document.getElementById('ai-submit-btn');
  const resultEl = document.getElementById('ai-result');
  btn.disabled      = true;
  btn.textContent   = '⏳ AI 分析中...';
  resultEl.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-light)">🤖 AI 分析食物中，請稍候...</p>';
  resultEl.classList.remove('hidden');

  const systemPrompt = `你是台灣的精準營養師助手。用戶用中文描述吃了什麼，請估算每種食物成分的營養素。

只回應 JSON，不得有其他文字：
{"items":[{"name":"食物名稱","grams":100,"calories":165,"protein":31.0,"carbs":0.0,"fat":3.6}],"total":{"calories":165,"protein":31.0,"carbs":0.0,"fat":3.6}}

份量估算（台灣常見描述）：
- 一塊/一份肉 = 約150g；手掌大 = 約100g；拳頭大 = 約100g
- 一碗飯/麵 = 約200g；半碗 = 100g；一盤炒菜 = 約120g
- 一匙/一大匙醬料 = 約15g；一小匙 = 5g；少許 = 10g
- 一顆雞蛋 = 55g；一杯飲料 = 240ml
- 未提份量時用一般合理份量

醬料和調味料也要計入（如胡麻醬、醬油等），並單獨列出。`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: desc }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${res.status}`;
      if (res.status === 400) throw new Error('API 金鑰無效，請確認金鑰正確');
      if (res.status === 429) throw new Error('請求太頻繁，請稍後再試');
      throw new Error(msg);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 回應格式異常，請再試一次');

    const parsed = JSON.parse(jsonMatch[0]);
    _aiItems = (parsed.items || []).map(item => ({
      name:     String(item.name     || '未知食物'),
      grams:    Math.round(item.grams || 0),
      calories: Math.round(item.calories || 0),
      protein:  +parseFloat(item.protein  || 0).toFixed(1),
      carbs:    +parseFloat(item.carbs    || 0).toFixed(1),
      fat:      +parseFloat(item.fat      || 0).toFixed(1),
      selected: true,
    }));

    renderAIResults();
  } catch (e) {
    resultEl.innerHTML = `<div style="color:var(--danger);text-align:center;padding:14px;background:#fff5f5;border-radius:10px">
      ❌ ${escHtml(e.message)}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = '🤖 AI 估算';
  }
}

function renderAIResults() {
  const resultEl = document.getElementById('ai-result');
  if (_aiItems.length === 0) {
    resultEl.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:12px">沒有識別到食物</p>';
    return;
  }

  const sel   = _aiItems.filter(i => i.selected);
  const total = sel.reduce((acc, i) => ({
    calories: acc.calories + i.calories,
    protein:  acc.protein  + i.protein,
  }), { calories: 0, protein: 0 });

  resultEl.innerHTML = `
    <div class="ai-results">
      <p class="ai-result-title">AI 估算結果 <small>（點選項目可取消）</small></p>
      ${_aiItems.map((item, i) => `
        <div class="ai-item ${item.selected ? 'selected' : ''}" onclick="toggleAIItem(${i})">
          <div class="ai-item-check">${item.selected ? '✓' : '○'}</div>
          <div class="ai-item-info">
            <div class="ai-item-name">${escHtml(item.name)}${item.grams ? ` (${item.grams}g)` : ''}</div>
            <div class="ai-item-sub">${item.calories} kcal · 蛋白質 ${item.protein}g · 碳水 ${item.carbs}g · 脂肪 ${item.fat}g</div>
          </div>
        </div>`).join('')}
      <div class="ai-total">
        已選合計：<strong>${Math.round(total.calories)} kcal</strong> ·
        蛋白質 <strong>${total.protein.toFixed(1)} g</strong>
      </div>
      <button class="btn-primary" onclick="applyAIResults()">✓ 加入${_selectedMealType === 'breakfast' ? '早' : _selectedMealType === 'lunch' ? '午' : _selectedMealType === 'dinner' ? '晚' : '點'}餐記錄</button>
    </div>`;
}

function toggleAIItem(i) {
  _aiItems[i].selected = !_aiItems[i].selected;
  renderAIResults();
}

function applyAIResults() {
  const dateStr = state.currentFoodDate;
  if (!state.foodLogs[dateStr]) state.foodLogs[dateStr] = [];

  const selected = _aiItems.filter(i => i.selected);
  if (selected.length === 0) { showToast('請至少選取一項食物'); return; }

  const now = new Date().toTimeString().slice(0, 5);
  selected.forEach(item => {
    state.foodLogs[dateStr].push({
      name:     item.name + (item.grams ? ` (${item.grams}g)` : ''),
      calories: item.calories,
      protein:  item.protein,
      carbs:    item.carbs,
      fat:      item.fat,
      mealType: _selectedMealType,
      time:     now,
    });
  });

  saveData();
  closeModal('modal-ai');
  renderFoodTab();
  if (dateStr === todayStr()) renderDashboard();
  showToast(`已新增 ${selected.length} 項食物 🎉`);
}

// ─── Barcode Scanner ──────────────────────────────────────────────────────────
let _barcodeStream   = null;
let _barcodeDetector = null;
let _scanActive      = false;
let _barcodeProduct  = null; // { name, cal100g, prot100g, carb100g, fat100g }

function openBarcodeModal() {
  document.getElementById('barcode-result').classList.add('hidden');
  document.getElementById('barcode-result').innerHTML = '';
  document.getElementById('manual-barcode').value = '';
  _barcodeProduct = null;
  openModal('modal-barcode');
  startBarcodeScanner();
}

async function startBarcodeScanner() {
  const wrap    = document.getElementById('barcode-video-wrap');
  const videoEl = document.getElementById('barcode-video');

  if (!('BarcodeDetector' in window)) {
    wrap.style.display = 'none';
    showToast('此設備不支援自動掃描，請手動輸入條碼');
    return;
  }

  try {
    _barcodeDetector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
    });
    _barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
    });
    videoEl.srcObject = _barcodeStream;
    await videoEl.play();
    _scanActive = true;
    requestAnimationFrame(_scanFrame);
  } catch (e) {
    wrap.style.display = 'none';
    if (e.name === 'NotAllowedError') {
      showToast('請允許相機權限才能掃描條碼');
    } else {
      showToast('相機無法啟動，請手動輸入條碼');
    }
  }
}

async function _scanFrame() {
  if (!_scanActive) return;
  const videoEl = document.getElementById('barcode-video');
  if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
    try {
      const barcodes = await _barcodeDetector.detect(videoEl);
      if (barcodes.length > 0) {
        _scanActive = false;
        await lookupBarcode(barcodes[0].rawValue);
        return;
      }
    } catch (_) {}
  }
  requestAnimationFrame(_scanFrame);
}

function stopBarcodeScanner() {
  _scanActive = false;
  if (_barcodeStream) {
    _barcodeStream.getTracks().forEach(t => t.stop());
    _barcodeStream = null;
  }
}

function closeBarcodeModal() {
  stopBarcodeScanner();
  closeModal('modal-barcode');
}

async function lookupBarcode(code) {
  code = String(code).trim();
  if (!code) { showToast('請輸入條碼號碼'); return; }

  const resultEl = document.getElementById('barcode-result');
  resultEl.innerHTML = '<p style="text-align:center;padding:16px;color:var(--text-light)">🔍 查詢中...</p>';
  resultEl.classList.remove('hidden');

  try {
    const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      resultEl.innerHTML = `<p style="color:var(--danger);text-align:center;padding:12px">
        找不到此條碼的產品（${escHtml(code)}）<br>
        <small>請嘗試手動輸入營養素，或確認條碼正確</small></p>`;
      return;
    }

    const p   = data.product;
    const n   = p.nutriments || {};
    const name = p.product_name_zh_TW || p.product_name_zh || p.product_name || p.brands || '未知產品';
    const cal  = Math.round(n['energy-kcal_100g'] || (n['energy_100g'] || 0) / 4.184 || 0);
    const prot = +((n['proteins_100g']       || 0).toFixed(1));
    const carb = +((n['carbohydrates_100g']  || 0).toFixed(1));
    const fat  = +((n['fat_100g']            || 0).toFixed(1));
    const servingG = p.serving_quantity ? Math.round(parseFloat(p.serving_quantity)) : 100;

    _barcodeProduct = { name, cal100g: cal, prot100g: prot, carb100g: carb, fat100g: fat };

    resultEl.innerHTML = `
      <div class="barcode-product-card">
        <div class="barcode-product-name">${escHtml(name)}</div>
        <div class="barcode-product-sub">每 100g：${cal} kcal · 蛋白質 ${prot}g · 碳水 ${carb}g · 脂肪 ${fat}g</div>
        <div class="serving-row">
          <span>我吃了</span>
          <input type="number" id="serving-input" value="${servingG}" min="1" max="9999" oninput="updateBarcodeCalc()">
          <span>g</span>
        </div>
        <div class="barcode-calc-preview" id="barcode-calc-preview"></div>
        <button class="btn-primary" onclick="applyBarcodeResult()">加入飲食記錄</button>
      </div>`;
    updateBarcodeCalc();
  } catch (e) {
    resultEl.innerHTML = `<p style="color:var(--danger);text-align:center;padding:12px">
      網路錯誤，請確認網路連線後再試</p>`;
  }
}

function updateBarcodeCalc() {
  if (!_barcodeProduct) return;
  const gEl     = document.getElementById('serving-input');
  const preEl   = document.getElementById('barcode-calc-preview');
  if (!gEl || !preEl) return;
  const g       = parseFloat(gEl.value) || 100;
  const ratio   = g / 100;
  const cal     = Math.round(_barcodeProduct.cal100g  * ratio);
  const prot    = +(_barcodeProduct.prot100g * ratio).toFixed(1);
  const carb    = +(_barcodeProduct.carb100g * ratio).toFixed(1);
  const fat     = +(_barcodeProduct.fat100g  * ratio).toFixed(1);
  preEl.textContent = `➜ ${g}g：${cal} kcal · 蛋白質 ${prot}g · 碳水 ${carb}g · 脂肪 ${fat}g`;
}

function applyBarcodeResult() {
  if (!_barcodeProduct) return;
  const g     = parseFloat(document.getElementById('serving-input')?.value) || 100;
  const ratio = g / 100;
  document.getElementById('food-name').value      = _barcodeProduct.name + ` (${g}g)`;
  document.getElementById('food-cal').value       = Math.round(_barcodeProduct.cal100g  * ratio);
  document.getElementById('food-prot').value      = +(_barcodeProduct.prot100g * ratio).toFixed(1);
  document.getElementById('food-carb').value      = +(_barcodeProduct.carb100g * ratio).toFixed(1);
  document.getElementById('food-fat-input').value = +(_barcodeProduct.fat100g  * ratio).toFixed(1);
  closeBarcodeModal();
  openModal('modal-food');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  state.currentFoodDate = todayStr();

  // Live preview on settings fields
  ['setting-gender','setting-birthyear','setting-height','setting-weight',
   'setting-target-weight','setting-activity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateTargetsPreview);
  });

  if (!state.profile) {
    // First launch — go to settings
    switchTab('settings', document.querySelector('[data-tab="settings"]'));
    showToast('歡迎！請先填入個人資料');
  } else {
    renderDashboard();
  }

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
