/**
 * AI 记账 — 主应用逻辑
 */

// ===== 分类定义 =====
const CATEGORIES = {
  expense: [
    { name: '餐饮', icon: '🍜', color: '#FF4757', bg: 'rgba(255,71,87,0.1)' },
    { name: '交通', icon: '🚕', color: '#5352ED', bg: 'rgba(83,82,237,0.1)' },
    { name: '购物', icon: '🛒', color: '#2ED573', bg: 'rgba(46,213,115,0.1)' },
    { name: '居住', icon: '🏠', color: '#6C5CE7', bg: 'rgba(108,92,231,0.1)' },
    { name: '娱乐', icon: '🎬', color: '#FF6B81', bg: 'rgba(255,107,129,0.1)' },
    { name: '饮品', icon: '☕️', color: '#FFA502', bg: 'rgba(255,165,2,0.1)' },
    { name: '医疗', icon: '💊', color: '#1DD1A1', bg: 'rgba(29,209,161,0.1)' },
    { name: '教育', icon: '📚', color: '#5352ED', bg: 'rgba(83,82,237,0.1)' },
    { name: '社交', icon: '🎁', color: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
    { name: '其他', icon: '📌', color: '#8395A7', bg: 'rgba(131,149,167,0.1)' },
  ],
  income: [
    { name: '工资', icon: '💰', color: '#2ED573', bg: 'rgba(46,213,115,0.1)' },
    { name: '奖金', icon: '🎉', color: '#FFA502', bg: 'rgba(255,165,2,0.1)' },
    { name: '兼职', icon: '💼', color: '#5352ED', bg: 'rgba(83,82,237,0.1)' },
    { name: '投资', icon: '📈', color: '#6C5CE7', bg: 'rgba(108,92,231,0.1)' },
    { name: '其他', icon: '📌', color: '#8395A7', bg: 'rgba(131,149,167,0.1)' },
  ]
};

function getCatInfo(type, name) {
  const list = CATEGORIES[type] || CATEGORIES.expense;
  return list.find(c => c.name === name) || list[list.length - 1];
}

// ===== 状态 =====
let currentPage = 'home';
let viewYear, viewMonth;
let statsYear, statsMonth;
let editingRecordId = null;
let manualType = 'expense';
let detailMode = 'day'; // day | month

function now() { const d = new Date(); return d; }
function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = now(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function timeStr() { const d = now(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
function getWeekDay(dateStr) {
  const days = ['日','一','二','三','四','五','六'];
  return '周' + days[new Date(dateStr).getDay()];
}

// ===== 初始化 =====
async function initApp() {
  await store.init();
  const settings = await store.getSettings();
  ai.configure(settings.aiProvider, settings.apiKey, settings.aiModel);

  const d = now();
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
  statsYear = d.getFullYear();
  statsMonth = d.getMonth() + 1;

  setupInputBar();
  renderHome();
}

// ===== 文字输入 =====
function setupInputBar() {
  const input = document.getElementById('chatInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      handleTextSubmit(input.value.trim());
      input.value = '';
    }
  });
}

async function handleTextSubmit(text) {
  const input = document.getElementById('chatInput');
  input.value = '';

  // 添加用户气泡
  appendUserBubble(text);

  // 显示 loading
  const loadingId = appendLoadingBubble();

  // AI 解析
  let result;
  try {
    result = await ai.parseInput(text);
  } catch (e) {
    removeElement(loadingId);
    appendAIError('AI 解析失败：' + e.message);
    return;
  }

  // 移除 loading
  removeElement(loadingId);

  if (!result || !result.amount) {
    appendAIError('没有识别到金额，请再试试。示例："午饭35"、"打车20"');
    return;
  }

  // 保存记录
  const record = await store.addRecord({
    type: result.type,
    amount: result.amount,
    category: result.category,
    note: result.note || result.category,
    date: todayStr(),
    time: timeStr(),
    source: 'text',
    rawInput: text,
  });

  // 显示确认卡片
  appendAICard(record);

  // 更新统计
  updateHomeStats();
}

// ===== 聊天区渲染 =====
function appendUserBubble(text) {
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `<div class="msg-body"><div class="bubble-u">${escapeHtml(text)}</div></div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function appendLoadingBubble() {
  const id = 'loading-' + Date.now();
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = id;
  div.innerHTML = `<div class="msg-body"><div class="ai-card loading"><div class="ac-top"><div class="ac-icon" style="background:var(--accent-light)">🤖</div><div><div class="ac-name">分析中...</div></div></div><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return id;
}

function appendAICard(record) {
  const cat = getCatInfo(record.type, record.category);
  const sign = record.type === 'expense' ? '-' : '+';
  const cls = record.type === 'expense' ? 'exp' : 'inc';
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.dataset.recordId = record.id;
  div.innerHTML = `<div class="msg-body">
    <div class="ai-card" data-id="${record.id}">
      <div class="ac-top">
        <div class="ac-icon" style="background:${cat.bg}">${cat.icon}</div>
        <div><div class="ac-name">${escapeHtml(record.note)}</div><div class="ac-cat">${record.category}</div></div>
      </div>
      <div class="ac-bottom">
        <div class="ac-amount ${cls}">${sign}¥${record.amount.toFixed(2)}</div>
        <div class="ac-meta"><div class="ac-time">${record.time || ''}</div><div class="ac-badge">✓ 已记录</div></div>
      </div>
    </div>
  </div>`;

  // 长按菜单
  const card = div.querySelector('.ai-card');
  let pressTimer;
  card.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => showContextMenu(e, record.id), 500);
  });
  card.addEventListener('touchend', () => clearTimeout(pressTimer));
  card.addEventListener('touchmove', () => clearTimeout(pressTimer));

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function appendAIError(text) {
  const area = document.getElementById('chatArea');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.innerHTML = `<div class="msg-body"><div class="ai-card"><div class="ac-top"><div class="ac-icon" style="background:rgba(255,71,87,0.1)">⚠️</div><div><div class="ac-name">${escapeHtml(text)}</div></div></div></div></div>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ===== 长按菜单 =====
function showContextMenu(e, recordId) {
  e.preventDefault();
  const menu = document.getElementById('contextMenu');
  editingRecordId = recordId;

  const touch = e.touches ? e.touches[0] : e;
  menu.style.left = Math.min(touch.clientX, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(touch.clientY - 60, window.innerHeight - 100) + 'px';
  menu.classList.add('show');

  setTimeout(() => {
    document.addEventListener('touchstart', hideContextMenu, { once: true });
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 10);
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('show');
}

async function deleteCurrentRecord() {
  hideContextMenu();
  if (!editingRecordId) return;
  await store.deleteRecord(editingRecordId);
  // 移除 DOM
  const card = document.querySelector(`[data-id="${editingRecordId}"]`);
  if (card) {
    const msgDiv = card.closest('.msg');
    // 同时移除对应的用户气泡（前一个兄弟）
    if (msgDiv && msgDiv.previousElementSibling && msgDiv.previousElementSibling.classList.contains('user')) {
      msgDiv.previousElementSibling.remove();
    }
    if (msgDiv) msgDiv.remove();
  }
  editingRecordId = null;
  updateHomeStats();
}

async function editCurrentRecord() {
  hideContextMenu();
  if (!editingRecordId) return;
  const record = await store.getRecord(editingRecordId);
  if (!record) return;

  // 填充手动表单
  manualType = record.type;
  openManualForm();
  document.getElementById('amtInput').value = record.amount;
  document.getElementById('noteInput').value = record.note || '';
  document.getElementById('dateInput').value = record.date;

  // 设置分类
  updateManualFormType();
  const cells = document.querySelectorAll('#catGrid .cat-cell');
  cells.forEach(c => {
    c.classList.toggle('sel', c.dataset.name === record.category);
  });

  // 标记为编辑模式
  document.getElementById('manualSheet').dataset.editId = record.id;
}

// ===== 首页渲染 =====
async function renderHome() {
  await renderChatHistory();
  await updateHomeStats();
}

async function renderChatHistory() {
  const area = document.getElementById('chatArea');
  area.innerHTML = '';

  // 最近 7 天
  const end = todayStr();
  const d = new Date();
  d.setDate(d.getDate() - 6);
  const start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const records = await store.getRecordsByDateRange(start, end);

  if (records.length === 0) {
    area.innerHTML = '<div class="empty-state">还没有记录，说句话开始记账吧</div>';
    return;
  }

  // 按日期分组
  const groups = {};
  records.forEach(r => {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });

  // 按日期倒序
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const today = todayStr();
  const yesterday = (() => { const d = new Date(); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();

  sortedDates.forEach(date => {
    let label = formatDate(date) + ' ' + getWeekDay(date);
    if (date === today) label = '今天 · ' + formatDate(date);
    else if (date === yesterday) label = '昨天 · ' + formatDate(date);

    const sep = document.createElement('div');
    sep.className = 'date-sep';
    sep.innerHTML = `<span>${label}</span>`;
    area.appendChild(sep);

    // 按时间正序显示
    const dayRecords = groups[date].sort((a, b) => a.createdAt - b.createdAt);
    dayRecords.forEach(r => {
      if (r.rawInput) appendUserBubble(r.rawInput);
      else if (r.source === 'manual') appendUserBubble(`${r.note || r.category} ${r.amount}`);
      appendAICard(r);
    });
  });

  area.scrollTop = area.scrollHeight;
}

async function updateHomeStats() {
  const records = await store.getRecordsByMonth(viewYear, viewMonth);
  const settings = await store.getSettings();

  const monthExpense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const todayRecords = records.filter(r => r.date === todayStr());
  const todayExpense = todayRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const remaining = settings.monthlyBudget - monthExpense;

  document.getElementById('statMonthExpense').textContent = monthExpense.toFixed(2);
  document.getElementById('statToday').textContent = todayExpense.toFixed(2);
  document.getElementById('statBudget').textContent = remaining.toFixed(2);
  document.getElementById('monthChip').textContent = viewMonth + '月 ▾';
}

// ===== 手动表单 =====
function openManualForm() {
  document.getElementById('manualSheet').classList.add('show');
  document.getElementById('manualSheet').dataset.editId = '';
  updateManualFormType();
}

function closeManualForm() {
  document.getElementById('manualSheet').classList.remove('show');
  document.getElementById('amtInput').value = '';
  document.getElementById('noteInput').value = '';
  document.getElementById('dateInput').value = todayStr();
}

function setManualType(type) {
  manualType = type;
  updateManualFormType();
}

function updateManualFormType() {
  document.querySelectorAll('.seg-b').forEach(b => {
    b.classList.toggle('on', b.dataset.type === manualType);
  });

  const grid = document.getElementById('catGrid');
  const cats = CATEGORIES[manualType];
  grid.innerHTML = cats.map((c, i) =>
    `<div class="cat-cell${i === 0 ? ' sel' : ''}" data-name="${c.name}" onclick="selectCat(this)">
      <div class="cat-dot" style="background:${c.bg}">${c.icon}</div>
      <span class="cat-txt">${c.name}</span>
    </div>`
  ).join('');
}

function selectCat(el) {
  document.querySelectorAll('#catGrid .cat-cell').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
}

async function submitManual() {
  const amount = parseFloat(document.getElementById('amtInput').value);
  if (!amount || amount <= 0) return;

  const category = document.querySelector('#catGrid .cat-cell.sel')?.dataset.name || '其他';
  const note = document.getElementById('noteInput').value.trim() || category;
  const date = document.getElementById('dateInput').value || todayStr();
  const editId = document.getElementById('manualSheet').dataset.editId;

  if (editId) {
    // 编辑模式
    await store.updateRecord(editId, { type: manualType, amount, category, note, date });
  } else {
    // 新增
    const record = await store.addRecord({
      type: manualType, amount, category, note, date,
      time: timeStr(),
      source: 'manual',
      rawInput: '',
    });
    appendUserBubble(`${note} ${amount}`);
    appendAICard(record);
  }

  closeManualForm();
  updateHomeStats();

  if (editId) {
    // 刷新聊天显示
    renderChatHistory();
  }
}

// ===== 页面切换 =====
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${page}"]`).classList.add('active');

  if (page === 'stats') {
    renderStats();
  }
}

