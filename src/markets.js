import { callClaude } from './claude.js';
import { localGet, localSet } from './storage.js';
import { fetchStockQuote, stooqTicker } from './stooq.js';
import { esc, mdToHtml, safeFetch } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// MARKETS — watchlist, ticker tape, detail modal
// ─────────────────────────────────────────────────────────────────────────────

const marketsListEl = document.getElementById('markets-list');
const marketSymbolEl = document.getElementById('market-symbol');

export const DEFAULT_MARKETS = [
  // crypto (CoinGecko ids)
  'bitcoin', 'ethereum', 'solana', 'dogecoin', 'ripple',
  // hot tech / AI stocks ($ = stooq)
  '$NVDA', '$MSFT', '$GOOGL', '$AMZN', '$META', '$AAPL', '$TSLA',
  '$AMD', '$AVGO', '$PLTR', '$TSM', '$ARM', '$MRVL', '$MU'
];
export async function getMarketSymbols() { const d = await localGet('marketSymbols'); return d.marketSymbols ?? DEFAULT_MARKETS; }
async function saveMarketSymbols(s) { await localSet({ marketSymbols: s }); }
export function renderMarkets(symbols) {
  marketsListEl.innerHTML = '';
  if (!symbols.length) { marketsListEl.innerHTML = '<li class="muted small">Nothing tracked.</li>'; return; }
  symbols.forEach((sym, i) => {
    const li = document.createElement('li'); li.className = 'monitor-item'; li.dataset.symbol = sym;
    const label = document.createElement('span'); label.className = 'monitor-label monitor-link'; label.textContent = sym;
    label.title = 'Details'; label.addEventListener('click', () => openMarketModal(sym));
    const price = document.createElement('span'); price.className = 'market-price'; price.textContent = '…';
    const chg = document.createElement('span'); chg.className = 'market-change'; chg.textContent = '';
    const edit = document.createElement('button'); edit.className = 'list-action'; edit.title = 'Edit symbol'; edit.textContent = '✎';
    edit.addEventListener('click', () => startEditMarket(li, i, sym));
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Remove'; del.textContent = '×';
    del.addEventListener('click', async () => { const s = await getMarketSymbols(); s.splice(i, 1); await saveMarketSymbols(s); renderMarkets(s); refreshMarkets(); renderTicker(); });
    li.append(label, price, chg, edit, del); marketsListEl.appendChild(li);
  });
}
function startEditMarket(li, i, sym) {
  if (li.querySelector('.market-edit-input')) return;
  const label = li.querySelector('.monitor-label');
  const input = document.createElement('input');
  input.className = 'market-edit-input'; input.value = sym;
  input.placeholder = 'bitcoin or $NVDA';
  li.replaceChild(input, label);
  input.focus(); input.select();
  let cancelled = false, done = false;
  const finish = async () => {
    if (done) return; done = true;
    const val = input.value.trim();
    const s = await getMarketSymbols();
    if (!cancelled && val && val !== sym) s[i] = val;
    await saveMarketSymbols(s);
    renderMarkets(s); refreshMarkets(); renderTicker();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(); }
    else if (e.key === 'Escape') { e.stopPropagation(); cancelled = true; finish(); }
  });
  input.addEventListener('blur', finish);
}

const BASIS_LABEL = { prev: 'vs previous close', open: "vs today's open", '24h': 'over 24 hours' };

