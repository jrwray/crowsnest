// ─────────────────────────────────────────────────────────────────────────────
// STOOQ — stock quotes (no DOM, so it can be unit-tested in Node)
// ─────────────────────────────────────────────────────────────────────────────

// stooq.com CSV quote for a $TICKER (US tickers get a .us suffix). The change is measured
// against the previous close when stooq returns one, otherwise against today's open, and
// `basis` says which so the UI can label it.
export function stooqTicker(sym) {
  let t = sym.replace(/^\$/, '').toLowerCase();
  if (!t.includes('.')) t += '.us';
  return t;
}
export function parseStooqQuote(csv) {
  const [head = '', line = ''] = csv.trim().split(/\r?\n/);
  const cols = head.split(',').map(c => c.trim().toLowerCase());
  const cells = line.split(',');
  const nameAt = cols.indexOf('name');
  const cell = name => {
    const i = cols.findIndex(c => c === name || c.startsWith(name));
    if (i < 0) return undefined;
    return i === nameAt ? cells.slice(i).join(',').replace(/^"|"$/g, '') : cells[i];
  };
  const num = name => { const v = parseFloat(cell(name)); return isFinite(v) ? v : null; };
  const close = num('close');
  if (close == null) throw new Error('no quote (check symbol; non-US needs a suffix)');
  const open = num('open'), prev = num('prev');
  const basis = prev ? 'prev' : 'open';
  const ref = prev || open;
  return {
    name: cell('name') || null, date: cell('date') || null,
    open, high: num('high'), low: num('low'), close, volume: num('volume'), prevClose: prev,
    pct: ref ? ((close - ref) / ref) * 100 : 0, basis
  };
}
export async function fetchStockQuote(sym) {
  const t = stooqTicker(sym);
  const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(t)}&f=sd2t2ohlcvpn&h&e=csv`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseStooqQuote(await res.text());
}
