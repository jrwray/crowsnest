const browser = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', location: 'readonly',
  fetch: 'readonly', console: 'readonly', performance: 'readonly', AbortController: 'readonly', URL: 'readonly',
  Blob: 'readonly', Event: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  chrome: 'readonly',
};
const rules = { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-import-assign': 'error' };

export default [
  { ignores: ['vendor/**'] },
  { files: ['src/**/*.js', 'test/**/*.js', '*.mjs'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...browser, Quill: 'readonly' } }, rules },
  { files: ['background.js', 'maps-content.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: browser }, rules },
];
