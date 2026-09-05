import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const ignored = new Set(["node_modules", ".next", ".git", "test-results", "artifacts", "playwright-report"]);
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.name.endsWith(".md")) files.push(file);
  }
  return files;
}
const files = await walk(root), failures = [];
let links = 0;
for (const file of files) {
  const source = (await readFile(file, "utf8")).replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
  // Inline Markdown/image links plus reference link definitions. Code fences are examples.
  const targets = [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
  targets.push(...[...source.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map(m => m[1]));
  for (const target of targets) {
    let href = target.trim().replace(/^<([^>]+)>.*$/, "$1").split(/\s+["']/)[0];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{\{)/i.test(href)) continue;
    href = decodeURIComponent(href.split(/[?#]/)[0]);
    if (!href) continue;
    links++;
    try { await access(path.resolve(path.dirname(file), href)); }
    catch { failures.push(`${path.relative(root, file)} -> ${href}`); }
  }
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!relative.startsWith("docs/archive/") && relative !== "docs/TZ_TutorGate_bugfixes_007.md") {
    if (source.includes("Актуальные правила schedule upgrade 006")) failures.push(`${relative}: duplicated legacy rules block`);
    if (/TutorGate_(?:MVP|Schedule)_TZ\.md/.test(source)) failures.push(`${relative}: missing legacy specification reference`);
  }
}
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log(`PASS: ${files.length} Markdown files, ${links} relative links; no broken links or duplicated active upgrade blocks.`);
