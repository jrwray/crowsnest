#!/usr/bin/env bash
# Build the GitHub Pages demo: the extension's files as a plain web page, plus a banner.
# Storage falls back to localStorage outside the extension, so no other changes are needed.
set -euo pipefail
out="${1:-_site}"
rm -rf "$out" && mkdir -p "$out"
cp -r index.html styles.css src vendor docs "$out"/
[ -d icons ] && cp -r icons "$out"/
python3 - "$out/index.html" demo/banner.html <<'PY'
import sys
page, banner = sys.argv[1], open(sys.argv[2]).read()
html = open(page).read()
marker = '<body class="theme-dark">'
assert marker in html, 'body tag changed; update tools/build-site.sh'
html = html.replace(marker, marker + '\n' + banner, 1)
html = html.replace('<title>Crowsnest</title>', '<title>Crowsnest demo</title>', 1)
open(page, 'w').write(html)
PY
echo "Built demo site in $out"
