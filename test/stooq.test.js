import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStooqQuote, stooqTicker } from '../src/stooq.js';

test('stooqTicker adds .us only to bare tickers', () => {
  assert.equal(stooqTicker('$NVDA'), 'nvda.us');
  assert.equal(stooqTicker('$BMW.DE'), 'bmw.de');
});

test('change is measured against the previous close when present', () => {
  const q = parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close,Volume,Prev,Name\nNVDA.US,2026-10-14,22:00:00,105,112,99,110,1000,100,"NVIDIA CORP"\n');
  assert.equal(q.basis, 'prev');
  assert.equal(q.prevClose, 100);
  assert.equal(q.pct.toFixed(2), '10.00');
  assert.equal(q.name, 'NVIDIA CORP');
});

test('falls back to the open when there is no previous close', () => {
  const q = parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close\nNVDA.US,2026-10-14,22:00:00,100,112,99,110\n');
  assert.equal(q.basis, 'open');
  assert.equal(q.pct.toFixed(2), '10.00');
});

test('names containing commas survive', () => {
  const q = parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close,Volume,Prev,Name\nX.US,2026-10-14,22:00:00,1,1,1,2,5,1,"ACME, INC"\n');
  assert.equal(q.name, 'ACME, INC');
});

test('unknown symbols throw a helpful error', () => {
  assert.throws(() => parseStooqQuote('Symbol,Date,Time,Open,High,Low,Close\nZZZZ.US,N/D,N/D,N/D,N/D,N/D,N/D\n'), /no quote/);
});