// ===== 统计页 =====
async function renderStats() {
  const records = await store.getRecordsByMonth(statsYear, statsMonth);
  const settings = await store.getSettings();

  // 上月数据
  let prevYear = statsYear, prevMonth = statsMonth - 1;
  if (prevMonth === 0) { prevMonth = 12; prevYear--; }
  const prevRecords = await store.getRecordsByMonth(prevYear, prevMonth);

  const expenses = records.filter(r => r.type === 'expense');
  const total = expenses.reduce((s, r) => s + r.amount, 0);

  // 月份 & 总额
  document.getElementById('statsMonthLabel').textContent = `${statsYear}年${statsMonth}月`;
  document.getElementById('statsTotal').innerHTML = `<span class="cur">¥</span>${total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

  // AI 总结
  renderAISummary(records, settings.monthlyBudget, prevRecords);

  // 分类占比
  renderCategoryList(expenses, total);

  // 趋势图
  renderTrendChart('trendChart', records);

  // 餐次分布
  renderMealAnalysis(expenses);

  // 账单明细
  renderDetail(records);
}

// AI 总结缓存 key：年月 → { text, date }
function getSummaryCacheKey(year, month) {
  return `ai_summary_${year}_${month}`;
}

async function renderAISummary(records, budget, prevRecords, forceRefresh) {
  const el = document.getElementById('aiSummaryText');
  const refreshBtn = document.getElementById('aiRefreshBtn');
  const expenses = records.filter(r => r.type === 'expense');

  if (expenses.length === 0) {
    el.textContent = '本月暂无消费数据。';
    if (refreshBtn) refreshBtn.style.display = 'none';
    return;
  }
  if (refreshBtn) refreshBtn.style.display = '';

  // 检查缓存：同一天内不重复调用
  const cacheKey = getSummaryCacheKey(statsYear, statsMonth);
  const today = todayStr();

  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.date === today && data.text) {
          el.innerHTML = formatSummaryText(data.text);
          return;
        }
      }
    } catch {}
  }

  if (!ai.isConfigured()) {
    const fallback = ai._fallbackSummary(records, budget);
    el.innerHTML = '<span style="color:var(--accent)">未配置 AI，显示基础分析：</span><br><br>' + fallback;
    return;
  }

  el.textContent = 'AI 分析中...';
  try {
    const text = await ai.generateSummary(records, budget, prevRecords);
    // 缓存结果
    localStorage.setItem(cacheKey, JSON.stringify({ text, date: today }));
    el.innerHTML = formatSummaryText(text);
  } catch (e) {
    el.textContent = 'AI 分析失败：' + e.message;
  }
}

function formatSummaryText(text) {
  return text
    .replace(/¥[\d,.]+/g, '<b style="color:var(--red)">$&</b>')
    .replace(/结余[约]?[\s]*¥?[\d,.]+/g, '<b style="color:var(--green)">$&</b>');
}

async function refreshAISummary() {
  const records = await store.getRecordsByMonth(statsYear, statsMonth);
  const settings = await store.getSettings();
  let prevYear = statsYear, prevMonth = statsMonth - 1;
  if (prevMonth === 0) { prevMonth = 12; prevYear--; }
  const prevRecords = await store.getRecordsByMonth(prevYear, prevMonth);
  await renderAISummary(records, settings.monthlyBudget, prevRecords, true);
}

function renderCategoryList(expenses, total) {
  const el = document.getElementById('catList');
  const catMap = {};
  expenses.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + r.amount; });
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state">本月暂无支出记录</div>';
    return;
  }

  el.innerHTML = sorted.map(([name, amt]) => {
    const cat = getCatInfo('expense', name);
    const pct = total > 0 ? ((amt / total) * 100).toFixed(0) : 0;
    return `<div class="cl-row">
      <div class="cl-icon" style="background:${cat.bg}">${cat.icon}</div>
      <div class="cl-info"><div class="cl-name">${name}</div><div class="cl-bar"><div class="cl-fill" style="width:${pct}%;background:${cat.color}"></div></div></div>
      <div class="cl-right"><div class="cl-amt">¥${amt.toFixed(2)}</div><div class="cl-pct">${pct}%</div></div>
    </div>`;
  }).join('');
}

function renderCompare(expenses, prevRecords) {
  const el = document.getElementById('compareWrap');
  const prevExpenses = prevRecords.filter(r => r.type === 'expense');

  const curMap = {};
  expenses.forEach(r => { curMap[r.category] = (curMap[r.category] || 0) + r.amount; });
  const prevMap = {};
  prevExpenses.forEach(r => { prevMap[r.category] = (prevMap[r.category] || 0) + r.amount; });

  const allCats = [...new Set([...Object.keys(curMap), ...Object.keys(prevMap)])];
  const maxAmt = Math.max(...Object.values(curMap), ...Object.values(prevMap), 1);

  // 取 top 5
  const sorted = allCats.sort((a, b) => (curMap[b] || 0) - (curMap[a] || 0)).slice(0, 5);

  if (sorted.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无对比数据</div>';
    return;
  }

  el.innerHTML = sorted.map(name => {
    const cat = getCatInfo('expense', name);
    const cur = curMap[name] || 0;
    const prev = prevMap[name] || 0;
    const curPct = (cur / maxAmt * 100).toFixed(0);
    const prevPct = (prev / maxAmt * 100).toFixed(0);
    const isDown = cur < prev;
    return `<div class="cmp-row">
      <div class="cmp-head"><span class="cmp-cat">${cat.icon} ${name}</span><span class="cmp-nums">¥${prev.toFixed(2)} → <b>¥${cur.toFixed(2)}</b></span></div>
      <div class="cmp-bars">
        <div class="cmp-bar"><div class="cmp-fill" style="width:${prevPct}%;background:rgba(108,92,231,0.15)"></div></div>
        <div class="cmp-bar"><div class="cmp-fill" style="width:${curPct}%;background:${isDown ? 'linear-gradient(90deg,#2ED573,#1DD1A1)' : 'linear-gradient(90deg,#6C5CE7,#A78BFA)'}"></div></div>
      </div>
    </div>`;
  }).join('') + `<div class="cmp-legend">
    <div class="cmp-legend-i"><div class="cmp-dot" style="background:rgba(108,92,231,0.2)"></div>上月</div>
    <div class="cmp-legend-i"><div class="cmp-dot" style="background:var(--accent)"></div>本月</div>
  </div>`;
}

// ===== 餐次分布 =====
function renderMealAnalysis(expenses) {
  const card = document.getElementById('mealCard');
  const el = document.getElementById('mealList');

  const diningExpenses = expenses.filter(r => r.category === '餐饮');
  if (diningExpenses.length === 0) {
    card.style.display = 'none';
    return;
  }

  const meals = [
    { name: '早餐', icon: '🌅', color: '#FFA502', bg: 'rgba(255,165,2,0.1)', pattern: /早|早餐|早上/ },
    { name: '午餐', icon: '☀️', color: '#FF4757', bg: 'rgba(255,71,87,0.1)', pattern: /午|午餐|中午|午饭/ },
    { name: '晚餐', icon: '🌙', color: '#5352ED', bg: 'rgba(83,82,237,0.1)', pattern: /晚|晚餐|晚上|晚饭|夜宵/ },
    { name: '其他', icon: '🍽️', color: '#8395A7', bg: 'rgba(131,149,167,0.1)', pattern: null },
  ];

  const mealData = meals.map(m => ({ ...m, total: 0, count: 0 }));

  diningExpenses.forEach(r => {
    const note = r.note || '';
    let matched = false;
    for (let i = 0; i < 3; i++) {
      if (meals[i].pattern.test(note)) {
        mealData[i].total += r.amount;
        mealData[i].count++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      mealData[3].total += r.amount;
      mealData[3].count++;
    }
  });

  const activeMeals = mealData.filter(m => m.count > 0);
  if (activeMeals.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';
  const totalDining = activeMeals.reduce((s, m) => s + m.total, 0);

  el.innerHTML = activeMeals.map(m => {
    const pct = totalDining > 0 ? ((m.total / totalDining) * 100).toFixed(0) : 0;
    const avg = m.count > 0 ? (m.total / m.count).toFixed(2) : '0.00';
    return `<div class="cl-row">
      <div class="cl-icon" style="background:${m.bg}">${m.icon}</div>
      <div class="cl-info">
        <div class="cl-name">${m.name} <span style="font-size:12px;color:var(--text-2);font-weight:500">${m.count}次 · 均¥${avg}</span></div>
        <div class="cl-bar"><div class="cl-fill" style="width:${pct}%;background:${m.color}"></div></div>
      </div>
      <div class="cl-right"><div class="cl-amt">¥${m.total.toFixed(2)}</div><div class="cl-pct">${pct}%</div></div>
    </div>`;
  }).join('');
}

// ===== 账单明细 =====
function setDetailMode(mode) {
  detailMode = mode;
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('on', t.dataset.mode === mode));
  renderStats();
}

function renderDetail(records) {
  const el = document.getElementById('detailList');
  if (records.length === 0) {
    el.innerHTML = '<div class="empty-state">暂无记录</div>';
    return;
  }

  // 按日期分组
  const groups = {};
  records.forEach(r => {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  if (detailMode === 'day') {
    // 日视图：展开所有
    el.innerHTML = sortedDates.map(date => {
      const dayRecords = groups[date].sort((a, b) => b.createdAt - a.createdAt);
      const dayTotal = dayRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      return `<div>
        <div class="dl-day-header">
          <span class="dl-day-date">${formatDate(date)} ${getWeekDay(date)}</span>
          <span class="dl-day-total">-¥${dayTotal.toFixed(2)}</span>
        </div>
        <div class="dl-items">${dayRecords.map(r => renderDetailItem(r)).join('')}</div>
      </div>`;
    }).join('');
  } else {
    // 月视图：折叠
    el.innerHTML = sortedDates.map(date => {
      const dayRecords = groups[date].sort((a, b) => b.createdAt - a.createdAt);
      const dayTotal = dayRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      return `<div>
        <div class="dl-day-header" onclick="toggleDayItems(this)">
          <span class="dl-day-date">${formatDate(date)} ${getWeekDay(date)}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="dl-day-total">-¥${dayTotal.toFixed(2)}</span>
            <span class="dl-day-arrow">›</span>
          </div>
        </div>
        <div class="dl-items" style="max-height:0;overflow:hidden">${dayRecords.map(r => renderDetailItem(r)).join('')}</div>
      </div>`;
    }).join('');
  }
}

function renderDetailItem(r) {
  const cat = getCatInfo(r.type, r.category);
  const sign = r.type === 'expense' ? '-' : '+';
  const cls = r.type === 'expense' ? 'exp' : 'inc';
  return `<div class="dl-item">
    <div class="dl-item-icon" style="background:${cat.bg}">${cat.icon}</div>
    <div class="dl-item-info"><div class="dl-item-name">${escapeHtml(r.note || r.category)}</div><div class="dl-item-time">${r.time || ''}</div></div>
    <div class="dl-item-amt ${cls}">${sign}¥${r.amount.toFixed(2)}</div>
  </div>`;
}

function toggleDayItems(header) {
  const items = header.nextElementSibling;
  const arrow = header.querySelector('.dl-day-arrow');
  if (items.style.maxHeight === '0px' || !items.style.maxHeight) {
    items.style.maxHeight = items.scrollHeight + 'px';
    if (arrow) arrow.classList.add('open');
  } else {
    items.style.maxHeight = '0px';
    if (arrow) arrow.classList.remove('open');
  }
}

// ===== 月份切换 =====
function changeStatsMonth(delta) {
  statsMonth += delta;
  if (statsMonth > 12) { statsMonth = 1; statsYear++; }
  if (statsMonth < 1) { statsMonth = 12; statsYear--; }
  renderStats();
}

// ===== 设置 =====
const MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（快速）' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（推荐）' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（最强）' },
  ],
  qwen: [
    { value: 'qwen-turbo', label: 'Qwen Turbo（快速）' },
    { value: 'qwen-plus', label: 'Qwen Plus（推荐）' },
    { value: 'qwen-max', label: 'Qwen Max（最强）' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner（推理）' },
  ],
};

function updateModelOptions() {
  const provider = document.getElementById('setProvider').value;
  const modelSel = document.getElementById('setModel');
  const models = MODEL_OPTIONS[provider] || [];
  modelSel.innerHTML = models.map(m =>
    `<option value="${m.value}">${m.label}</option>`
  ).join('');
}

function openSettings() {
  document.getElementById('setSheet').classList.add('show');
  loadSettings();
}

function closeSettings() {
  document.getElementById('setSheet').classList.remove('show');
}

async function loadSettings() {
  const s = await store.getSettings();
  document.getElementById('setProvider').value = s.aiProvider;
  updateModelOptions();
  if (s.aiModel) {
    document.getElementById('setModel').value = s.aiModel;
  }
  document.getElementById('setApiKey').value = s.apiKey;
  document.getElementById('setBudget').value = s.monthlyBudget;
}

async function saveSettings() {
  const settings = {
    aiProvider: document.getElementById('setProvider').value,
    aiModel: document.getElementById('setModel').value,
    apiKey: document.getElementById('setApiKey').value,
    monthlyBudget: parseFloat(document.getElementById('setBudget').value) || 5000,
  };
  await store.saveSettings(settings);
  ai.configure(settings.aiProvider, settings.apiKey, settings.aiModel);
  closeSettings();
  updateHomeStats();
}

// ===== 导出导入 =====
async function exportCSV() {
  const csv = await store.exportCSV(statsYear, statsMonth);
  downloadFile(csv, `记账_${statsYear}${pad(statsMonth)}.csv`, 'text/csv;charset=utf-8;');
}

async function exportJSON() {
  const json = await store.exportJSON();
  downloadFile(json, `记账备份_${todayStr()}.json`, 'application/json');
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const count = await store.importJSON(text);
      alert(`成功导入 ${count} 条记录`);
      renderHome();
      if (currentPage === 'stats') renderStats();
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  input.click();
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===== 工具 =====
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Sheet 通用 =====
function closeSheetByOverlay(e, id) {
  if (e.target.id === id) {
    document.getElementById(id).classList.remove('show');
  }
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', initApp);
