// Dynamic HTML rendering. The page is rebuilt per request around "today"
// (America/Toronto): upcoming items first with countdowns, stale rows folded
// into a collapsed Past section, and calendar buttons everywhere.
//
// Course filtering + sorting run client-side: every event row carries
// data-course / data-orig / data-wt attributes, and inline JS toggles
// visibility and re-orders rows. The calendar modal builds its subscribe
// URLs from whatever courses are currently enabled, matching the
// server-side ?courses= whitelist on /calendar.ics.

import { marked } from "marked";
import { eventUid } from "./ics.js";

marked.use({ gfm: true, async: false });

const SOURCE_URL = "https://github.com/manzar-shahaan/btech-due-dates";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

/** Minimal inline markdown (bold/italic/code) after HTML-escaping. */
function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function mdBlock(lines) {
  return marked.parse(Array.isArray(lines) ? lines.join("\n") : lines);
}

/** Wrap markdown tables for horizontal scrolling on narrow screens. */
function wrapTables(html) {
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
}

/** Tag markdown-rendered table rows whose first cell is a course code, so the
 *  client-side course filter hides them in the prose tables too (Unscheduled,
 *  weight audit). */
function tagCourseRows(html) {
  return html.replace(/<tr>\s*<td>([A-Z]{3}\d{4})<\/td>/g, '<tr data-course="$1"><td>$1</td>');
}

function daysUntil(iso, today) {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function countdown(days) {
  if (days <= 0) return '<span class="count today">TODAY</span>';
  if (days === 1) return '<span class="count soon">TOMORROW</span>';
  if (days <= 7) return `<span class="count soon">in ${days} days</span>`;
  if (days <= 45) return `<span class="count">in ${days} days</span>`;
  return `<span class="count">in ${Math.ceil(days / 7)} wks</span>`;
}

/** Format the semester.yml "updated" stamp for the header chip:
 *  "2026-10-14" -> "Oct 14, 2026" · "2026-10-14 21:08" -> "Oct 14, 2026, 9:08 PM ET".
 *  Anything unparseable is shown as-is. */
function formatUpdated(value) {
  const raw = String(value);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!m) return raw;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return raw;
  let out = `${MONTH_NAMES[month - 1]} ${day}, ${m[1]}`;
  if (m[4] !== undefined) {
    let h = Number(m[4]);
    if (h < 0 || h > 23 || Number(m[5]) > 59) return raw;
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    out += `, ${h}:${m[5]} ${ampm} ET`;
  }
  return out;
}

function eventKey(e) {
  return e.parsed ? e.parsed.start + (e.parsed.time || "00:00") : "9999-99-99";
}

/** First number in the Wt cell — the sort key for "by weight". "" if none. */
function weightValue(wt) {
  const m = String(wt || "").match(/\d+(?:\.\d+)?/);
  return m ? m[0] : "";
}

function eventRows(events, today, term, withCountdown) {
  return events
    .map((e, i) => {
      const p = e.parsed;
      const days = p ? daysUntil(p.start, today) : null;
      const urgent = withCountdown && days !== null && days <= 3;
      const cal = p
        ? `<a class="ical" href="/calendar.ics?id=${eventUid(e, term)}" title="Add this event to your calendar">📅</a>`
        : "";
      return [
        `<tr${urgent ? ' class="urgent"' : ""} data-course="${escapeHtml(e.course)}" data-orig="${i}" data-wt="${weightValue(e.wt)}">`,
        `<td class="due">${inlineMd(e.due)}${withCountdown && p ? countdown(days) : ""}</td>`,
        `<td class="course">${e.course === "—" ? '<span class="muted">—</span>' : escapeHtml(e.course)}</td>`,
        `<td>${inlineMd(e.item)}</td>`,
        `<td class="wt">${inlineMd(e.wt)}</td>`,
        `<td class="notes">${inlineMd(e.notes)}</td>`,
        `<td class="cal">${cal}</td>`,
        "</tr>",
      ].join("");
    })
    .join("\n");
}