// Quotes for a watchlist: crypto via CoinGecko (one batched call), $stocks via stooq.
async function fetchMarketQuotes(symbols) {
  const cryptoIds = symbols.filter(s => !s.startsWith('$')).map(s => s.toLowerCase());
  let crypto = {};
  if (cryptoIds.length) {
    try { crypto = await safeFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoIds.join(','))}&vs_currencies=usd&include_24hr_change=true`); } catch {}
  }
  return Promise.all(symbols.map(async sym => {
    if (sym.startsWith('$')) {
      const label = sym.slice(1).toUpperCase();
      try { const q = await fetchStockQuote(sym); return { sym, label, price: q.close, pct: q.pct, basis: q.basis, ok: true }; }
      catch { return { sym, label, ok: false }; }
    }
    const d = crypto[sym.toLowerCase()];
    if (d) return { sym, label: sym.toUpperCase(), price: d.usd, pct: d.usd_24h_change ?? 0, basis: '24h', ok: true };
    return { sym, label: sym.toUpperCase(), ok: false };
  }));
}

export async function refreshMarkets() {
  const items = [...marketsListEl.querySelectorAll('.monitor-item')];
  const quotes = await fetchMarketQuotes(items.map(li => li.dataset.symbol));
  items.forEach((li, i) => {
    const q = quotes[i];
    const priceEl = li.querySelector('.market-price'); const chgEl = li.querySelector('.market-change');
    if (!q.ok) { priceEl.textContent = 'n/a'; chgEl.textContent = ''; return; }
    priceEl.textContent = fmtPrice(q.price);
    setChange(chgEl, q.pct, q.basis);
  });
}
function setChange(el, pct, basis) {
  const sign = pct >= 0 ? '▲' : '▼';
  el.textContent = `${sign} ${Math.abs(pct).toFixed(2)}%`;
  el.className = 'market-change ' + (pct >= 0 ? 'up' : 'down');
  el.title = BASIS_LABEL[basis] || '';
}

const tickerTapeEl = document.getElementById('ticker-tape');
export async function renderTicker() {
  if (!tickerTapeEl) return;
  const symbols = await getMarketSymbols();
  if (!symbols.length) { tickerTapeEl.innerHTML = ''; tickerTapeEl.classList.add('hidden'); return; }
  const quotes = await fetchMarketQuotes(symbols);
  const parts = quotes.map(q => {
    const d = ` data-sym="${esc(q.sym)}"`;
    if (!q.ok) return `<span class="tt-item"${d}><span class="tt-sym">${esc(q.label)}</span> <span class="tt-na">—</span></span>`;
    const arrow = q.pct >= 0 ? '▲' : '▼';
    const cls = q.pct >= 0 ? 'up' : 'down';
    const price = q.price < 1 ? q.price.toFixed(6) : q.price.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<span class="tt-item"${d}><span class="tt-sym">${esc(q.label)}</span> <span class="tt-price">$${price}</span> <span class="tt-chg ${cls}" title="${esc(BASIS_LABEL[q.basis] || '')}">${arrow}${Math.abs(q.pct).toFixed(2)}%</span></span>`;
  });
  const run = parts.join('<span class="tt-sep">·</span>');
  tickerTapeEl.classList.remove('hidden');
  tickerTapeEl.innerHTML = `<div class="tt-track">${run}<span class="tt-sep">·</span>${run}</div>`;
}
if (tickerTapeEl) tickerTapeEl.addEventListener('click', e => {
  const item = e.target.closest('.tt-item[data-sym]');
  if (item) openMarketModal(item.dataset.sym);
});

// ── Market detail modal ──
const marketModal = document.getElementById('market-modal');
const marketModalTitle = document.getElementById('market-modal-title');
const marketBody = document.getElementById('market-modal-body');
const marketLinks = document.getElementById('market-modal-links');

