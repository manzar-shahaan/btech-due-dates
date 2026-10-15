// Parsing for due-dates.md — turns the markdown tables into structured
// events the HTML renderer and the .ics calendar feed can work with.
// The file format is controlled by the weekly update workflow in the README:
// sections "## Past", "## Upcoming", "## Unscheduled / Ongoing", plus prose
// sections (weight audit, notes) that are rendered as-is.

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Minimal parser for the flat semester.yml schema (term/title/updated + courses list). */
export function parseSemesterYml(raw) {
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

/** e.g. "2026-Fall" -> 2026. */
export function yearFromTerm(term) {
  const m = /(\d{4})/.exec(String(term || ""));
  return m ? Number(m[1]) : new Date().getUTCFullYear();
}

/** Today's date (YYYY-MM-DD) in Ottawa/Toronto time, DST-safe. */
export function todayInToronto(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function validIso(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parse a Due cell. Supported shapes (bold markers and "~" (estimated)
 * prefixes are handled; "(wk N)" annotations are kept aside):
 *   Sun Oct 11 · Mon Dec 14, 11:59 PM · Oct 26–30 · ~Nov 2–27 · ~Tue Nov 24 (wk 12)
 * Returns null when the cell has no usable date.
 */
export function parseDueCell(cell, year) {
  let s = String(cell).trim();
  if (!s || s === "—") return null;

  const highlight = /^\*\*[\s\S]*\*\*$/.test(s);
  s = s.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
  const est = s.startsWith("~");
  s = s.replace(/^~\s*/, "").trim();

  let wkNote = "";
  const wk = s.match(/\s*\(([^)]*)\)\s*$/);
  if (wk && /wk/i.test(wk[1])) {
    wkNote = wk[0].trim();
    s = s.slice(0, wk.index).trim();
  }

  let time = null;
  const tm = s.match(/,\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (tm) {
    let h = Number(tm[1]) % 12;
    if (tm[3].toUpperCase() === "PM") h += 12;
    time = `${String(h).padStart(2, "0")}:${tm[2]}`;
    s = s.slice(0, tm.index).trim();
  }

  // Ranges: "Oct 26–30", "Nov 2–27", (or cross-month "Oct 30–Nov 3").
  const range = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s*[–—-]\s*(?:([A-Z][a-z]{2})\s+)?(\d{1,2})$/);
  if (range) {
    const m1 = MONTHS[range[1]];
    const m2 = MONTHS[range[3] || range[1]];
    const start = m1 ? validIso(year, m1, Number(range[2])) : null;
    const end = m2 ? validIso(year, m2, Number(range[4])) : null;
    if (start && end && Number(range[4]) >= Number(range[2])) {
      return { start, end, time: null, est, highlight, wkNote };
    }
  }

  const single =
    s.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})$/) ||
    s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (single) {
    const month = MONTHS[single[1]];
    const start = month ? validIso(year, month, Number(single[2])) : null;
    if (start) return { start, end: null, time, est, highlight, wkNote };
  }

  return null;
}

/** Plain text (no markdown) — for .ics summaries. */
export function stripInline(text) {
  return String(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function splitCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function parseEventsTable(lines, year) {
  const rows = lines.filter((l) => l.trim().startsWith("|"));
  if (rows.length < 2) return [];
  const header = splitCells(rows[0]).map((h) => h.toLowerCase());
  const at = (name) => header.indexOf(name);
  const events = [];
  for (const line of rows.slice(1)) {
    if (/^\|[\s:|-]+\|?$/.test(line.trim())) continue; // |---| separator row
    const cells = splitCells(line);
    const pick = (name) => {
      const i = at(name);
      return i >= 0 && i < cells.length ? cells[i] : "";
    };
    const due = pick("due");
    if (!due) continue;
    const event = {
      due,
      parsed: parseDueCell(due, year),
      course: pick("course"),
      item: pick("item"),
      wt: pick("wt"),
      notes: pick("notes"),
    };
    event.itemPlain = stripInline(event.item);
    event.wtPlain = stripInline(event.wt);
    events.push(event);
  }
  return events;
}

/**
 * Split due-dates.md into: intro (title + disclaimer blockquote), the
 * Past/Upcoming event tables, the remaining prose sections, and the rest of
 * the preamble (class times, legend).
 */
export function parseDueDates(md, term) {
  const year = yearFromTerm(term);
  const sections = [];
  let current = { title: "", lines: [] };
  for (const line of String(md).split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      sections.push(current);
      current = { title: h[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const preamble = sections.shift();
  const find = (prefix) => sections.find((s) => s.title.toLowerCase().startsWith(prefix));
  const pastSec = find("past");
  const upcomingSec = find("upcoming");
  const others = sections.filter((s) => s !== pastSec && s !== upcomingSec);

  // Intro = everything through the disclaimer blockquote (plus its trailing blank).
  const plines = preamble.lines;
  let quoteEnd = -1;
  for (let i = 0; i < plines.length; i++) {
    if (/^\s*>/.test(plines[i])) quoteEnd = i;
  }
  let introLen;
  if (quoteEnd >= 0) {
    introLen = Math.min(quoteEnd + 2, plines.length);
  } else {
    const firstBlank = plines.findIndex((l) => l.trim() === "");
    introLen = firstBlank > 0 ? firstBlank : plines.length;
  }

  return {
    year,
    intro: plines.slice(0, introLen),
    preambleRest: plines.slice(introLen),
    past: parseEventsTable(pastSec ? pastSec.lines : [], year),
    upcoming: parseEventsTable(upcomingSec ? upcomingSec.lines : [], year),
    others,
  };
}
