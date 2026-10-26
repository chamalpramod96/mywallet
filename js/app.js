import {
  store, uid, todayStr, dateStr, thisYm, ymOf, addDays, addMonths, daysInMonth,
  parseAmount, ACCOUNT_TYPES, APP_VERSION, validateBackup,
} from './store.js';
import { esc, money, plain, amountStr, monthLabel, dayLabel, curPrefix } from './format.js';
import { icon } from './icons.js';
import { categoryBars, monthlyColumns } from './charts.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ui = {
  tab: 'home',
  histYm: thisYm(), histType: 'all', histQuery: '', histAccount: null, histCategory: null,
  statsYm: thisYm(), chartSel: null, tableOpen: false,
};

const CURRENCIES = ['Rs', 'LKR', '$', '€', '£', '₹', 'AED', '¥'];
const THEMES = [
  { value: 'system', label: 'Match phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const AUTOLOCK = [
  { value: 0, label: 'Immediately', sub: 'As soon as you leave the app' },
  { value: 1, label: 'After 1 minute' },
  { value: 5, label: 'After 5 minutes' },
  { value: 15, label: 'After 15 minutes' },
  { value: -1, label: 'Only when the app restarts' },
];
const EMOJIS = ['🍔', '☕', '🍕', '🛒', '🚌', '🚕', '⛽', '🚗', '🏍️', '🧾', '💡', '💧', '📶', '🏠', '🛍️', '👕', '💊', '🏥', '🎓', '📚',
  '🎬', '🎮', '✈️', '🏖️', '🎁', '💇', '🐶', '👶', '🏦', '💳', '📦', '💼', '💻', '📈', '💰', '↩️', '🏪', '🙏', '⚽', '🎵'];

/* =====================================================================
   Back-gesture layers: every sheet, dialog and non-home tab adds a history
   entry, so Android's back gesture closes it instead of leaving the app.
   ===================================================================== */
const layers = [];
let ignorePop = 0, pendingBack = 0;

function pushLayer(close) {
  layers.push(close);
  history.pushState({ layer: layers.length }, '');
}
// Called when the UI closes a layer itself; batches several closes into one history.go().
function popLayer() {
  if (!layers.length) return;
  layers.pop();
  if (++pendingBack === 1) {
    setTimeout(() => {
      const n = pendingBack;
      pendingBack = 0;
      ignorePop++;
      history.go(-n);
    });
  }
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  layers.pop()?.();
});

/* ---------- theme ---------- */
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = store.data?.settings.theme || 'system';
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && darkMq.matches);
  $('meta[name="theme-color"]').content = dark ? '#060c1b' : '#f3f5fa';
}
darkMq.addEventListener('change', applyTheme);

/* ---------- small helpers ---------- */
function persist() {
  if (store.save()) return true;
  toast('Could not save. Phone storage may be full.');
  return false;
}