function fmtPrice(p) { return '$' + (p < 1 ? Number(p).toFixed(6) : Number(p).toLocaleString(undefined, { maximumFractionDigits: 2 })); }
function quoteBreakdownHtml({ name, price, pct, basis, rows, asof }) {
  const cls = pct >= 0 ? 'up' : 'down'; const arrow = pct >= 0 ? '▲' : '▼';
  return `<div class="md-name">${esc(name)}</div>
    <div class="md-price">${fmtPrice(price)} <span class="market-change ${cls}">${arrow}${Math.abs(pct).toFixed(2)}%</span> <small class="muted">${esc(BASIS_LABEL[basis] || '')}</small></div>
    <div class="md-rows">${rows.filter(r => r[1] != null && r[1] !== '').map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div>
    ${asof ? `<div class="md-asof">as of ${esc(asof)}</div>` : ''}`;
}
function marketLinksHtml(links) {
  return links.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="md-link">${esc(t)} ↗</a>`).join('');
}

async function openMarketModal(sym) {
  const isStock = sym.startsWith('$');
  marketModalTitle.textContent = isStock ? sym.slice(1).toUpperCase() : sym.toUpperCase();
  marketBody.innerHTML = '<span class="ask-loading">loading</span>';
  marketLinks.innerHTML = '';
  marketModal.classList.remove('hidden');
  try {
    if (isStock) {
      const t = stooqTicker(sym);
      const q = await fetchStockQuote(sym);
      const name = q.name || sym.slice(1).toUpperCase();
      const base = encodeURIComponent(t.replace(/\.us$/, '').toUpperCase());
      marketBody.innerHTML = quoteBreakdownHtml({ name, price: q.close, pct: q.pct, basis: q.basis, asof: q.date, rows: [['Prev Close', q.prevClose != null ? fmtPrice(q.prevClose) : ''], ['Open', q.open != null ? fmtPrice(q.open) : ''], ['Day High', q.high != null ? fmtPrice(q.high) : ''], ['Day Low', q.low != null ? fmtPrice(q.low) : ''], ['Volume', q.volume != null ? q.volume.toLocaleString() : '']] });
      marketLinks.innerHTML = marketLinksHtml([
        ['Yahoo Finance', `https://finance.yahoo.com/quote/${base}`],
        ['Google News', `https://news.google.com/search?q=${encodeURIComponent(name + ' stock')}`],
        ['TradingView', `https://www.tradingview.com/symbols/${base}/`],
        ['MarketWatch', `https://www.marketwatch.com/investing/stock/${base.toLowerCase()}`],
        ['stooq chart', `https://stooq.com/q/?s=${encodeURIComponent(t)}`]
      ]);
    } else {
      const arr = await safeFetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(sym.toLowerCase())}`);
      const d = arr?.[0]; if (!d) throw new Error('no quote (check the CoinGecko id)');
      marketBody.innerHTML = quoteBreakdownHtml({
        name: d.name, price: d.current_price, pct: d.price_change_percentage_24h ?? 0, basis: '24h',
        rows: [['24h High', fmtPrice(d.high_24h)], ['24h Low', fmtPrice(d.low_24h)], ['Market Cap', '$' + (d.market_cap || 0).toLocaleString()], ['Rank', d.market_cap_rank ? '#' + d.market_cap_rank : '']]
      });
      marketLinks.innerHTML = marketLinksHtml([
        ['CoinGecko', `https://www.coingecko.com/en/coins/${encodeURIComponent(sym.toLowerCase())}`],
        ['Google News', `https://news.google.com/search?q=${encodeURIComponent(d.name + ' crypto')}`],
        ['CoinMarketCap', `https://coinmarketcap.com/currencies/${encodeURIComponent(sym.toLowerCase())}/`]
      ]);
    }
  } catch (e) {
    marketBody.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>` +
      (isStock ? `<p class="muted small">Stock quotes only resolve in the installed extension (host permission), not the localhost preview.</p>` : '');
  }
  // Watchlist toggle + AI take — always available, even if the quote fetch failed.
  const inList = (await getMarketSymbols()).some(s => s.toLowerCase() === sym.toLowerCase());
  marketLinks.insertAdjacentHTML('beforeend', `<button id="market-wl" class="btn-tonal btn-sm">${inList ? '★ remove from watchlist' : '☆ add to watchlist'}</button>`);
  document.getElementById('market-wl').addEventListener('click', async () => {
    let s = await getMarketSymbols();
    const exists = s.some(x => x.toLowerCase() === sym.toLowerCase());
    s = exists ? s.filter(x => x.toLowerCase() !== sym.toLowerCase()) : [...s, sym];
    await saveMarketSymbols(s);
    renderMarkets(s); refreshMarkets(); renderTicker();
    openMarketModal(sym);
  });
  marketLinks.insertAdjacentHTML('beforeend', `<button id="market-ai" class="btn-text md-ai-btn">✦ ask claude for a quick take</button>`);
  document.getElementById('market-ai').addEventListener('click', () => marketAi(sym), { once: true });
}

async function marketAi(sym) {
  const label = sym.startsWith('$') ? sym.slice(1).toUpperCase() : sym;
  const box = document.createElement('div'); box.className = 'md-ai'; box.innerHTML = '<span class="ask-loading">thinking</span>';
  marketBody.appendChild(box);
  try {
    const out = await callClaude(
      `Give a brief, neutral overview of ${label} (${sym.startsWith('$') ? 'publicly traded stock' : 'cryptocurrency'}): what the company/asset is and the major themes or catalysts associated with it. 3-4 sentences. You don't have live prices. General information only, not financial advice.`,
      { maxTokens: 260 });
    box.innerHTML = mdToHtml(out);
  } catch (e) { box.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`; }
}
async function addMarket() {
  const sym = marketSymbolEl.value.trim(); if (!sym) return;
  const s = await getMarketSymbols(); s.push(sym); await saveMarketSymbols(s);
  renderMarkets(s); marketSymbolEl.value = ''; refreshMarkets(); renderTicker();
}
document.getElementById('market-add').addEventListener('click', addMarket);
marketSymbolEl.addEventListener('keydown', e => { if (e.key === 'Enter') addMarket(); });
document.getElementById('markets-refresh').addEventListener('click', refreshMarkets);
