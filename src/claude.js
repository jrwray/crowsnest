import { SETTINGS } from './settings.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE (Anthropic Messages API, direct browser access)
// ─────────────────────────────────────────────────────────────────────────────

export async function callClaude(prompt, { system, maxTokens = 500 } = {}) {
  if (!SETTINGS.anthropicKey) {
    throw new Error('No Anthropic key set — add one via the gear (Settings).');
  }
  const body = {
    model: SETTINGS.anthropicModel || 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  };
  if (system) body.system = system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': SETTINGS.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e?.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('').trim();
}
