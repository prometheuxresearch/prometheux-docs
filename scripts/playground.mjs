#!/usr/bin/env node
// Vadalog Playground links for the docs.
//
//   node scripts/playground.mjs extract <out.json>
//       Every ```prolog block that can run in the public playground (inline
//       facts and rules, an @output, nothing the playground refuses), with its
//       page, title, docs URL and a stable id.
//   node scripts/playground.mjs link <verified.json> [--base URL]
//       Put a "Run in the Playground" link under each block listed in
//       verified.json (the ids that ran on the engine), and remove stale ones.
//
// The link carries the program itself (#code/<lz-string>), so it keeps working
// whatever the playground's example list looks like.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DOCS_URL = "https://docs.prometheux.ai";
const PLAYGROUND = "https://www.prometheux.ai/playground";
const MARK = "{/* playground-link */}";
// An invisible anchor above each linked block, so the playground's "Open in
// docs" lands on the code itself: <page>#playground-<hash>.
const ANCHOR = "{/* playground-anchor */}";

// What the public playground refuses (px-engine-gateway playground mode).
const REFUSED = [
  /@\W*(bind|qbind|model|mapping|module|include|library|input|external|explain|chase|delete|update)\b/i,
  /\b(llm|embeddings)\W*:/i,
  /#\s*(?!(tc|paths|cc|wcc|sssp|asp|bfs|pr|dc|bc|tri)\b)[A-Za-z_]\w*\s*\(/i,
  /(<-|:-)[\s(]*(select|with|match)\b/i,
  /"\s*\(*\s*(select|with)\b/i,
  /\b(reflect|java_method|try_reflect)\W*\(/i,
  /\.\.\.|…/, // elided examples
  /<[a-z_ ]+>/i, // <placeholders>
];

function blocks(text) {
  const out = [];
  const re = /^([ \t]*)```prolog[^\n]*\n([\s\S]*?)^\1```[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    const indent = m[1];
    const code = m[2].split("\n").map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join("\n").trim();
    const heading = [...text.slice(0, m.index).matchAll(/^#{1,4}\s+(.+)$/gm)].pop()?.[1]?.replace(/[`*]/g, "").trim() ?? "";
    out.push({ code, start: m.index, end: m.index + m[0].length, indent, heading });
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const runnable = (code) => /@output\s*\(/.test(code) && /\.\s*$/m.test(code) && !REFUSED.some((r) => r.test(code));

// A block with its own facts and rules but no @output shows nothing when run:
// the playground version gets an @output for each rule head. The docs text
// stays as it is.
const HAS_FACT = /^[ \t]*[a-z][A-Za-z0-9_]*\([^)]*\)\s*\.[ \t]*(%.*)?$/m;
const RULE_HEAD = /^[ \t]*([a-z][A-Za-z0-9_]*)\s*\([^\n]*?(<-|:-)/gm;
function playable(code) {
  if (runnable(code)) return code;
  if (/@output\s*\(/.test(code) || !HAS_FACT.test(code)) return null;
  const heads = [...new Set([...code.matchAll(RULE_HEAD)].map((m) => m[1]))];
  if (!heads.length) return null;
  const withOutput = `${code}\n\n% Added by the playground: show what the rules derive.\n` +
    heads.map((h) => `@output("${h}").`).join("\n");
  return runnable(withOutput) ? withOutput : null;
}
const id = (page, code) => `${page}#${createHash("sha256").update(code).digest("hex").slice(0, 10)}`;
const titleOf = (text, page) => (/^title:\s*["']?(.+?)["']?\s*$/m.exec(text)?.[1] ?? page);
const pages = () => execSync("git ls-files '*.mdx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

async function extract(outPath) {
  const items = [];
  for (const page of pages()) {
    const text = await readFile(ROOT + page, "utf8");
    const slug = page.replace(/\.mdx$/, "");
    for (const b of blocks(text)) {
      const program = playable(b.code);
      if (!program) continue;
      items.push({ id: id(slug, b.code), page: slug, title: titleOf(text, slug), heading: b.heading,
                   url: `${DOCS_URL}/${slug}`, program: program + "\n", outputAdded: program !== b.code });
    }
  }
  await writeFile(outPath, JSON.stringify(items, null, 1));
  console.log(`${items.length} runnable blocks on ${new Set(items.map((i) => i.page)).size} pages → ${outPath}`);
}

async function link(verifiedPath, base) {
  const ok = new Set(JSON.parse(await readFile(verifiedPath, "utf8")));
  let added = 0, removed = 0, changedPages = 0;
  for (const page of pages()) {
    const path = ROOT + page;
    let text = await readFile(path, "utf8");
    // Drop old links first so the result doesn't depend on the previous run.
    const before = text;
    text = text.replace(new RegExp(`\\n\\n[ \\t]*${esc(MARK)}[^\\n]*`, "g"), () => { removed++; return ""; });
    text = text.replace(new RegExp(`[ \\t]*${esc(ANCHOR)}[^\\n]*\\n\\n`, "g"), "");
    const slug = page.replace(/\.mdx$/, "");
    for (const b of blocks(text).reverse()) { // from the end, so offsets stay valid
      if (!ok.has(id(slug, b.code))) continue;
      const href = `${base}#code/${compressToEncodedURIComponent(playable(b.code) + "\n")}`;
      const anchor = `${b.indent}${ANCHOR}<span id="playground-${id(slug, b.code).split("#")[1]}" style={{ display: "block", scrollMarginTop: "96px" }}></span>\n\n`;
      text = text.slice(0, b.start) + anchor + text.slice(b.start, b.end) +
        `\n\n${b.indent}${MARK}<a href="${href}" target="_blank" rel="noopener">▶ Run in the Playground</a>` + text.slice(b.end);
      added++;
    }
    if (text !== before) { await writeFile(path, text); changedPages++; }
  }
  console.log(`links: ${added} written (${removed} old removed) on ${changedPages} pages; base ${base}`);
}

const [cmd, arg, ...rest] = process.argv.slice(2);
if (cmd === "extract" && arg) await extract(arg);
else if (cmd === "link" && arg) {
  const i = rest.indexOf("--base");
  await link(arg, i >= 0 ? rest[i + 1] : PLAYGROUND);
} else {
  console.error("usage: playground.mjs extract <out.json> | link <verified.json> [--base URL]");
  process.exit(2);
}


// lz-string 1.5.0 compressToEncodedURIComponent (MIT, Pieroxy), the format the
// playground decodes. Inlined: this repo has no npm dependencies.
function compressToEncodedURIComponent(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
  return compress(input, 6, (a) => alphabet.charAt(a));
}
function compress(uncompressed, bitsPerChar, getCharFromInt) {
  let i, value, context_dictionary = {}, context_dictionaryToCreate = {}, context_c = "", context_wc = "", context_w = "",
    context_enlargeIn = 2, context_dictSize = 3, context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0;
  const push = (bit) => {
    context_data_val = (context_data_val << 1) | bit;
    if (context_data_position == bitsPerChar - 1) { context_data_position = 0; context_data.push(getCharFromInt(context_data_val)); context_data_val = 0; }
    else context_data_position++;
  };
  const pushBits = (n, v) => { for (let k = 0; k < n; k++) { push(v & 1); v >>= 1; } };
  const pushZeros = (n) => { for (let k = 0; k < n; k++) push(0); };
  const emitW = () => {
    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
      if (context_w.charCodeAt(0) < 256) { pushZeros(context_numBits); pushBits(8, context_w.charCodeAt(0)); }
      else { pushBits(context_numBits, 1); pushBits(16, context_w.charCodeAt(0)); }
      context_enlargeIn--;
      if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
      delete context_dictionaryToCreate[context_w];
    } else {
      pushBits(context_numBits, context_dictionary[context_w]);
    }
    context_enlargeIn--;
    if (context_enlargeIn == 0) { context_enlargeIn = Math.pow(2, context_numBits); context_numBits++; }
  };
  for (let ii = 0; ii < uncompressed.length; ii += 1) {
    context_c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
      context_dictionary[context_c] = context_dictSize++;
      context_dictionaryToCreate[context_c] = true;
    }
    context_wc = context_w + context_c;
    if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) context_w = context_wc;
    else {
      emitW();
      context_dictionary[context_wc] = context_dictSize++;
      context_w = String(context_c);
    }
  }
  if (context_w !== "") emitW();
  pushBits(context_numBits, 2);
  while (true) {
    context_data_val = context_data_val << 1;
    if (context_data_position == bitsPerChar - 1) { context_data.push(getCharFromInt(context_data_val)); break; }
    else context_data_position++;
  }
  return context_data.join("");
}