const TABLE_HEAD = "<thead><tr><th>Due</th><th>Course</th><th>Item</th><th>Wt</th><th>Notes</th><th></th></tr></thead>";

function eventsTable(events, today, term, withCountdown, tbodyId) {
  return `<div class="table-wrap"><table>${TABLE_HEAD}<tbody id="${tbodyId}">${eventRows(events, today, term, withCountdown)}</tbody></table></div>`;
}

/** Split rows into upcoming/past by date. Rows past in the file but whose
 *  date has passed (or vice versa) are re-filed, so the page stays truthful
 *  even if due-dates.md is a few days stale. */
function splitEvents(parsed, today) {
  const upcoming = { dated: [], undated: [] };
  const past = { dated: [], undated: [] };
  for (const e of parsed.past) {
    if (!e.parsed) past.undated.push(e);
    else if (e.parsed.start < today) past.dated.push(e);
    else upcoming.dated.push(e);
  }
  for (const e of parsed.upcoming) {
    if (!e.parsed) upcoming.undated.push(e);
    else if (e.parsed.start < today) past.dated.push(e);
    else upcoming.dated.push(e);
  }
  upcoming.dated.sort((a, b) => (eventKey(a) < eventKey(b) ? -1 : eventKey(a) > eventKey(b) ? 1 : 0));
  past.dated.sort((a, b) => (eventKey(a) > eventKey(b) ? -1 : eventKey(a) < eventKey(b) ? 1 : 0));
  return { upcoming, past };
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
.chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chip {
  display: inline-block; padding: 3px 12px; border: 1px solid var(--border);
  border-radius: 999px; background: var(--panel); font-size: 13px; color: var(--muted);
}
.chip.link { color: var(--link); text-decoration: none; }
.chip.link:hover { text-decoration: underline; }
.btn {
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
  padding: 5px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; text-decoration: none; display: inline-block; font-family: inherit;
}
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover { filter: brightness(1.08); color: #fff; }
.filters {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--panel);
}
.flabel { color: var(--muted); font-size: 13px; font-weight: 600; }
.fchip {
  border: 1px solid var(--border); background: var(--panel); color: var(--muted);
  padding: 3px 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
  font-family: inherit; opacity: 0.6;
}
.fchip.on {
  border-color: var(--accent); color: var(--accent); font-weight: 700;
  background: var(--th-bg); opacity: 1;
}
#sortsel {
  border: 1px solid var(--border); background: var(--panel); color: var(--text);
  border-radius: 8px; padding: 4px 8px; font-size: 13px; font-family: inherit;
}
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
th { text-align: left; background: var(--th-bg); padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:nth-child(even) { background: var(--zebra); }
tbody tr:last-child td { border-bottom: none; }
tr.urgent td:first-child { border-left: 3px solid var(--accent); }
.due { white-space: nowrap; }
.count {
  display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.02em; padding: 1px 8px; border-radius: 999px;
  background: var(--th-bg); color: var(--muted); vertical-align: middle;
}
.count.today { background: #d93025; color: #fff; }
.count.soon { background: var(--accent); color: #fff; }
.ical { text-decoration: none; font-size: 14px; opacity: 0.5; }
.ical:hover { opacity: 1; }
.muted { color: var(--muted); }
code { background: var(--th-bg); border-radius: 4px; padding: 2px 6px; font-size: 0.88em; }
hr { border: none; border-top: 1px solid var(--border); margin: 2.4em 0; }
ul { padding-left: 1.4em; }
details.past {
  margin: 1.6em 0; border: 1px solid var(--border); border-radius: 8px;
  background: var(--panel); padding: 0 14px;
}
details.past summary { cursor: pointer; padding: 10px 0; font-weight: 600; color: var(--muted); }
details.past[open] summary { border-bottom: 1px solid var(--border); margin-bottom: 8px; }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10;
}
[hidden] { display: none !important; }
.modal {
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  max-width: 600px; width: 100%; padding: 18px 20px; max-height: 85vh; overflow: auto;
}
.copyrow { display: flex; gap: 8px; align-items: stretch; margin: 0.6em 0; }
.copyrow code { flex: 1; overflow-wrap: anywhere; font-size: 12px; padding: 6px 8px; user-select: all; }
.hint { color: var(--muted); font-size: 0.85rem; }
.modal-actions { margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px; }
footer { color: var(--muted); font-size: 0.85rem; margin-top: 3em; }
`;

// Client-side filtering + sorting. Plain ES5, string concatenation only —
// this is embedded in a template literal, so no backticks / ${} in here.
const SCRIPT = `
(function () {
  var modal = document.getElementById("cal-modal");
  var chips = [].slice.call(document.querySelectorAll("[data-fcourse]"));
  var sortSel = document.getElementById("sortsel");
  var countEl = document.getElementById("upcoming-count");
  var pastCountEl = document.getElementById("past-count");
  var emptyEl = document.getElementById("filter-empty");
  var LS_KEY = "btdd-filters-v1";
  var ALL = [];
  var enabled = {};
  chips.forEach(function (c) {
    var code = c.getAttribute("data-fcourse");
    ALL.push(code);
    enabled[code] = true;
  });

  function normalizeList(raw) {
    if (raw === null || raw === undefined) return null;
    var list = String(raw).split(",").map(function (s) {
      return s.trim().toUpperCase();
    }).filter(function (s) {
      return s && ALL.indexOf(s) >= 0;
    });
    return list.length ? list : null;
  }

  function restoreState() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { saved = null; }
    var list = null;
    try { list = normalizeList(new URL(location.href).searchParams.get("courses")); } catch (e) {}
    if (!list && saved && saved.courses) list = normalizeList(saved.courses.join(","));
    if (list && list.length < ALL.length) {
      ALL.forEach(function (c) { enabled[c] = list.indexOf(c) >= 0; });
    }
    var sort = saved && saved.sort ? saved.sort : "date";
    var opt = sortSel.querySelector('option[value="' + sort + '"]');
    if (opt) sortSel.value = sort;
  }

  function enabledList() {
    return ALL.filter(function (c) { return enabled[c]; });
  }

  function visibleRows(tbody) {
    var n = 0;
    [].slice.call(tbody.rows).forEach(function (tr) {
      if (tr.style.display !== "none") n++;
    });
    return n;
  }

  function applyFilters() {
    chips.forEach(function (c) {
      c.classList.toggle("on", !!enabled[c.getAttribute("data-fcourse")]);
    });
    [].slice.call(document.querySelectorAll("tr[data-course]")).forEach(function (tr) {
      var c = tr.getAttribute("data-course");
      tr.style.display = c === "—" || enabled[c] ? "" : "none";
    });
    var up = document.getElementById("upcoming-body");
    var vis = up ? visibleRows(up) : 0;
    if (countEl) countEl.textContent = vis + (vis === 1 ? " item" : " items");
    if (emptyEl) emptyEl.hidden = vis !== 0;
    var pb = document.getElementById("past-body");
    if (pastCountEl && pb) pastCountEl.textContent = String(visibleRows(pb));
    try { localStorage.setItem(LS_KEY, JSON.stringify({ courses: enabledList(), sort: sortSel.value })); } catch (e) {}
    var on = enabledList();
    // Manual query string so commas stay readable (URLSearchParams would %2C them).
    var qs = on.length && on.length !== ALL.length ? "?courses=" + on.join(",") : "";
    history.replaceState(null, "", location.pathname + qs + location.hash);
  }

  function rowWeight(tr) {
    var w = parseFloat(tr.getAttribute("data-wt"));
    return isFinite(w) ? w : -1;
  }

  function sortTables() {
    var mode = sortSel.value;
    ["upcoming-body", "past-body"].forEach(function (id) {
      var tbody = document.getElementById(id);
      if (!tbody) return;
      var rows = [].slice.call(tbody.rows);
      rows.sort(function (a, b) {
        var oa = Number(a.getAttribute("data-orig"));
        var ob = Number(b.getAttribute("data-orig"));
        if (mode === "course") {
          var ca = a.getAttribute("data-course") || "";
          var cb = b.getAttribute("data-course") || "";
          if (ca !== cb) return ca < cb ? -1 : 1;
          return oa - ob;
        }
        if (mode === "weight-hi" || mode === "weight-lo") {
          var d = rowWeight(b) - rowWeight(a);
          if (mode === "weight-lo") d = -d;
          if (d !== 0) return d;
          return oa - ob;
        }
        return oa - ob;
      });
      rows.forEach(function (tr) { tbody.appendChild(tr); });
    });
  }

  function onChange() {
    applyFilters();
    sortTables();
  }

  function feedQuery() {
    var on = enabledList();
    if (!on.length || on.length === ALL.length) return "";
    return "?courses=" + on.join(",");
  }

  function openModal() {
    var query = feedQuery();
    var icsHttps = "https://" + location.host + "/calendar.ics" + query;
    document.getElementById("cal-url").textContent = "webcal://" + location.host + "/calendar.ics" + query;
    document.getElementById("cal-url-https").textContent = icsHttps;
    var g = document.getElementById("gcal-add");
    if (g) g.href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(icsHttps);
    var dl = document.getElementById("ics-download");
    if (dl) dl.href = "/calendar.ics" + (query ? query + "&download=1" : "?download=1");
    modal.hidden = false;
  }

  function closeModal() { modal.hidden = true; }

  if (modal) {
    document.querySelectorAll("[data-open-cal]").forEach(function (b) {
      b.addEventListener("click", openModal);
    });
    document.querySelectorAll("[data-close-modal]").forEach(function (b) {
      b.addEventListener("click", closeModal);
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var el = document.getElementById(b.getAttribute("data-copy"));
        var text = el.textContent;
        function done() {
          b.textContent = "Copied ✓";
          setTimeout(function () { b.textContent = "Copy"; }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var range = document.createRange();
          range.selectNodeContents(el);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          done();
        }
      });
    });
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var code = c.getAttribute("data-fcourse");
      enabled[code] = !enabled[code];
      onChange();
    });
  });
  document.querySelectorAll("[data-fall]").forEach(function (b) {
    b.addEventListener("click", function () {
      ALL.forEach(function (c) { enabled[c] = true; });
      onChange();
    });
  });
  document.querySelectorAll("[data-fnone]").forEach(function (b) {
    b.addEventListener("click", function () {
      ALL.forEach(function (c) { enabled[c] = false; });
      onChange();
    });
  });
  if (sortSel) sortSel.addEventListener("change", onChange);

  restoreState();
  onChange();
})();
`;

const MODAL = `
<div class="modal-backdrop" id="cal-modal" hidden>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cal-title">
    <h2 id="cal-title">Add to your calendar</h2>
    <p class="muted">One subscription covers every dated upcoming item (est. dates marked) <strong>for the courses currently enabled on this page</strong> — use the course filter chips to include only what you're taking. It refreshes automatically whenever this page updates — no re-adding needed.</p>
    <h3>Apple Calendar &amp; Outlook — subscribe once</h3>
    <p><strong>Apple Calendar</strong>: File → New Calendar Subscription → paste this URL.<br>
    <strong>Outlook (web)</strong>: Add calendar → Subscribe from web → same URL.</p>
    <div class="copyrow">
      <code id="cal-url">webcal://…/calendar.ics</code>
      <button class="btn" type="button" data-copy="cal-url">Copy</button>
    </div>
    <p class="hint">If an app rejects <code>webcal://</code>, use the https form: <code id="cal-url-https">https://…/calendar.ics</code></p>
    <h3>Google Calendar</h3>
    <a class="btn primary" id="gcal-add" href="#" rel="noopener">Add to Google Calendar</a>
    <p class="hint">One click while logged in to Google. Or manually: Google Calendar (web) → Settings → Add calendar → <strong>From URL</strong> → paste the <strong>https</strong> link (Google rejects <code>webcal://</code>) → Add. It shows up under "Other calendars" and refreshes automatically — Google re-checks the feed roughly every 12–24 hours. (Subscribing works on the web version; the mobile app then displays it.)</p>
    <h3>Prefer an editable local copy?</h3>
    <p class="hint">Download and import (Settings → Import &amp; export) — an imported calendar is a static snapshot that won't auto-update.</p>
    <a class="btn" id="ics-download" href="/calendar.ics?download=1">Download .ics (upcoming only)</a>
    <div class="modal-actions">
      <button class="btn" type="button" data-close-modal>Close</button>
    </div>
  </div>
</div>`;

export function pageHtml({ meta, parsed, today }) {
  const term = meta.term || "";
  const { upcoming, past } = splitEvents(parsed, today);
  const upcomingAll = upcoming.dated.concat(upcoming.undated);
  const pastAll = past.dated.concat(past.undated);

  // Course chips: semester.yml order first, then any course only seen in events.
  const courseSet = new Set((meta.courses || []).filter(Boolean));
  for (const e of [...parsed.past, ...parsed.upcoming]) {
    if (e.course && e.course !== "—") courseSet.add(e.course);
  }
  const courses = [...courseSet];
  const filterBar = `<div class="filters" id="filters">
<span class="flabel">Show</span>
${courses.map((c) => `<button class="fchip on" type="button" data-fcourse="${escapeHtml(c)}" title="Toggle ${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("\n")}
<button class="btn" type="button" data-fall>All</button>
<button class="btn" type="button" data-fnone>None</button>
<span class="flabel">Sort</span>
<select id="sortsel" aria-label="Sort order">
<option value="date">By date</option>
<option value="course">By course</option>
<option value="weight-hi">Weight: high → low</option>
<option value="weight-lo">Weight: low → high</option>
</select>
</div>`;

  const upcomingHtml = `<section id="upcoming">
<h2>Upcoming <span class="chip" id="upcoming-count">${upcomingAll.length} item${upcomingAll.length === 1 ? "" : "s"}</span></h2>
${
  upcomingAll.length
    ? eventsTable(upcomingAll, today, term, true, "upcoming-body")
    : '<p class="muted">Nothing dated ahead — check "Unscheduled / Ongoing" below.</p>'
}
<p class="muted" id="filter-empty" hidden>No items match the current filters — enable a course above.</p>
</section>`;

  const pastHtml = `<details class="past">
<summary>Past deadlines (<span id="past-count">${pastAll.length}</span>)</summary>
${eventsTable(pastAll, today, term, false, "past-body")}
</details>`;

  const othersHtml = parsed.others
    .map((s) => `<section><h2>${escapeHtml(s.title)}</h2>${tagCourseRows(wrapTables(mdBlock(s.lines)))}</section>`)
    .join("\n");

  const title = escapeHtml(meta.title || "Due Dates");
  const updated = meta.updated ? escapeHtml(formatUpdated(meta.updated)) : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<meta name="description" content="Unofficial per-semester due-dates study aid for BTech classmates.">
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
<div class="topbar">
  <div class="chips">
    ${term ? `<span class="chip">${escapeHtml(term)}</span>` : ""}
    ${updated ? `<span class="chip">Updated ${updated}</span>` : ""}
  </div>
  <div class="chips">
    <button class="btn primary" type="button" data-open-cal>📅 Add to calendar</button>
    <a class="chip link" href="/raw">Raw markdown</a>
    <a class="chip link" href="${SOURCE_URL}">Source on GitHub</a>
  </div>
</div>
${filterBar}
${wrapTables(mdBlock(parsed.intro))}
${upcomingHtml}
${pastHtml}
${wrapTables(mdBlock(parsed.preambleRest))}
${othersHtml}
<footer>Unofficial study aid — Brightspace and official college communications are always authoritative. Dates are Ottawa time (America/Toronto); entries without a time are all-day. Served by a Cloudflare Worker.</footer>
</div>
${MODAL}
<script>${SCRIPT}</script>
</body>
</html>`;
}

export const notFoundHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Not found</title>
<meta name="color-scheme" content="light dark">
<style>${STYLES}</style></head>
<body><div class="wrap"><h1>404 — not found</h1>
<p><a href="/">Back to the current due-dates page</a></p></div></body></html>`;
