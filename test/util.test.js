import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, mdToHtml, timeAgo } from '../src/util.js';

test('esc escapes HTML special characters', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('mdToHtml renders basic formatting', () => {
  assert.equal(mdToHtml('**bold** and *em* and `code`'), '<p><strong>bold</strong> and <em>em</em> and <code>code</code></p>');
  assert.equal(mdToHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(mdToHtml('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(mdToHtml('# Title'), '<h4>Title</h4>');
});

test('mdToHtml escapes raw HTML from the model', () => {
  const html = mdToHtml('<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('mdToHtml only links http(s) URLs', () => {
  assert.match(mdToHtml('[ok](https://example.com)'), /<a href="https:\/\/example\.com"/);
  assert.ok(!mdToHtml('[bad](javascript:alert(1))').includes('<a'));
});

test('timeAgo picks the right unit', () => {
  const now = Date.now();
  assert.equal(timeAgo(now - 30 * 1000), '30s');
  assert.equal(timeAgo(now - 5 * 60 * 1000), '5m');
  assert.equal(timeAgo(now - 3 * 3600 * 1000), '3h');
  assert.equal(timeAgo(now - 2 * 86400 * 1000), '2d');
});
