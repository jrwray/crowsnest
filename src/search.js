import { callClaude } from './claude.js';
import { esc, mdToHtml } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH — modes incl. AI "ask"
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_ROUTES = {
  search:   q => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  dev:      q => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
  chat:     q => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
  research: q => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`
};
const PLACEHOLDERS = {
  search: 'type a query…', dev: 'search repositories…', chat: 'start a chat…',
  research: 'research a topic…', ask: 'ask claude anything…'
};
let currentMode = 'search';
const searchEl = document.getElementById('search');
const searchSpinner = document.getElementById('search-spinner');
const askAnswerEl = document.getElementById('ask-answer');

document.getElementById('mode-chips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  currentMode = chip.dataset.mode;
  searchEl.placeholder = PLACEHOLDERS[currentMode] || 'type a query…';
  askAnswerEl.classList.toggle('hidden', currentMode !== 'ask' || !askAnswerEl.textContent);
  searchEl.focus();
});

async function runAsk(q) {
  askAnswerEl.classList.remove('hidden');
  askAnswerEl.innerHTML = '<span class="ask-loading">querying claude…</span>';
  searchSpinner.classList.remove('hidden');
  try {
    const answer = await callClaude(q, {
      system: 'You are a concise assistant embedded in a browser new-tab page. Answer directly in 1-4 short paragraphs.',
      maxTokens: 700
    });
    askAnswerEl.innerHTML = answer ? mdToHtml(answer) : '(no answer)';
  } catch (e) {
    askAnswerEl.innerHTML = `<span class="ask-error">⚠ ${esc(e.message)}</span>`;
  } finally {
    searchSpinner.classList.add('hidden');
  }
}

searchEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (!q) return;
  if (currentMode === 'ask') { runAsk(q); return; }
  window.location.href = (SEARCH_ROUTES[currentMode] ?? SEARCH_ROUTES.search)(q);
});
