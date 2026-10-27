// Data layer: everything lives in this phone's localStorage. Amounts are integer cents.
const KEY = 'mywallet.v1';
export const APP_VERSION = '1.1.0';

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
};

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

// Fills gaps so older saves and imported backups always have every field.
export function normalize(d) {
  const int = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
  const accounts = (Array.isArray(d.accounts) ? d.accounts : [])
    .filter(a => a && a.id)
    .map(a => ({ id: String(a.id), name: String(a.name || 'Account'), type: ACCOUNT_TYPES[a.type] ? a.type : 'cash', opening: int(a.opening) }));
  const categories = (Array.isArray(d.categories) ? d.categories : [])
    .filter(c => c && c.id && (c.type === 'expense' || c.type === 'income'))
    .map(c => ({ id: String(c.id), name: String(c.name || 'Category'), emoji: String(c.emoji || '📦'), type: c.type }));
  const tx = (Array.isArray(d.tx) ? d.tx : [])
    .filter(t => t && t.id && ['expense', 'income', 'transfer'].includes(t.type) && isDate(t.date))
    .map(t => ({
      id: String(t.id), type: t.type, amount: Math.abs(int(t.amount)), accountId: String(t.accountId),
      toAccountId: t.type === 'transfer' ? String(t.toAccountId) : null,
      categoryId: t.type === 'transfer' ? null : String(t.categoryId), date: t.date,
      note: String(t.note || '').slice(0, 120), createdAt: int(t.createdAt) || Date.now(),
    }));
  // Ongoing loans are a plain list: they don't move account balances.
  const loans = (Array.isArray(d.loans) ? d.loans : [])
    .filter(l => l && l.id && (l.direction === 'owe' || l.direction === 'lent'))
    .map(l => ({
      id: String(l.id), direction: l.direction, name: String(l.name || 'Loan').slice(0, 40), amount: Math.abs(int(l.amount)),
      date: isDate(l.date) ? l.date : todayStr(), due: isDate(l.due) ? l.due : null,
      note: String(l.note || '').slice(0, 80), createdAt: int(l.createdAt) || Date.now(),
    }));
  return {
    version: 1,
    createdAt: d.createdAt || new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
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

  get s() { return this.data.settings; },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) {
      console.error('Could not read saved data', e);
      this.data = null;
    }
    return this.data;
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
    localStorage.removeItem(KEY);
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
