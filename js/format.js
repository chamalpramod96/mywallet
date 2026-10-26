import { store, todayStr, addDays, parseDate } from './store.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nfCache = new Map();
const nf = d => {
  if (!nfCache.has(d)) nfCache.set(d, new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nfCache.get(d);
};

// "Rs" -> "Rs 1,250.00", "$" -> "$1,250.00"
export function curPrefix() {
  const c = store.s.currency || '';
  return /\p{L}$/u.test(c) ? c + ' ' : c;
}

export function money(cents, { sign = false, mask = true } = {}) {
  if (mask && store.s.hideAmounts) return `${curPrefix()}••••`;
  const neg = cents < 0;
  const pre = neg ? '−' : sign && cents > 0 ? '+' : '';
  return `${pre}${curPrefix()}${nf(store.s.decimals).format(Math.abs(cents) / 100)}`;
}

// Whole-unit figure without the currency, for tight table columns: 125050 -> "1,251"
export function plain(cents, { sign = false } = {}) {
  if (store.s.hideAmounts) return '••••';
  const pre = cents < 0 ? '−' : sign && cents > 0 ? '+' : '';
  return pre + nf(0).format(Math.abs(cents) / 100);
}

// For pre-filling inputs: 125050 -> "1250.5"
export const amountStr = cents => String(Math.round(cents) / 100);

// Axis ticks: 1250000 -> "12.5k"
export function compact(cents) {
  if (store.s.hideAmounts) return '•••';
  const v = Math.abs(cents) / 100;
  const t = n => String(n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
  if (v >= 1e6) return t(v / 1e6) + 'M';
  if (v >= 1e3) return t(v / 1e3) + 'k';
  return String(Math.round(v));
}

export function monthLabel(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}

export function dayLabel(ds, { long = false } = {}) {
  const today = todayStr();
  const d = parseDate(ds);
  const full = d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  if (ds === today) return long ? `Today · ${full}` : 'Today';
  if (ds === addDays(today, -1)) return long ? `Yesterday · ${full}` : 'Yesterday';
  return full;
}
