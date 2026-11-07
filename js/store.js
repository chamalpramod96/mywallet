// Data layer: everything lives in this phone's localStorage. Amounts are integer cents.
const KEY = 'mywallet.v1';
export const APP_VERSION = '1.1.1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- dates (local time, YYYY-MM-DD strings) ---------- */
const pad = n => String(n).padStart(2, '0');
export const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const ymOf = s => s.slice(0, 7);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
export const thisYm = () => ymOf(todayStr());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/* ---------- amounts ---------- */
const MAX_CENTS = 1e13;
// "1,250.5" -> 125050. Returns NaN for anything that isn't a plain number.
export function parseAmount(str, { allowNegative = false } = {}) {
  const s = String(str ?? '').replace(/[,\s]/g, '').replace('−', '-');
  const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!s || s === '.' || s === '-' || !re.test(s)) return NaN;
  const cents = Math.round(parseFloat(s) * 100);
  return Math.abs(cents) > MAX_CENTS ? NaN : cents;
}

/* ---------- defaults ---------- */
export const ACCOUNT_TYPES = {
  cash: { label: 'Cash', icon: '💵' },
  bank: { label: 'Bank', icon: '🏦' },
  card: { label: 'Card', icon: '💳' },
  savings: { label: 'Savings', icon: '🐷' },
  ewallet: { label: 'E-wallet', icon: '📱' },
};

const EXPENSE_CATS = [
  ['Food & Dining', '🍔'], ['Groceries', '🛒'], ['Transport', '🚌'], ['Fuel', '⛽'],
  ['Bills & Utilities', '🧾'], ['Mobile & Internet', '📶'], ['Rent & Home', '🏠'], ['Shopping', '🛍️'],
  ['Health', '💊'], ['Education', '🎓'], ['Entertainment', '🎬'], ['Travel', '✈️'],
  ['Gifts & Donations', '🎁'], ['Personal Care', '💇'], ['Loans & EMI', '🏦'], ['Other', '📦'],
];
const INCOME_CATS = [
  ['Salary', '💼'], ['Freelance', '💻'], ['Business', '🏪'], ['Investments', '📈'],
  ['Bonus', '💰'], ['Gifts', '🎁'], ['Refunds', '↩️'], ['Other income', '📦'],
];

const DEFAULT_SETTINGS = {
  onboarded: false,
  currency: 'Rs',
  decimals: 2,
  theme: 'system',
  autoLock: 1, // minutes in background before asking for the PIN; 0 = immediately, -1 = never
  hideAmounts: false,
  budget: 0,
  pinHash: null,
  pinSalt: null,
  lastAccount: null,
  lastBackup: null,
  nudgeDismissed: null,
  pinFails: 0, // wrong PINs in a row; kept here so closing the app doesn't reset the wait
  pinUntil: 0, // no PIN is accepted before this time (ms)
};
const THEME_VALUES = ['system', 'light', 'dark'];
const AUTOLOCK_VALUES = [0, 1, 5, 15, -1];

export function defaultData() {
  const cat = type => ([name, emoji]) => ({ id: uid(), name, emoji, type });
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    accounts: [
      { id: uid(), name: 'Cash', type: 'cash', opening: 0 },
      { id: uid(), name: 'HNB', type: 'bank', opening: 0 },
      { id: uid(), name: 'BOC', type: 'bank', opening: 0 },
      { id: uid(), name: 'HNB Credit Card', type: 'card', opening: 0 },
    ],
    categories: [...EXPENSE_CATS.map(cat('expense')), ...INCOME_CATS.map(cat('income'))],
    tx: [],
    loans: [],
  };
}

// Ids only ever hold letters, digits, "_" and "-" (see uid), so they are safe to put in HTML.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const cleanId = v => (ID_RE.test(String(v ?? '')) ? String(v) : null);
const isTime = v => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

// Every setting is checked, so a damaged save or a crafted backup can't break the app.
function cleanSettings(v) {
  const s = v && typeof v === 'object' ? v : {};
  const bool = (x, d) => (typeof x === 'boolean' ? x : d);
  const text = x => (typeof x === 'string' && x.length <= 200 ? x : null);
  const count = x => (Number.isInteger(x) && x >= 0 && x <= 1e15 ? x : 0);
  const currency = typeof s.currency === 'string' ? s.currency.trim().slice(0, 8) : '';
  return {
    onboarded: bool(s.onboarded, false),
    currency: currency || DEFAULT_SETTINGS.currency,
    decimals: s.decimals === 0 ? 0 : 2,
    theme: THEME_VALUES.includes(s.theme) ? s.theme : 'system',
    autoLock: AUTOLOCK_VALUES.includes(s.autoLock) ? s.autoLock : DEFAULT_SETTINGS.autoLock,
    hideAmounts: bool(s.hideAmounts, false),
    budget: Number.isInteger(s.budget) && s.budget >= 0 && s.budget <= MAX_CENTS ? s.budget : 0,
    pinHash: text(s.pinHash),
    pinSalt: text(s.pinSalt),
    lastAccount: cleanId(s.lastAccount),
    lastBackup: isTime(s.lastBackup) ? s.lastBackup : null,
    nudgeDismissed: isTime(s.nudgeDismissed) ? s.nudgeDismissed : null,
    pinFails: count(s.pinFails),
    pinUntil: count(s.pinUntil),
  };
}

