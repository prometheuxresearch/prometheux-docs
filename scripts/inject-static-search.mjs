#!/usr/bin/env node
// Post-processes the Mintlify export in ./build:
//   1. Copies repo-local assets/ into build/assets/
//   2. Injects <link>/<script> tags pointing to those assets into <head> of
//      every static HTML page.
// The overlay (static-search.js) intercepts the Mintlify search button
// and Cmd+K shortcut to show a local Pagefind UI instead.

import { readdirSync, statSync, readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const buildDir = resolve(process.argv[2] || 'build');
const assetsSrc = resolve('assets');

if (!existsSync(buildDir)) {
  console.error(`Build directory not found: ${buildDir}`);
  process.exit(1);
}
if (!existsSync(assetsSrc)) {
  console.error(`Assets directory not found: ${assetsSrc}`);
  process.exit(1);
}

const INJECT = `<link rel="stylesheet" href="/assets/static-search.css"><script src="/assets/static-search.js" defer></script>`;
// We mark the injection so a second run is a no-op.
const SENTINEL = 'data-px-search="1"';
const INJECT_TAGGED = INJECT.replace('<link', `<link ${SENTINEL}`);

const SKIP_DIRS = new Set(['_next', 'pagefind', 'assets']);
let injected = 0;
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (p.endsWith('.html')) {
      scanned += 1;
      const html = readFileSync(p, 'utf8');
      if (html.includes(SENTINEL)) continue;
      const i = html.indexOf('</head>');
      if (i < 0) continue;
      writeFileSync(p, html.slice(0, i) + INJECT_TAGGED + html.slice(i));
      injected += 1;
    }
  }
}

cpSync(assetsSrc, join(buildDir, 'assets'), { recursive: true });
walk(buildDir);
console.log(`Injected static-search overlay into ${injected}/${scanned} HTML pages.`);
