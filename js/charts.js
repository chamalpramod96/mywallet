import { esc, money, compact } from './format.js';

// Spending by category: one-hue horizontal bars, sorted, scaled to the largest category.
export function categoryBars(rows, total) {
  if (!rows.length) return '<p class="empty-sm">No spending recorded for this month.</p>';
  const max = rows[0].amount || 1;
  return `<div class="cbars">${rows.map(r => {
    const share = total ? (r.amount / total) * 100 : 0;
    const pct = share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
    return `<button class="cbar" data-action="cat-drill" data-id="${esc(r.id)}">
      <span class="cbar-ico">${esc(r.emoji)}</span>
      <span class="cbar-body">
        <span class="cbar-top"><span class="cbar-name">${esc(r.name)}</span><span class="cbar-amt">${money(r.amount)}</span></span>
        <span class="cbar-track"><span class="cbar-fill" style="width:${Math.max(2, (r.amount / max) * 100).toFixed(1)}%"></span></span>
      </span>
      <span class="cbar-pct">${pct}</span>
    </button>`;
  }).join('')}</div>`;
}

function niceScale(maxV, ticks = 3) {
  const raw = maxV / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { step, max: step * Math.ceil(maxV / step) };
}

// Column with 4px rounded top, flat on the baseline.
function colPath(x, yTop, w, base, r = 4) {
  const h = base - yTop;
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${base}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${base}Z`;
}

// Income vs expenses, grouped columns per month. `sel` is the highlighted month index.
export function monthlyColumns(months, width, sel) {
  const H = 190, top = 10, bottom = 26, left = 38, right = 2;
  const pw = width - left - right, ph = H - top - bottom;
  const maxV = Math.max(100, ...months.flatMap(m => [m.income, m.expense]));
  const { step, max } = niceScale(maxV);
  const y = v => top + ph - (v / max) * ph;
  const base = y(0);
  const gw = pw / months.length;
  const bw = Math.max(6, Math.min(16, (gw - 14) / 2));
  const gap = 2;

  let grid = '';
  for (let v = step; v <= max + 1e-6; v += step) {
    grid += `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/>`
      + `<text class="tick" x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`;
  }
  grid += `<text class="tick" x="${left - 6}" y="${base + 4}" text-anchor="end">0</text>`;

  let marks = '';
  months.forEach((m, i) => {
    const gx = left + i * gw;
    const cx = gx + gw / 2;
    if (i === sel) marks += `<rect class="band" x="${gx + 2}" y="${top - 4}" width="${gw - 4}" height="${ph + 4}" rx="8"/>`;
    marks += `<path class="b-in" d="${colPath(cx - gap / 2 - bw, y(m.income), bw, base)}"/>`;
    marks += `<path class="b-out" d="${colPath(cx + gap / 2, y(m.expense), bw, base)}"/>`;
    marks += `<text class="tick${i === sel ? ' sel' : ''}" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(m.label)}</text>`;
  });

  const hits = months.map((m, i) =>
    `<rect class="hit" data-action="chart-sel" data-i="${i}" x="${left + i * gw}" y="0" width="${gw}" height="${H}"><title>${esc(m.label)}: income ${money(m.income)}, expenses ${money(m.expense)}</title></rect>`).join('');

  return `<svg class="mchart" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" role="img" aria-label="Income and expenses for the last ${months.length} months">
    ${grid}${marks}<line class="axis" x1="${left}" x2="${width - right}" y1="${base}" y2="${base}"/>${hits}
  </svg>`;
}