// Fills gaps so older saves and imported backups always have every field.
// Records with a damaged or unexpected id are dropped.
export function normalize(d) {
  const int = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
  const amt = v => Math.min(Math.abs(int(v)), MAX_CENTS);
  const str = (v, d, max) => String(v || d).slice(0, max);
  const list = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object' && cleanId(x.id));
  const accounts = list(d.accounts)
    .map(a => ({ id: String(a.id), name: str(a.name, 'Account', 40), type: ACCOUNT_TYPES[a.type] ? a.type : 'cash', opening: Math.max(-MAX_CENTS, Math.min(MAX_CENTS, int(a.opening))) }));
  const categories = list(d.categories)
    .filter(c => c.type === 'expense' || c.type === 'income')
    .map(c => ({ id: String(c.id), name: str(c.name, 'Category', 40), emoji: str(c.emoji, '📦', 16), type: c.type }));
  const tx = list(d.tx)
    .filter(t => ['expense', 'income', 'transfer'].includes(t.type) && isDate(t.date) && cleanId(t.accountId)
      && (t.type !== 'transfer' || cleanId(t.toAccountId)))
    .map(t => ({
      id: String(t.id), type: t.type, amount: amt(t.amount), accountId: String(t.accountId),
      toAccountId: t.type === 'transfer' ? String(t.toAccountId) : null,
      categoryId: t.type === 'transfer' ? null : cleanId(t.categoryId), date: t.date,
      note: String(t.note || '').slice(0, 120), createdAt: int(t.createdAt) || Date.now(),
    }));
  // Ongoing loans are a plain list: they don't move account balances.
  const loans = list(d.loans)
    .filter(l => l.direction === 'owe' || l.direction === 'lent')
    .map(l => ({
      id: String(l.id), direction: l.direction, name: str(l.name, 'Loan', 40), amount: amt(l.amount),
      date: isDate(l.date) ? l.date : todayStr(), due: isDate(l.due) ? l.due : null,
      note: String(l.note || '').slice(0, 80), createdAt: int(l.createdAt) || Date.now(),
    }));
  return {
    version: 1,
    createdAt: isTime(d.createdAt) ? d.createdAt : new Date().toISOString(),
    settings: cleanSettings(d.settings),
    accounts,
    categories,
    tx,
    loans,
  };
}

export function validateBackup(obj) {
  const d = obj && obj.data ? obj.data : obj;
  if (!d || !Array.isArray(d.accounts) || !Array.isArray(d.categories) || !Array.isArray(d.tx)) {
    throw new Error('Not a MyWallet backup');
  }
  const data = normalize(d);
  if (!data.accounts.length) throw new Error('Backup has no accounts');
  return data;
}

/* ---------- store ---------- */
export const store = {
  data: null,
  KEY,

  // Unreadable data is never deleted: it is kept under "mywallet.v1.corrupt-<time>".
  get corrupt() {
    try {
      return Object.keys(localStorage).some(k => k.startsWith(`${KEY}.corrupt-`));
    } catch {
      return false;
    }
  },

  get s() { return this.data.settings; },

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (raw && (!d || typeof d !== 'object')) throw new Error('Saved data is not an object');
      this.data = d ? normalize(d) : null;
    } catch (e) {
      console.error('Could not read saved data', e);
      this.data = null;
      // Keep the unreadable copy aside, so starting again can't overwrite it.
      if (raw) this.keepCorrupt(raw);
    }
    return this.data;
  },

  keepCorrupt(raw) {
    try {
      localStorage.setItem(`${KEY}.corrupt-${Date.now()}`, raw);
      localStorage.removeItem(KEY);
    } catch (e) {
      console.error('Could not keep the unreadable data', e);
    }
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch (e) {
      console.error('Could not save', e);
      return false;
    }
  },

  create() {
    this.data = defaultData();
    this.save();
  },

  wipe() {
    // Removes the data and any unreadable copies kept aside.
    for (const k of Object.keys(localStorage)) if (k === KEY || k.startsWith(`${KEY}.`)) localStorage.removeItem(k);
    this.data = null;
  },

  account(id) { return this.data.accounts.find(a => a.id === id); },
  category(id) { return this.data.categories.find(c => c.id === id); },
  categoriesOf(type) { return this.data.categories.filter(c => c.type === type); },

  sortedTx() {
    return [...this.data.tx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  },

  balances() {
    const m = new Map(this.data.accounts.map(a => [a.id, a.opening || 0]));
    const add = (id, v) => m.has(id) && m.set(id, m.get(id) + v);
    for (const t of this.data.tx) {
      if (t.type === 'income') add(t.accountId, t.amount);
      else if (t.type === 'expense') add(t.accountId, -t.amount);
      else { add(t.accountId, -t.amount); add(t.toAccountId, t.amount); }
    }
    return m;
  },

  totalBalance(bal = this.balances()) {
    let sum = 0;
    for (const v of bal.values()) sum += v;
    return sum;
  },

  monthTotals(ym) {
    let income = 0, expense = 0;
    for (const t of this.data.tx) {
      if (ymOf(t.date) !== ym) continue;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    }
    return { income, expense };
  },

  byCategory(ym, type) {
    const sums = new Map();
    for (const t of this.data.tx) {
      if (t.type !== type || ymOf(t.date) !== ym) continue;
      sums.set(t.categoryId, (sums.get(t.categoryId) || 0) + t.amount);
    }
    return [...sums].map(([id, amount]) => {
      const c = this.category(id);
      return { id, amount, name: c?.name ?? 'Uncategorised', emoji: c?.emoji ?? '❔' };
    }).sort((a, b) => b.amount - a.amount);
  },

  loanTotals() {
    let owe = 0, lent = 0;
    for (const l of this.data.loans) {
      if (l.direction === 'owe') owe += l.amount;
      else lent += l.amount;
    }
    return { owe, lent };
  },

  txCountFor({ accountId, categoryId }) {
    return this.data.tx.filter(t => (accountId && (t.accountId === accountId || t.toAccountId === accountId)) || (categoryId && t.categoryId === categoryId)).length;
  },
};
