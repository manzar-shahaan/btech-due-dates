// btech-due-dates Worker — serves the sanitized public due-dates page.
//
// Content is bundled at deploy time from the repo root:
//   - due-dates.md -> the current semester's page (always the current semester)
//   - semester.yml -> title / term / last-updated metadata
// Workers Builds rebuilds on every push to main, so editing those two files
// and pushing is all it takes to update the live site.

import { marked } from "marked";
import dueDatesMarkdown from "../due-dates.md";
import semesterYml from "../semester.yml";

marked.use({ gfm: true, async: false });

const SOURCE_URL = "https://github.com/manzar-shahaan/btech-due-dates";

// --- semester.yml -----------------------------------------------------------

/**
 * Minimal parser for the flat semester.yml schema used by this repo
 * (term / title / updated strings plus a simple `courses:` list).
 * Deliberately tiny — the file format is controlled by the weekly
 * update workflow in the README.
 */
function parseSemesterYml(raw) {
  const meta = { term: "", title: "", updated: "", courses: [] };
  let inCourses = false;
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (inCourses) {
      const item = trimmed.match(/^-\s+(.*)$/);
      if (item) {
        meta.courses.push(item[1].trim());
        continue;
      }
      inCourses = false;
    }
    const kv = trimmed.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (key === "courses") {
      if (value === "") {
        inCourses = true;
      } else {
        meta.courses = value
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (key in meta && key !== "courses") {
      meta[key] = value;
    }
  }
  return meta;
}

const meta = parseSemesterYml(semesterYml);

// --- rendering ----------------------------------------------------------------

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }
    )[ch]
  );
}

function renderBody() {
  let html = marked.parse(dueDatesMarkdown);
  // Wrap tables so they can scroll horizontally on narrow screens.
  html = html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return html;
}

const STYLES = `
:root {
  --bg: #f4f5f7; --panel: #ffffff; --text: #1c2024; --muted: #5b636b;
  --border: #d8dde2; --accent: #b35400; --link: #0b57cf; --th-bg: #eaeef1;
  --zebra: rgba(0, 0, 0, 0.035);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101214; --panel: #181a1d; --text: #e6e8ea; --muted: #9aa1a8;
    --border: #2c3034; --accent: #ff9f45; --link: #7ab3ff; --th-bg: #202428;
    --zebra: rgba(255, 255, 255, 0.035);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6; -webkit-text-size-adjust: 100%;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 16px 20px 56px; }
.topbar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  display: inline-block; padding: 3px 12px; border: 1px solid var(--border);
  border-radius: 999px; background: var(--panel); font-size: 13px; color: var(--muted);
}
.chip.link { color: var(--link); text-decoration: none; }
.chip.link:hover { text-decoration: underline; }
h1 { font-size: 1.55rem; line-height: 1.3; margin: 1.1em 0 0.6em; }
h2 { font-size: 1.2rem; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin: 2.2em 0 0.8em; }
h3 { font-size: 1.02rem; margin: 1.6em 0 0.5em; }
p { margin: 0.7em 0; }
a { color: var(--link); }
blockquote {
  margin: 1.2em 0; padding: 10px 16px; border-left: 4px solid var(--accent);
  border-radius: 6px; background: var(--panel); color: var(--muted); font-size: 0.95em;
}
blockquote p { margin: 0.3em 0; }
.table-wrap {
  overflow-x: auto; margin: 1em 0; border: 1px solid var(--border);
  border-radius: 8px; background: var(--panel);
}
table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
th {
  text-align: left; background: var(--th-bg); padding: 8px 12px;
  border-bottom: 1px solid var(--border); white-space: nowrap;
}
td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:nth-child(even) { background: var(--zebra); }
tbody tr:last-child td { border-bottom: none; }
code {
  background: var(--th-bg); border-radius: 4px; padding: 2px 6px;
  font-size: 0.88em;
}
hr { border: none; border-top: 1px solid var(--border); margin: 2.4em 0; }
ul { padding-left: 1.4em; }
footer { color: var(--muted); font-size: 0.85rem; margin-top: 3em; }
`;

function pageHtml() {
  const title = escapeHtml(meta.title || "Due Dates");
  const term = meta.term ? escapeHtml(meta.term) : "";
  const updated = meta.updated ? escapeHtml(meta.updated) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="Unofficial per-semester due-dates study aid for BTech classmates.">
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
<div class="topbar">
  <div class="chips">
    ${term ? `<span class="chip">${term}</span>` : ""}
    ${updated ? `<span class="chip">Updated ${updated}</span>` : ""}
  </div>
  <div class="chips">
    <a class="chip link" href="/raw">Raw markdown</a>
    <a class="chip link" href="${SOURCE_URL}">Source on GitHub</a>
  </div>
</div>
${renderBody()}
<footer>Unofficial study aid — Brightspace and official college communications are always authoritative. Served by a Cloudflare Worker.</footer>
</div>
</body>
</html>`;
}

const PAGE_HTML = pageHtml();

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Not found</title>
<style>${STYLES}</style></head>
<body><div class="wrap"><h1>404 — not found</h1>
<p><a href="/">Back to the current due-dates page</a></p></div></body></html>`;

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
};

const RAW_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  "cache-control": "public, max-age=300",
};

// --- worker --------------------------------------------------------------------

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const { pathname } = new URL(request.url);

    switch (pathname) {
      case "/":
      case "/index.html":
        return new Response(PAGE_HTML, { headers: HTML_HEADERS });
      case "/raw":
      case "/due-dates.md":
        return new Response(dueDatesMarkdown, { headers: RAW_HEADERS });
      case "/health":
        return new Response("ok\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      default:
        return new Response(NOT_FOUND_HTML, { status: 404, headers: HTML_HEADERS });
    }
  },
};