function selectIn(el) {
  $$('.on', el.parentElement).forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

function formError(sel, msg) {
  toast(msg);
  const el = $(sel);
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  if (el.matches('input')) el.focus();
}

function sanitizeMoney(input) {
  const allowNeg = input.dataset.money === 'neg';
  let v = input.value.replace(/[^\d.-]/g, ''); // commas are thousands separators here
  const minus = allowNeg && v.startsWith('-');
  v = v.replace(/-/g, '');
  const dot = v.indexOf('.');
  if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  v = (minus ? '-' : '') + v.slice(0, 13);
  if (v !== input.value) input.value = v;
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches;

function canShareFiles() {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

async function requestPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}

/* ---------- shared markup ---------- */
const brand = (size = '') => `<div class="brand ${size}">
  <span class="brand-tile ${size}"><img src="assets/emblem.webp" alt=""></span>
  <span class="wordmark ${size}"><span class="w1">My</span><span class="w2">Wallet</span></span>
</div>`;

const HERO_WAVE = `<svg class="hero-wave" viewBox="0 0 260 170" fill="none" aria-hidden="true">
  <defs><linearGradient id="hw" x1="0" x2="1"><stop offset="0" stop-color="#f6cf6a"/><stop offset="1" stop-color="#c98a1a"/></linearGradient></defs>
  <path d="M6 128C58 128 78 34 130 42s58 104 124 26" stroke="url(#hw)" stroke-width="20" stroke-linecap="round" opacity=".14"/>
  <path d="M6 128C58 128 78 34 130 42s58 104 124 26" stroke="url(#hw)" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
</svg>`;

const monthSwitch = (key, ym) => `<div class="month-switch">
  <button data-action="month" data-k="${key}" data-d="-1" aria-label="Previous month">${icon('chevL')}</button>
  <span>${monthLabel(ym)}</span>
  <button data-action="month" data-k="${key}" data-d="1" aria-label="Next month">${icon('chevR')}</button>
</div>`;

const accIcon = a => ACCOUNT_TYPES[a?.type]?.icon || '💼';

function txRow(t, { showDate = false } = {}) {
  const acc = store.account(t.accountId);
  const note = t.note ? ` · ${esc(t.note)}` : '';
  const when = showDate ? `${dayLabel(t.date)} · ` : '';
  if (t.type === 'transfer') {
    const to = store.account(t.toAccountId);
    return `<li><button class="tx" data-action="edit-tx" data-id="${t.id}">
      <span class="tx-ico transfer">${icon('swap')}</span>
      <span class="tx-main"><span class="tx-title">Transfer</span><span class="tx-sub">${when}${esc(acc?.name ?? '?')} → ${esc(to?.name ?? '?')}${note}</span></span>
      <span class="tx-amt">${money(t.amount)}</span>
    </button></li>`;
  }
  const c = store.category(t.categoryId);
  const inc = t.type === 'income';
  return `<li><button class="tx" data-action="edit-tx" data-id="${t.id}">
    <span class="tx-ico">${esc(c?.emoji ?? '❔')}</span>
    <span class="tx-main"><span class="tx-title">${esc(c?.name ?? 'Uncategorised')}</span><span class="tx-sub">${when}${esc(acc?.name ?? '?')}${note}</span></span>
    <span class="tx-amt${inc ? ' in' : ''}">${money(inc ? t.amount : -t.amount, { sign: inc })}</span>
  </button></li>`;
}

function row({ action, id, ico, label, sub, val, sw, danger }) {
  const tail = sw !== undefined
    ? `<span class="switch${sw ? ' on' : ''}" role="switch" aria-checked="${sw}"></span>`
    : `${val !== undefined && val !== '' ? `<span class="row-val">${val}</span>` : ''}${icon('chevR', 'chev')}`;
  return `<li><button class="row${danger ? ' danger' : ''}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ''}>
    ${ico !== undefined ? `<span class="row-ico">${ico}</span>` : ''}
    <span class="row-label">${label}${sub ? `<small>${sub}</small>` : ''}</span>${tail}
  </button></li>`;
}

const group = (title, rows) =>
  `<section class="group"><h2 class="group-title">${title}</h2><ul class="list card">${rows.filter(Boolean).join('')}</ul></section>`;

function backupNudge() {
  const s = store.s;
  if (store.data.tx.length < 5) return '';
  const days = iso => (iso ? (Date.now() - Date.parse(iso)) / 864e5 : Infinity);
  const since = days(s.lastBackup);
  if (since < 30 || days(s.nudgeDismissed) < 7) return '';
  return `<div class="banner">
    <span class="banner-ico">${icon('shield')}</span>
    <p><b>Back up your wallet</b>${s.lastBackup ? `Last backup was ${Math.floor(since)} days ago.` : 'Your data lives only on this phone.'}</p>
    <button class="btn sm gold" data-action="backup-download">Back up</button>
    <button class="icon-btn sm" data-action="nudge-dismiss" aria-label="Dismiss">${icon('x')}</button>
  </div>`;
}

/* =====================================================================
   Views
   ===================================================================== */
function viewHome() {
  const s = store.s, ym = thisYm();
  const { income, expense } = store.monthTotals(ym);
  const bal = store.balances();
  const recent = store.sortedTx().slice(0, 6);
  return `
  <header class="topbar">
    ${brand()}
    <div class="top-actions">
      <button class="icon-btn framed" data-action="toggle-hide" aria-label="${s.hideAmounts ? 'Show amounts' : 'Hide amounts'}">${icon(s.hideAmounts ? 'eyeOff' : 'eye')}</button>
      ${s.pinHash ? `<button class="icon-btn framed" data-action="lock-now" aria-label="Lock now">${icon('lock')}</button>` : ''}
    </div>
  </header>

  <section class="hero">
    ${HERO_WAVE}
    <div class="hero-label">Total balance</div>
    <div class="hero-amount">${money(store.totalBalance(bal))}</div>
    <div class="hero-stats">
      <div class="hero-stat"><small><span class="hs-ico in">${icon('arrowDown')}</span>Income · ${monthLabel(ym, true)}</small><b>${money(income)}</b></div>
      <div class="hero-stat"><small><span class="hs-ico out">${icon('arrowUp')}</span>Spent · ${monthLabel(ym, true)}</small><b>${money(expense)}</b></div>
    </div>
    ${budgetMeter(expense)}
  </section>

  ${backupNudge()}

  <section class="block">
    <div class="block-head"><h2>Accounts</h2><button class="link-btn" data-action="open-accounts">Manage</button></div>
    <div class="acc-row">
      ${store.data.accounts.map(a => `<button class="acc-card" data-action="acc-history" data-id="${a.id}">
        <span class="acc-ico">${accIcon(a)}</span>
        <span class="acc-name">${esc(a.name)}</span>
        <span class="acc-bal${bal.get(a.id) < 0 ? ' neg' : ''}">${money(bal.get(a.id))}</span>
      </button>`).join('')}
      <button class="acc-card add" data-action="add-account">${icon('plus')}<span>Add account</span></button>
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Recent</h2>${recent.length ? '<button class="link-btn" data-action="go" data-tab="history">See all</button>' : ''}</div>
    ${recent.length
      ? `<ul class="tx-list card">${recent.map(t => txRow(t, { showDate: true })).join('')}</ul>`
      : '<div class="empty card"><div class="empty-ico">🪙</div><p><b>No transactions yet</b>Tap the gold <b>+</b> button to add your first one.</p></div>'}
  </section>`;
}

function budgetMeter(spent) {
  const b = store.s.budget;
  if (!b) return '';
  const over = spent > b;
  return `<div class="meter${over ? ' over' : ''}">
    <div class="meter-track"><div class="meter-fill" style="width:${Math.min(100, (spent / b) * 100).toFixed(1)}%"></div></div>
    <div class="meter-text">${over ? `${icon('alert')} Over budget by ${money(spent - b)}` : `${money(b - spent)} left of ${money(b)} budget`}</div>
  </div>`;
}

function fitHero() {
  const el = $('.hero-amount');
  if (!el) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth && size > 18) {
    size -= 2;
    el.style.fontSize = `${size}px`;
  }
}

function viewHistory() {
  const types = { all: 'All', expense: 'Expenses', income: 'Income', transfer: 'Transfers' };
  return `
  <header class="page-head"><h1>History</h1></header>
  ${monthSwitch('histYm', ui.histYm)}
  <div class="search">${icon('search')}<input id="hist-q" type="search" placeholder="Search notes, categories, amounts" value="${esc(ui.histQuery)}" enterkeyhint="search" autocomplete="off" aria-label="Search"></div>
  <div class="chips">${Object.entries(types).map(([k, l]) => `<button class="chip${ui.histType === k ? ' on' : ''}" data-action="hist-type" data-type="${k}">${l}</button>`).join('')}</div>
  <div id="hist-body"></div>`;
}

function histItems() {
  const q = ui.histQuery.trim().toLowerCase();
  return store.sortedTx().filter(t => {
    if (!q && ymOf(t.date) !== ui.histYm) return false;
    if (ui.histType !== 'all' && t.type !== ui.histType) return false;
    if (ui.histAccount && t.accountId !== ui.histAccount && t.toAccountId !== ui.histAccount) return false;
    if (ui.histCategory && t.categoryId !== ui.histCategory) return false;
    if (q) {
      const hay = [t.note, store.category(t.categoryId)?.name, store.account(t.accountId)?.name,
        store.account(t.toAccountId)?.name, String(t.amount / 100), t.type === 'transfer' ? 'transfer' : ''].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderHistBody() {
  const el = $('#hist-body');
  if (!el) return;
  const items = histItems();
  const searching = !!ui.histQuery.trim();
  let inc = 0, exp = 0;
  for (const t of items) {
    if (t.type === 'income') inc += t.amount;
    else if (t.type === 'expense') exp += t.amount;
  }
  const pills = [];
  if (ui.histAccount) {
    const a = store.account(ui.histAccount);
    pills.push(`<button class="pill" data-action="clear-filter" data-f="histAccount">${accIcon(a)} ${esc(a?.name ?? 'Account')}${icon('x')}</button>`);
  }
  if (ui.histCategory) {
    const c = store.category(ui.histCategory);
    pills.push(`<button class="pill" data-action="clear-filter" data-f="histCategory">${esc(c?.emoji ?? '')} ${esc(c?.name ?? 'Category')}${icon('x')}</button>`);
  }
  const groups = new Map();
  for (const t of items) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  el.innerHTML = `
    ${pills.length ? `<div class="pills">${pills.join('')}</div>` : ''}
    ${searching ? `<p class="note">${icon('search')} Searching all months</p>` : ''}
    <div class="sum-strip">
      <div><small>Money in</small><b class="pos">${money(inc, { sign: true })}</b></div>
      <div><small>Money out</small><b>${money(-exp)}</b></div>
    </div>
    ${items.length ? [...groups].map(([d, list]) => {
      const net = list.reduce((n, t) => n + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
      return `<section class="day">
        <div class="day-head"><span>${dayLabel(d, { long: true })}</span><span>${net ? money(net, { sign: true }) : ''}</span></div>
        <ul class="tx-list card">${list.map(t => txRow(t)).join('')}</ul>
      </section>`;
    }).join('') : `<div class="empty card"><div class="empty-ico">🔍</div><p><b>Nothing here</b>${searching ? 'No transactions match your search.' : `No transactions in ${monthLabel(ui.histYm)}.`}</p></div>`}`;
}

function viewStats() {
  const ym = ui.statsYm, prevYm = addMonths(ym, -1);
  const { income, expense } = store.monthTotals(ym);
  const prev = store.monthTotals(prevYm);
  const days = ym === thisYm() ? new Date().getDate() : daysInMonth(ym);
  const delta = prev.expense ? Math.round(((expense - prev.expense) / prev.expense) * 100) : null;
  const deltaTxt = delta === null ? 'Nothing to compare with yet'
    : `${delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} ${Math.abs(delta)}% vs ${monthLabel(prevYm, true)}`;
  const kpi = (label, value, note = '') => `<div class="kpi"><small>${label}</small><b>${value}</b>${note ? `<span>${note}</span>` : ''}</div>`;
  return `
  <header class="page-head"><h1>Stats</h1></header>
  ${monthSwitch('statsYm', ym)}
  <div class="kpis">
    ${kpi('Income', money(income))}
    ${kpi('Expenses', money(expense), deltaTxt)}
    ${kpi('Net', money(income - expense, { sign: true }), income - expense >= 0 ? 'Saved this month' : 'Spent more than earned')}
    ${kpi('Daily spend', money(Math.round(expense / days)), `Average over ${days} day${days > 1 ? 's' : ''}`)}
  </div>
  <section class="card pad">
    <div class="card-head"><h2>Spending by category</h2><span class="muted">${monthLabel(ym, true)}</span></div>
    ${categoryBars(store.byCategory(ym, 'expense'), expense)}
  </section>
  <section class="card pad" id="trend-card"></section>`;
}

function renderTrend() {
  const card = $('#trend-card');
  if (!card) return;
  const months = Array.from({ length: 6 }, (_, i) => {
    const ym = addMonths(ui.statsYm, i - 5);
    return { ym, label: monthLabel(ym, true), ...store.monthTotals(ym) };
  });
  const sel = ui.chartSel ?? 5;
  const m = months[sel];
  card.innerHTML = `
    <div class="card-head"><h2>Income vs expenses</h2><span class="muted">6 months</span></div>
    <div class="legend">
      <span class="lg"><i class="sw s-in"></i>Income <b>${money(m.income)}</b></span>
      <span class="lg"><i class="sw s-out"></i>Expenses <b>${money(m.expense)}</b></span>
    </div>
    <div class="legend-sub">${monthLabel(m.ym)} · Net ${money(m.income - m.expense, { sign: true })} · tap a month</div>
    <div class="chart-wrap"></div>
    <details class="tbl"${ui.tableOpen ? ' open' : ''}><summary>View as table</summary>
      <table><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
      <tbody>${months.map(x => `<tr><td>${monthLabel(x.ym, true)}</td><td>${plain(x.income)}</td><td>${plain(x.expense)}</td><td>${plain(x.income - x.expense, { sign: true })}</td></tr>`).join('')}</tbody></table>
    </details>`;
  const wrap = $('.chart-wrap', card);
  wrap.innerHTML = monthlyColumns(months, Math.max(240, wrap.clientWidth), sel);
  $('.tbl', card).addEventListener('toggle', e => { ui.tableOpen = e.target.open; });
}

function viewSettings() {
  const s = store.s;
  const last = s.lastBackup ? `Last backup: ${dayLabel(dateStr(new Date(s.lastBackup)))}` : 'Never backed up';
  return `
  <header class="page-head"><h1>Settings</h1></header>
  ${group('Wallet', [
    row({ action: 'open-accounts', ico: icon('wallet'), label: 'Accounts', val: store.data.accounts.length }),
    row({ action: 'open-categories', ico: icon('tag'), label: 'Categories', val: store.data.categories.length }),
    row({ action: 'open-budget', ico: icon('target'), label: 'Monthly budget', val: s.budget ? money(s.budget, { mask: false }) : 'Off' }),
    row({ action: 'open-currency', ico: icon('coins'), label: 'Currency', val: esc(s.currency) }),
    row({ action: 'toggle-decimals', ico: '<b class="row-txt">.00</b>', label: 'Show cents', sw: s.decimals > 0 }),
  ])}
  ${group('Security', [
    s.pinHash
      ? row({ action: 'pin-change', ico: icon('key'), label: 'Change PIN' })
      : row({ action: 'pin-enable', ico: icon('key'), label: 'PIN lock', val: 'Off', sub: 'Ask for a PIN when the app opens' }),
    s.pinHash ? row({ action: 'open-autolock', ico: icon('timer'), label: 'Auto-lock', val: AUTOLOCK.find(o => o.value === s.autoLock)?.label }) : '',
    s.pinHash ? row({ action: 'pin-disable', ico: icon('lock'), label: 'Turn off PIN lock' }) : '',
    row({ action: 'toggle-hide', ico: icon(s.hideAmounts ? 'eyeOff' : 'eye'), label: 'Hide amounts', sub: 'Mask balances on screen', sw: s.hideAmounts }),
  ])}
  ${group('Appearance', [
    row({ action: 'open-theme', ico: icon('moon'), label: 'Theme', val: THEMES.find(t => t.value === s.theme)?.label }),
  ])}
  ${group('Backup', [
    row({ action: 'backup-download', ico: icon('download'), label: 'Download backup', sub: last }),
    canShareFiles() ? row({ action: 'backup-share', ico: icon('share'), label: 'Share backup', sub: 'Save to Google Drive, WhatsApp, email' }) : '',
    row({ action: 'backup-import', ico: icon('upload'), label: 'Restore from backup' }),
    row({ action: 'export-csv', ico: icon('table'), label: 'Export as CSV', sub: 'Open in Excel or Google Sheets' }),
  ])}
  ${isStandalone() ? '' : group('App', [
    row({ action: 'install', ico: icon('phone'), label: 'Install on home screen', sub: 'Opens full screen and works offline' }),
  ])}
  ${group('Danger zone', [
    row({ action: 'erase', ico: icon('trash'), label: 'Erase all data', danger: true }),
  ])}
  <div class="about">
    ${brand('sm')}
    <p>Version ${APP_VERSION} · <span id="persist-status"></span></p>
    <p>Your data is stored only on this phone.</p>
  </div>`;
}

async function fillPersistStatus() {
  const el = $('#persist-status');
  if (!el) return;
  try {
    el.textContent = (await navigator.storage?.persisted?.()) ? 'Storage protected' : 'Install the app to protect storage';
  } catch {
    el.textContent = '';
  }
}

const VIEWS = { home: viewHome, history: viewHistory, stats: viewStats, settings: viewSettings };
const AFTER = { home: fitHero, history: renderHistBody, stats: renderTrend, settings: fillPersistStatus };

function render() {
  if (!store.data) return;
  $('#view').innerHTML = VIEWS[ui.tab]();
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  AFTER[ui.tab]?.();
}

function setTab(tab) {
  if (tab === ui.tab) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const fromHome = ui.tab === 'home';
  ui.tab = tab;
  if (fromHome) pushLayer(() => { ui.tab = 'home'; render(); window.scrollTo(0, 0); });
  else if (tab === 'home') popLayer();
  render();
  window.scrollTo(0, 0);
}

/* =====================================================================
   Sheets, dialogs, toasts
   ===================================================================== */
let sheetOpen = false;

function openSheet(html, { focus } = {}) {
  const root = $('#sheet-root');
  if (!sheetOpen) {
    root.innerHTML = '<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><div class="sheet-inner"></div></div>';
    enableSheetDrag($('.sheet', root));
    void root.offsetWidth; // let the slide-in animate
    root.classList.add('open');
    sheetOpen = true;
    document.body.classList.add('noscroll');
    pushLayer(() => closeSheet(true));
  }
  $('.sheet-inner', root).innerHTML = html;
  if (focus) setTimeout(() => $(focus, root)?.focus(), 320);
}

function closeSheet(fromPop = false) {
  if (!sheetOpen) return;
  sheetOpen = false;
  const root = $('#sheet-root');
  root.classList.remove('open');
  document.body.classList.remove('noscroll');
  document.activeElement?.blur?.();
  setTimeout(() => { if (!sheetOpen) root.innerHTML = ''; }, 320);
  if (!fromPop) popLayer();
}

function enableSheetDrag(sheet) {
  let y0 = null, dy = 0;
  sheet.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grabber, .sheet-head') || e.target.closest('button, input')) return;
    y0 = e.clientY;
    dy = 0;
    sheet.style.transition = 'none';
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) closeSheet();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

const sheetHead = (title, back) => `<div class="sheet-head">
  ${back ? `<button class="icon-btn" data-action="${back}" aria-label="Back">${icon('chevL')}</button>` : '<span class="sp"></span>'}
  <h3>${title}</h3>
  <button class="icon-btn" data-action="close-sheet" aria-label="Close">${icon('x')}</button>
</div>`;

function confirmDialog({ title, message, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    const root = $('#dialog-root');
    root.innerHTML = `<div class="dlg-scrim"></div><div class="dlg" role="alertdialog" aria-modal="true">
      <h3>${title}</h3><p>${message}</p>
      <div class="dlg-actions">
        ${cancel ? `<button class="btn ghost" data-dlg="0">${cancel}</button>` : ''}
        <button class="btn ${danger ? 'danger' : 'primary'}" data-dlg="1">${ok}</button>
      </div></div>`;
    root.classList.add('open');
    let done = false;
    const finish = (value, fromPop) => {
      if (done) return;
      done = true;
      root.classList.remove('open');
      root.innerHTML = '';
      root.onclick = null;
      if (!fromPop) popLayer();
      resolve(value);
    };
    pushLayer(() => finish(false, true));
    root.onclick = e => {
      const b = e.target.closest('[data-dlg]');
      if (b) finish(b.dataset.dlg === '1');
      else if (e.target.classList.contains('dlg-scrim')) finish(false);
    };
  });
}

let toastTimer;
function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>${action ? `<button>${action}</button>` : ''}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? Math.max(ms, 5000) : ms);
  if (action) {
    $('button', t).onclick = () => {
      t.classList.remove('show');
      onAction();
    };
  }
}

let choiceCb = null;
function openChoice(title, options, current, onPick) {
  choiceCb = onPick;
  openSheet(`${sheetHead(title)}<div class="sheet-body"><ul class="list card">${options.map(o => `<li>
    <button class="row" data-action="choice" data-v='${esc(JSON.stringify(o.value))}'>
      <span class="row-label">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>
      ${o.value === current ? `<span class="check">${icon('check')}</span>` : ''}
    </button></li>`).join('')}</ul></div>`);
}

/* =====================================================================
   Add / edit transaction
   ===================================================================== */
let txf = null;
const TX_LABELS = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

function openTxForm(tx = null) {
  const accs = store.data.accounts;
  if (!accs.length) return toast('Add an account first');
  const last = store.account(store.s.lastAccount) ? store.s.lastAccount : accs[0].id;
  txf = {
    editing: tx,
    f: tx
      ? { ...tx, amountRaw: amountStr(tx.amount) }
      : { type: 'expense', amountRaw: '', accountId: last, toAccountId: null, categoryId: null, date: todayStr(), note: '' },
  };
  drawTxForm(!tx);
}

function readTxInputs() {
  const f = txf.f;
  f.amountRaw = $('#f-amount')?.value ?? f.amountRaw;
  f.date = $('#f-date')?.value || f.date;
  f.note = $('#f-note')?.value ?? f.note;
}

function drawTxForm(focus = false) {
  const { f, editing } = txf;
  const accChips = (sel, action) => store.data.accounts.map(a =>
    `<button class="chip${sel === a.id ? ' on' : ''}" data-action="${action}" data-id="${a.id}">${accIcon(a)} ${esc(a.name)}</button>`).join('');
  const today = todayStr(), yest = addDays(today, -1);
  openSheet(`${sheetHead(editing ? 'Edit transaction' : 'New transaction')}
  <div class="sheet-body">
    <div class="seg">${Object.entries(TX_LABELS).map(([k, l]) =>
      `<button class="seg-btn${f.type === k ? ' on' : ''}" data-action="tx-type" data-type="${k}">${l}</button>`).join('')}</div>
    <label class="amount ${f.type}">
      <span class="amount-cur">${esc(store.s.currency)}</span>
      <input id="f-amount" inputmode="decimal" data-money placeholder="0" value="${esc(f.amountRaw)}" autocomplete="off" enterkeyhint="done" aria-label="Amount">
    </label>
    ${f.type === 'transfer' ? '' : `<div class="f-label">Category</div>
    <div class="cat-grid">${store.categoriesOf(f.type).map(c =>
      `<button class="cat${f.categoryId === c.id ? ' on' : ''}" data-action="tx-cat" data-id="${c.id}"><span class="cat-emoji">${esc(c.emoji)}</span><span class="cat-name">${esc(c.name)}</span></button>`).join('')}</div>`}
    <div class="f-label">${f.type === 'transfer' ? 'From' : 'Account'}</div>
    <div class="chip-row" data-group="tx-acc">${accChips(f.accountId, 'tx-acc')}</div>
    ${f.type === 'transfer' ? `<div class="f-label">To</div><div class="chip-row" data-group="tx-to">${accChips(f.toAccountId, 'tx-to')}</div>` : ''}
    <div class="f-label">Date</div>
    <div class="date-row">
      <button class="chip${f.date === today ? ' on' : ''}" data-action="tx-day" data-d="${today}">Today</button>
      <button class="chip${f.date === yest ? ' on' : ''}" data-action="tx-day" data-d="${yest}">Yesterday</button>
      <input id="f-date" class="input" type="date" value="${f.date}" aria-label="Date">
    </div>
    <label class="field"><span>Note</span><input id="f-note" type="text" maxlength="80" placeholder="Optional, e.g. lunch with team" value="${esc(f.note)}" autocomplete="off" enterkeyhint="done"></label>
  </div>
  <div class="sheet-foot">
    ${editing ? `<button class="btn ghost icon-only" data-action="tx-delete" aria-label="Delete transaction">${icon('trash')}</button>` : ''}
    <button class="btn primary grow" data-action="tx-save">${editing ? 'Save changes' : `Add ${TX_LABELS[f.type].toLowerCase()}`}</button>
  </div>`, { focus: focus ? '#f-amount' : null });
}

function saveTx() {
  readTxInputs();
  const { f, editing } = txf;
  const amount = parseAmount(f.amountRaw);
  if (!(amount > 0)) return formError('#f-amount', 'Enter an amount');
  if (f.type !== 'transfer' && !store.category(f.categoryId)) return formError('.cat-grid', 'Pick a category');
  if (!store.account(f.accountId)) return formError('[data-group="tx-acc"]', 'Pick an account');
  if (f.type === 'transfer') {
    if (!store.account(f.toAccountId)) return formError('[data-group="tx-to"]', 'Pick where the money goes');
    if (f.toAccountId === f.accountId) return formError('[data-group="tx-to"]', 'Pick a different account to move money to');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return formError('#f-date', 'Pick a date');
  const rec = {
    id: editing?.id ?? uid(),
    type: f.type,
    amount,
    accountId: f.accountId,
    toAccountId: f.type === 'transfer' ? f.toAccountId : null,
    categoryId: f.type === 'transfer' ? null : f.categoryId,
    date: f.date,
    note: f.note.trim().slice(0, 80),
    createdAt: editing?.createdAt ?? Date.now(),
  };
  const list = store.data.tx;
  const i = editing ? list.findIndex(t => t.id === editing.id) : -1;
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  store.s.lastAccount = f.accountId;
  if (!persist()) return;
  closeSheet();
  render();
  toast(editing ? 'Changes saved' : `${TX_LABELS[f.type]} of ${money(amount, { mask: false })} added`);
}

async function deleteTx() {
  const { editing } = txf;
  const ok = await confirmDialog({ title: 'Delete transaction?', message: 'It will be removed from your history and balances.', ok: 'Delete', danger: true });
  if (!ok) return;
  const i = store.data.tx.findIndex(t => t.id === editing.id);
  if (i < 0) return;
  const [removed] = store.data.tx.splice(i, 1);
  persist();
  closeSheet();
  render();
  toast('Transaction deleted', {
    action: 'Undo',
    onAction: () => { store.data.tx.push(removed); persist(); render(); },
  });
}

/* =====================================================================
   Accounts
   ===================================================================== */
let accf = null;

function openAccounts() {
  const bal = store.balances();
  openSheet(`${sheetHead('Accounts')}
  <div class="sheet-body">
    <ul class="list card">${store.data.accounts.map(a => row({
      action: 'edit-account', id: a.id, ico: accIcon(a), label: esc(a.name), sub: ACCOUNT_TYPES[a.type].label, val: money(bal.get(a.id)),
    })).join('')}</ul>
    <p class="hint">Total across all accounts: <b>${money(store.totalBalance(bal))}</b></p>
  </div>
  <div class="sheet-foot"><button class="btn primary grow" data-action="add-account" data-from="list">${icon('plus')} Add account</button></div>`);
}

function openAccountForm(acc, fromList) {
  const bal = acc ? store.balances().get(acc.id) : 0;
  accf = { acc, type: acc?.type ?? 'bank', fromList };
  openSheet(`${sheetHead(acc ? 'Edit account' : 'New account', fromList ? 'open-accounts' : null)}
  <div class="sheet-body">
    <label class="field"><span>Name</span><input id="a-name" type="text" maxlength="24" placeholder="e.g. BOC Savings" value="${esc(acc?.name ?? '')}" autocomplete="off"></label>
    <div class="f-label">Type</div>
    <div class="chip-row wrap">${Object.entries(ACCOUNT_TYPES).map(([k, v]) =>
      `<button class="chip${accf.type === k ? ' on' : ''}" data-action="acc-type" data-type="${k}">${v.icon} ${v.label}</button>`).join('')}</div>
    <div class="field"><span>Current balance</span>
      <div class="input-pre">
        <b>${esc(curPrefix().trim())}</b>
        <input id="a-bal" inputmode="decimal" data-money="neg" placeholder="0" value="${bal ? amountStr(bal) : ''}" autocomplete="off" aria-label="Current balance">
        <button class="sign-btn" data-action="toggle-sign" data-for="a-bal" aria-label="Switch between plus and minus">±</button>
      </div>
    </div>
    <p class="hint">What's in this account right now. Tap ± for money you owe, like a credit card balance.</p>
  </div>
  <div class="sheet-foot">
    ${acc ? `<button class="btn ghost icon-only" data-action="acc-delete" aria-label="Delete account">${icon('trash')}</button>` : ''}
    <button class="btn primary grow" data-action="acc-save">${acc ? 'Save' : 'Add account'}</button>
  </div>`, { focus: acc ? null : '#a-name' });
}

function saveAccount() {
  const name = $('#a-name').value.trim();
  if (!name) return formError('#a-name', 'Give the account a name');
  const raw = $('#a-bal').value.trim();
  const target = raw ? parseAmount(raw, { allowNegative: true }) : 0;
  if (Number.isNaN(target)) return formError('#a-bal', 'Enter a valid balance');
  let { acc } = accf;
  if (!acc) {
    acc = { id: uid(), name, type: accf.type, opening: 0 };
    store.data.accounts.push(acc);
  }
  acc.name = name;
  acc.type = accf.type;
  // Back-compute the opening balance so today's balance matches what was entered.
  acc.opening += target - store.balances().get(acc.id);
  if (!persist()) return;
  render();
  if (accf.fromList) openAccounts();
  else closeSheet();
  toast('Account saved');
}

async function deleteAccount() {
  const { acc } = accf;
  if (store.data.accounts.length <= 1) return toast('You need at least one account');
  const n = store.txCountFor({ accountId: acc.id });
  const ok = await confirmDialog({
    title: `Delete ${esc(acc.name)}?`,
    message: n ? `Its ${n} transaction${n > 1 ? 's' : ''} (including transfers) will be deleted too. This can't be undone.` : 'This account has no transactions.',
    ok: 'Delete',
    danger: true,
  });
  if (!ok) return;
  store.data.tx = store.data.tx.filter(t => t.accountId !== acc.id && t.toAccountId !== acc.id);
  store.data.accounts = store.data.accounts.filter(a => a.id !== acc.id);
  if (ui.histAccount === acc.id) ui.histAccount = null;
  persist();
  render();
  if (accf.fromList) openAccounts();
  else closeSheet();
  toast('Account deleted');
}

/* =====================================================================
   Categories
   ===================================================================== */
let catType = 'expense';
let catf = null;

function openCategories() {
  openSheet(`${sheetHead('Categories')}
  <div class="sheet-body">
    <div class="seg two">${['expense', 'income'].map(k =>
      `<button class="seg-btn${catType === k ? ' on' : ''}" data-action="cat-tab" data-type="${k}">${k === 'expense' ? 'Expenses' : 'Income'}</button>`).join('')}</div>
    <ul class="list card mt">${store.categoriesOf(catType).map(c => row({ action: 'edit-cat', id: c.id, ico: esc(c.emoji), label: esc(c.name) })).join('')}</ul>
  </div>
  <div class="sheet-foot"><button class="btn primary grow" data-action="add-cat">${icon('plus')} Add category</button></div>`);
}

function openCatForm(cat) {
  catf = { cat, emoji: cat?.emoji ?? '📦' };
  openSheet(`${sheetHead(cat ? 'Edit category' : `New ${catType === 'expense' ? 'expense' : 'income'} category`, 'open-categories')}
  <div class="sheet-body">
    <div class="cat-preview" id="c-preview">${esc(catf.emoji)}</div>
    <label class="field"><span>Name</span><input id="c-name" type="text" maxlength="22" placeholder="e.g. Coffee" value="${esc(cat?.name ?? '')}" autocomplete="off"></label>
    <div class="f-label">Icon</div>
    <div class="emoji-grid">${EMOJIS.map(e => `<button class="emo${e === catf.emoji ? ' on' : ''}" data-action="cat-emoji" data-e="${e}">${e}</button>`).join('')}</div>
    <label class="field"><span>Or type any emoji</span><input id="c-emoji" type="text" maxlength="12" placeholder="😀" autocomplete="off"></label>
  </div>
  <div class="sheet-foot">
    ${cat ? `<button class="btn ghost icon-only" data-action="cat-delete" aria-label="Delete category">${icon('trash')}</button>` : ''}
    <button class="btn primary grow" data-action="cat-save">Save</button>
  </div>`, { focus: cat ? null : '#c-name' });
}

function setCatEmoji(e) {
  catf.emoji = e;
  $('#c-preview').textContent = e;
  $$('.emo').forEach(b => b.classList.toggle('on', b.dataset.e === e));
}

function saveCat() {
  const name = $('#c-name').value.trim();
  if (!name) return formError('#c-name', 'Give the category a name');
  let { cat } = catf;
  if (!cat) {
    cat = { id: uid(), type: catType };
    store.data.categories.push(cat);
  }
  cat.name = name;
  cat.emoji = catf.emoji;
  if (!persist()) return;
  render();
  openCategories();
  toast('Category saved');
}

async function deleteCat() {
  const { cat } = catf;
  const others = store.categoriesOf(cat.type).filter(c => c.id !== cat.id);
  if (!others.length) return toast('You need at least one category');
  const n = store.txCountFor({ categoryId: cat.id });
  const target = others.find(c => /^other/i.test(c.name)) || others[0];
  const ok = await confirmDialog({
    title: `Delete ${esc(cat.name)}?`,
    message: n ? `Its ${n} transaction${n > 1 ? 's' : ''} will move to ${esc(target.emoji)} ${esc(target.name)}.` : 'No transactions use this category.',
    ok: 'Delete',
    danger: true,
  });
  if (!ok) return;
  for (const t of store.data.tx) if (t.categoryId === cat.id) t.categoryId = target.id;
  store.data.categories = store.data.categories.filter(c => c.id !== cat.id);
  if (ui.histCategory === cat.id) ui.histCategory = null;
  persist();
  render();
  openCategories();
  toast('Category deleted');
}

/* =====================================================================
   Budget, currency, install
   ===================================================================== */
function openBudget() {
  const b = store.s.budget;
  openSheet(`${sheetHead('Monthly budget')}
  <div class="sheet-body">
    <p class="hint top">Set a spending limit for each month. Home shows how much is left.</p>
    <label class="amount"><span class="amount-cur">${esc(store.s.currency)}</span><input id="b-amt" inputmode="decimal" data-money placeholder="0" value="${b ? amountStr(b) : ''}" autocomplete="off" aria-label="Budget"></label>
  </div>
  <div class="sheet-foot">
    ${b ? '<button class="btn ghost" data-action="budget-off">Turn off</button>' : ''}
    <button class="btn primary grow" data-action="budget-save">Save</button>
  </div>`, { focus: '#b-amt' });
}

function saveBudget(off = false) {
  const v = off ? 0 : parseAmount($('#b-amt').value);
  if (!off && !(v > 0)) return formError('#b-amt', 'Enter a budget amount');
  store.s.budget = v;
  persist();
  closeSheet();
  render();
  toast(off ? 'Budget turned off' : 'Budget saved');
}

function openCurrency() {
  const cur = store.s.currency;
  openSheet(`${sheetHead('Currency')}
  <div class="sheet-body">
    <div class="chip-row wrap">${CURRENCIES.map(c => `<button class="chip${cur === c ? ' on' : ''}" data-action="set-currency" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <label class="field"><span>Custom symbol</span><input id="cur-custom" type="text" maxlength="5" placeholder="e.g. SGD" value="${CURRENCIES.includes(cur) ? '' : esc(cur)}" autocomplete="off"></label>
    <p class="hint">This only changes how amounts are shown. Nothing is converted.</p>
  </div>
  <div class="sheet-foot"><button class="btn primary grow" data-action="cur-save">Use custom symbol</button></div>`);
}

function setCurrency(c) {
  c = c.trim();
  if (!c) return formError('#cur-custom', 'Type a symbol');
  store.s.currency = c;
  persist();
  closeSheet();
  render();
}

let installEvt = null;
async function install() {
  if (installEvt) {
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    installEvt = null;
    if (outcome === 'accepted') toast('Installing MyWallet…');
    return;
  }
  openSheet(`${sheetHead('Install MyWallet')}
  <div class="sheet-body">
    <ol class="steps">
      <li>Open this page in <b>Chrome</b> on your phone.</li>
      <li>Tap <b>⋮</b> in the top right.</li>
      <li>Tap <b>Add to Home screen</b>, then <b>Install</b>.</li>
    </ol>
    <p class="hint">In Samsung Internet: tap <b>☰</b>, then <b>Add page to</b> → <b>Home screen</b>.</p>
  </div>`);
}

/* =====================================================================
   Backup
   ===================================================================== */
function backupJson() {
  const { pinHash, pinSalt, ...settings } = store.s; // the PIN never leaves the phone
  return JSON.stringify({ app: 'MyWallet', format: 1, exportedAt: new Date().toISOString(), data: { ...store.data, settings } });
}

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function markBackedUp() {
  store.s.lastBackup = new Date().toISOString();
  persist();
  render();
}

function exportBackup() {
  downloadFile(`mywallet-backup-${todayStr()}.json`, backupJson(), 'application/json');
  markBackedUp();
  toast('Backup saved to your Downloads folder');
}

async function shareBackup() {
  // Chrome on Android won't share .json files, so the backup travels as .txt.
  const file = new File([backupJson()], `mywallet-backup-${todayStr()}.txt`, { type: 'text/plain' });
  if (!navigator.canShare?.({ files: [file] })) return toast('Sharing isn\'t available here. Use Download backup.');
  try {
    await navigator.share({ files: [file], title: 'MyWallet backup' });
    markBackedUp();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not share the backup');
  }
}

function importBackup() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,.txt,application/json,text/plain' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    let data;
    try {
      data = validateBackup(JSON.parse(await file.text()));
    } catch {
      return toast('That file isn\'t a MyWallet backup');
    }
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: `Your current data (${store.data.tx.length} transactions) will be replaced with the backup (${data.tx.length} transactions). Your PIN stays the same.`,
      ok: 'Restore',
      danger: true,
    });
    if (!ok) return;
    const keep = { pinHash: store.s.pinHash, pinSalt: store.s.pinSalt, onboarded: true };
    store.data = data;
    Object.assign(store.s, keep);
    Object.assign(ui, { histAccount: null, histCategory: null, histQuery: '' });
    if (!persist()) return;
    applyTheme();
    render();
    toast('Backup restored');
  };
  input.click();
}

function exportCsv() {
  const rows = [['Date', 'Type', 'Amount', 'Account', 'To account', 'Category', 'Note']];
  for (const t of store.sortedTx()) {
    rows.push([t.date, t.type, (t.amount / 100).toFixed(2), store.account(t.accountId)?.name ?? '',
      store.account(t.toAccountId)?.name ?? '', store.category(t.categoryId)?.name ?? '', t.note]);
  }
  const cell = v => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  downloadFile(`mywallet-${todayStr()}.csv`, '﻿' + rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
  toast('CSV saved to your Downloads folder');
}

async function eraseAll() {
  const ok = await confirmDialog({
    title: 'Erase everything?',
    message: 'All accounts, transactions and your PIN will be deleted from this phone. Download a backup first if you might need it.',
    ok: 'Erase',
    danger: true,
  });
  if (!ok) return;
  store.wipe();
  if (ui.tab !== 'home') popLayer();
  Object.assign(ui, { tab: 'home', histAccount: null, histCategory: null, histQuery: '', histType: 'all' });
  $('#view').innerHTML = '';
  applyTheme();
  startLock('onboard');
}

/* =====================================================================
   Lock screen: onboarding, PIN create/verify/unlock
   ===================================================================== */
const lock = { purpose: null, mode: null, entry: '', first: '', msg: '', attempts: 0, until: 0, busy: false };
const PIN_MODES = ['unlock', 'verify', 'create', 'confirm'];

const randomSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // crypto.subtle only exists on https/localhost; plain-http testing falls back to FNV-1a.
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return 'fnv' + (h >>> 0).toString(16);
}

function startLock(purpose) {
  const locked = document.body.classList.contains('locked');
  if (locked && purpose === 'unlock') return;
  Object.assign(lock, { purpose, entry: '', first: '', msg: '' });
  lock.mode = { onboard: 'welcome', unlock: 'unlock', change: 'verify', disable: 'verify', enable: 'create' }[purpose];
  document.activeElement?.blur?.();
  $('#toast').classList.remove('show');
  document.body.classList.add('locked');
  $('#lock').hidden = false;
  drawLock();
}

function finishLock() {
  $('#lock').hidden = true;
  $('#lock').innerHTML = '';
  document.body.classList.remove('locked');
  lock.purpose = lock.mode = null;
  render();
}

function drawLock() {
  const el = $('#lock');
  const m = lock.mode;
  const cancel = ['change', 'disable', 'enable'].includes(lock.purpose)
    ? `<button class="icon-btn lock-cancel" data-lock="cancel" aria-label="Cancel">${icon('x')}</button>` : '';

  if (m === 'welcome') {
    el.innerHTML = `<div class="lock-inner">
      <div class="lock-brand">${brand('lg')}<p class="lock-tag">Your money, always in your pocket.</p></div>
      <ul class="features">
        <li><span class="f-ico">${icon('shield')}</span><span><b>Private</b>Everything stays on this phone. No account, no cloud.</span></li>
        <li><span class="f-ico">${icon('lock')}</span><span><b>PIN protected</b>Only you can open it.</span></li>
        <li><span class="f-ico">${icon('offline')}</span><span><b>Works offline</b>Add expenses anywhere, any time.</span></li>
      </ul>
      <div class="lock-bottom"><button class="btn gold block" data-lock="start">Get started</button></div>
    </div>`;
    return;
  }

  if (m === 'setup') {
    el.innerHTML = `<div class="lock-inner">
      <div class="lock-brand row">${brand()}</div>
      <h2 class="lock-title left">Starting balances</h2>
      <p class="lock-sub left">How much do you have right now? You can change this later in Settings.</p>
      <div class="f-label">Currency</div>
      <div class="chip-row wrap">${CURRENCIES.map(c => `<button class="chip${store.s.currency === c ? ' on' : ''}" data-lock="cur" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      ${store.data.accounts.map(a => `<label class="field"><span>${accIcon(a)} ${a.type === 'cash' ? 'Cash in hand' : `${esc(a.name)} balance`}</span>
        <input class="input setup-bal" data-id="${a.id}" inputmode="decimal" data-money placeholder="0" autocomplete="off"></label>`).join('')}
      <div class="lock-bottom"><button class="btn gold block" data-lock="finish">Start using MyWallet</button></div>
    </div>`;
    return;
  }

  const titles = { unlock: 'Enter your PIN', verify: 'Enter your current PIN', create: 'Create a 4-digit PIN', confirm: 'Confirm your PIN' };
  const subs = { unlock: 'Unlock MyWallet', verify: 'To make changes to your PIN', create: 'You\'ll use it to open MyWallet', confirm: 'Enter the same PIN again' };
  const left = lock.purpose === 'onboard' && m === 'create' ? '<button class="key text" data-lock="skip">Skip</button>' : '<span></span>';
  el.innerHTML = `<div class="lock-inner">
    ${cancel}
    <div class="lock-brand sm">${brand('md')}</div>
    <div class="lock-mid">
      <h2 class="lock-title">${titles[m]}</h2>
      <p class="lock-sub${lock.msg ? ' err' : ''}" id="lock-msg">${lock.msg || subs[m]}</p>
      <div class="pin-dots" id="pin-dots">${'<i></i>'.repeat(4)}</div>
    </div>
    <div class="keypad">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button class="key" data-key="${k}">${k}</button>`).join('')}
      ${left}
      <button class="key" data-key="0">0</button>
      <button class="key text" data-key="del" aria-label="Delete">${icon('backspace')}</button>
    </div>
  </div>`;
  if (Date.now() < lock.until) startCooldown();
}

function updateDots() {
  $$('#pin-dots i').forEach((d, i) => d.classList.toggle('on', i < lock.entry.length));
}

function lockMessage(msg, err = true) {
  const el = $('#lock-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', err);
}

function failPin(msg) {
  lockMessage(msg);
  const dots = $('#pin-dots');
  dots.classList.remove('shake');
  void dots.offsetWidth;
  dots.classList.add('shake');
  navigator.vibrate?.(120);
  setTimeout(() => { lock.entry = ''; updateDots(); }, 380);
}

function startCooldown() {
  const tick = () => {
    const left = Math.ceil((lock.until - Date.now()) / 1000);
    if (left <= 0) return lockMessage('Try again', false);
    lockMessage(`Too many tries. Wait ${left}s.`);
    setTimeout(tick, 500);
  };
  tick();
}

async function pinKey(k) {
  if (lock.busy || !PIN_MODES.includes(lock.mode) || Date.now() < lock.until) return;
  if (k === 'del') lock.entry = lock.entry.slice(0, -1);
  else if (lock.entry.length < 4) lock.entry += k;
  updateDots();
  if (lock.entry.length < 4) return;
  lock.busy = true;
  await new Promise(r => setTimeout(r, 140));
  try {
    await pinComplete(lock.entry);
  } finally {
    lock.busy = false;
  }
}

async function pinComplete(pin) {
  const s = store.s;
  const next = (mode, msg = '') => { Object.assign(lock, { mode, entry: '', msg }); drawLock(); };

  if (lock.mode === 'unlock' || lock.mode === 'verify') {
    if ((await hashPin(pin, s.pinSalt)) !== s.pinHash) {
      if (++lock.attempts >= 5) {
        lock.attempts = 0;
        lock.until = Date.now() + 30000;
        failPin('Too many tries.');
        setTimeout(startCooldown, 400);
      } else {
        failPin('Wrong PIN. Try again.');
      }
      return;
    }
    lock.attempts = 0;
    if (lock.mode === 'unlock') return finishLock();
    if (lock.purpose === 'disable') {
      s.pinHash = s.pinSalt = null;
      persist();
      finishLock();
      return toast('PIN lock turned off');
    }
    return next('create');
  }

  if (lock.mode === 'create') {
    lock.first = pin;
    return next('confirm');
  }

  if (lock.mode === 'confirm') {
    if (pin !== lock.first) {
      lock.first = '';
      next('create', 'PINs didn\'t match. Try again.');
      return;
    }
    s.pinSalt = randomSalt();
    s.pinHash = await hashPin(pin, s.pinSalt);
    persist();
    if (lock.purpose === 'onboard') return next('setup');
    finishLock();
    toast(lock.purpose === 'change' ? 'PIN changed' : 'PIN lock turned on');
  }
}

function lockAction(action, el) {
  switch (action) {
    case 'start':
      store.create();
      applyTheme();
      lock.mode = 'create';
      drawLock();
      break;
    case 'skip':
      lock.mode = 'setup';
      drawLock();
      break;
    case 'cur':
      store.s.currency = el.dataset.c;
      selectIn(el);
      break;
    case 'finish': {
      for (const input of $$('.setup-bal')) {
        const v = input.value.trim() ? parseAmount(input.value) : 0;
        if (Number.isNaN(v)) return formError(`.setup-bal[data-id="${input.dataset.id}"]`, 'Enter a valid amount');
        store.account(input.dataset.id).opening = v;
      }
      store.s.onboarded = true;
      persist();
      requestPersist();
      finishLock();
      toast('Welcome to MyWallet!');
      break;
    }
    case 'cancel':
      finishLock();
      break;
  }
}

/* =====================================================================
   Actions & events
   ===================================================================== */
const ACTIONS = {
  'go': el => setTab(el.dataset.tab),
  'add-tx': () => openTxForm(),
  'edit-tx': el => {
    const t = store.data.tx.find(x => x.id === el.dataset.id);
    if (t) openTxForm(t);
  },
  'close-sheet': () => closeSheet(),
  'toggle-hide': () => { store.s.hideAmounts = !store.s.hideAmounts; persist(); render(); },
  'lock-now': () => startLock('unlock'),
  'nudge-dismiss': () => { store.s.nudgeDismissed = new Date().toISOString(); persist(); render(); },

  'month': el => {
    const k = el.dataset.k;
    ui[k] = addMonths(ui[k], +el.dataset.d);
    if (k === 'statsYm') ui.chartSel = null;
    render();
  },
  'hist-type': el => { ui.histType = el.dataset.type; render(); },
  'clear-filter': el => { ui[el.dataset.f] = null; render(); },
  'acc-history': el => {
    Object.assign(ui, { histAccount: el.dataset.id, histCategory: null, histType: 'all', histQuery: '', histYm: thisYm() });
    setTab('history');
  },
  'cat-drill': el => {
    Object.assign(ui, { histYm: ui.statsYm, histCategory: el.dataset.id, histAccount: null, histType: 'all', histQuery: '' });
    setTab('history');
  },
  'chart-sel': el => { ui.chartSel = +el.dataset.i; renderTrend(); },

  'tx-type': el => {
    readTxInputs();
    const f = txf.f;
    f.type = el.dataset.type;
    if (f.categoryId && store.category(f.categoryId)?.type !== f.type) f.categoryId = null;
    drawTxForm();
  },
  'tx-cat': el => { txf.f.categoryId = el.dataset.id; selectIn(el); },
  'tx-acc': el => { txf.f.accountId = el.dataset.id; selectIn(el); },
  'tx-to': el => { txf.f.toAccountId = el.dataset.id; selectIn(el); },
  'tx-day': el => {
    txf.f.date = el.dataset.d;
    $('#f-date').value = el.dataset.d;
    $$('[data-action="tx-day"]').forEach(b => b.classList.toggle('on', b === el));
  },
  'tx-save': saveTx,
  'tx-delete': deleteTx,

  'open-accounts': openAccounts,
  'add-account': el => openAccountForm(null, el.dataset.from === 'list'),
  'edit-account': el => openAccountForm(store.account(el.dataset.id), true),
  'acc-type': el => { accf.type = el.dataset.type; selectIn(el); },
  'acc-save': saveAccount,
  'acc-delete': deleteAccount,
  'toggle-sign': el => {
    const input = $(`#${el.dataset.for}`);
    input.value = input.value.startsWith('-') ? input.value.slice(1) : `-${input.value}`;
  },

  'open-categories': openCategories,
  'cat-tab': el => { catType = el.dataset.type; openCategories(); },
  'add-cat': () => openCatForm(null),
  'edit-cat': el => openCatForm(store.category(el.dataset.id)),
  'cat-emoji': el => setCatEmoji(el.dataset.e),
  'cat-save': saveCat,
  'cat-delete': deleteCat,

  'open-budget': openBudget,
  'budget-save': () => saveBudget(),
  'budget-off': () => saveBudget(true),
  'open-currency': openCurrency,
  'set-currency': el => setCurrency(el.dataset.c),
  'cur-save': () => setCurrency($('#cur-custom').value),
  'toggle-decimals': () => { store.s.decimals = store.s.decimals ? 0 : 2; persist(); render(); },

  'pin-change': () => startLock('change'),
  'pin-enable': () => startLock('enable'),
  'pin-disable': () => startLock('disable'),
  'open-autolock': () => openChoice('Auto-lock', AUTOLOCK, store.s.autoLock, v => {
    store.s.autoLock = v; persist(); closeSheet(); render();
  }),
  'open-theme': () => openChoice('Theme', THEMES, store.s.theme, v => {
    store.s.theme = v; persist(); applyTheme(); closeSheet(); render();
  }),
  'choice': el => choiceCb?.(JSON.parse(el.dataset.v)),

  'backup-download': exportBackup,
  'backup-share': shareBackup,
  'backup-import': importBackup,
  'export-csv': exportCsv,
  'install': install,
  'erase': eraseAll,
};

let hiddenAt = Date.now();

function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || !store.data) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  $('#lock').addEventListener('click', e => {
    const key = e.target.closest('[data-key]');
    if (key) return pinKey(key.dataset.key);
    const a = e.target.closest('[data-lock]');
    if (a) lockAction(a.dataset.lock, a);
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-money]')) sanitizeMoney(t);
    if (t.id === 'hist-q') {
      ui.histQuery = t.value;
      renderHistBody();
    }
    if (t.id === 'c-emoji' && t.value.trim()) {
      const first = [...new Intl.Segmenter().segment(t.value.trim())][0]?.segment;
      if (first) setCatEmoji(first);
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'f-date' && txf) {
      txf.f.date = e.target.value;
      $$('[data-action="tx-day"]').forEach(b => b.classList.toggle('on', b.dataset.d === txf.f.date));
    }
  });

  document.addEventListener('keydown', e => {
    if (!$('#lock').hidden && PIN_MODES.includes(lock.mode)) {
      if (/^\d$/.test(e.key)) pinKey(e.key);
      else if (e.key === 'Backspace') pinKey('del');
      return;
    }
    if (e.key === 'Enter' && e.target.matches?.('.sheet input')) e.target.blur();
  });

  // Auto-lock after time away from the app.
  document.addEventListener('visibilitychange', () => {
    if (!store.data?.settings.onboarded || !store.s.pinHash) return;
    const locked = document.body.classList.contains('locked');
    if (document.hidden) {
      hiddenAt = Date.now();
      if (store.s.autoLock === 0 && !locked) startLock('unlock');
    } else if (!locked && store.s.autoLock > 0 && Date.now() - hiddenAt >= store.s.autoLock * 60000) {
      startLock('unlock');
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (ui.tab === 'stats') renderTrend(); }, 150);
  });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvt = e;
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    if (ui.tab === 'settings') render();
  });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // Skip on a local dev server so edits show up straight away (add ?sw to test it locally).
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => toast('A new version of MyWallet is ready', { action: 'Update', ms: 15000, onAction: () => w.postMessage('skipWaiting') });
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(err => console.warn('Service worker not registered', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

function boot() {
  $$('[data-icon]').forEach(s => { s.outerHTML = icon(s.dataset.icon); });
  store.load();
  applyTheme();
  bindEvents();
  if (!store.data || !store.s.onboarded) startLock('onboard');
  else if (store.s.pinHash) startLock('unlock');
  else render();
  if (store.data?.settings.onboarded) requestPersist();
  $('#splash')?.remove();
  registerSW();
}

boot();
