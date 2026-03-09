/**
 * sync-pages.js
 * Runs on every push via GitHub Actions.
 * Scans for .html files, adds NEW ones to pages.json,
 * removes entries whose files no longer exist.
 * Existing entries (with custom title/desc/category) are PRESERVED.
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const PAGES_FILE = path.join(ROOT, 'pages.json');
const BASE_URL   = 'https://tinyimprove-rgb.github.io/probability/';

const SKIP_FILES = new Set(['index.html', 'admin.html']);
const SKIP_DIRS  = new Set(['.git', 'node_modules', '.github', 'scripts']);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function findHtmlFiles(dir, base = ROOT) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel  = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) results = results.concat(findHtmlFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith('.html') && !SKIP_FILES.has(entry.name)) {
      results.push(rel);
    }
  }
  return results;
}

function titleFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const m = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
  } catch (_) {}
  return path.basename(filePath, '.html')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function descFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const m = content.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
           || content.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (m) return m[1].trim();
  } catch (_) {}
  return '';
}

// ── Load existing pages.json ──────────────────────────────────────────────────
let existing = [];
try { existing = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8')); } catch (_) {}

// ── Scan disk for html files ──────────────────────────────────────────────────
const found = findHtmlFiles(ROOT);

// Build lookup by filename
const existingByFile = {};
for (const p of existing) existingByFile[p.filename] = p;

const today = new Date().toISOString().slice(0, 10);

// ── Merge: add new, keep existing, remove deleted ─────────────────────────────
const updated = [];

for (const rel of found) {
  const filename = rel; // e.g. "bayes.html" or "chapters/clt.html"
  const absPath  = path.join(ROOT, rel);

  if (existingByFile[filename]) {
    // Already tracked — keep user edits intact
    updated.push(existingByFile[filename]);
  } else {
    // NEW file — auto-create entry
    const title = titleFromFile(absPath);
    const desc  = descFromFile(absPath);
    updated.push({
      id:       uid(),
      title,
      desc,
      url:      BASE_URL + filename,
      filename,
      category: 'Uncategorized',
      added:    today,
      autoAdded: true,
    });
    console.log(`  ➕ Added: ${filename} → "${title}"`);
  }
}

// Report removed files
for (const p of existing) {
  if (!found.includes(p.filename)) {
    console.log(`  ➖ Removed (file deleted): ${p.filename}`);
  }
}

// Sort by date added then title
updated.sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.title.localeCompare(b.title));

fs.writeFileSync(PAGES_FILE, JSON.stringify(updated, null, 2), 'utf8');
console.log(`✅ pages.json updated — ${updated.length} page(s) total.`);
