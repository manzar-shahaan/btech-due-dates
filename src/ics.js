// RFC 5545 (.ics) feed generation. /calendar.ics serves this as a
// *subscription* feed: classmates paste the webcal:// URL once, and their
// calendar app re-fetches it on its refresh schedule — so every push of
// due-dates.md updates everyone's calendar.

import { stripInline } from "./parse.js";

const CRLF = "\r\n";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Toronto",
  "X-LIC-LOCATION:America/Toronto",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Stable UID for one event (same hash the page's per-event buttons link to). */
export function eventUid(event, term) {
  const base = `${event.parsed.start}|${event.course}|${event.itemPlain}`;
  let h = 5381;
  for (const ch of base) h = (h * 33 + ch.codePointAt(0)) | 0;
  return `btdd-${String(term || "").replace(/[^\w-]+/g, "")}-${(h >>> 0).toString(36)}`;
}

function icsEscape(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 §3.1 — fold lines at 75 octets, never splitting a UTF-8 sequence. */
function foldLine(line) {
  const cps = [...String(line)];
  const out = [];
  let cur = "";
  let curLen = 0;
  for (const cp of cps) {
    const code = cp.codePointAt(0);
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    if (curLen + size > 75) {
      out.push(cur);
      cur = ` ${cp}`;
      curLen = 1 + size;
    } else {
      cur += cp;
      curLen += size;
    }
  }
  if (cur) out.push(cur);
  return out.join(CRLF);
}

function compactDate(iso) {
  return iso.replace(/-/g, "");
}

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function utcStamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

function eventSummary(e) {
  const bits = [];
  if (e.parsed.est) bits.push("(est.)");
  if (e.course && e.course !== "—") bits.push(e.course);
  bits.push(e.itemPlain);
  if (e.wtPlain && e.wtPlain !== "—") bits.push(`(${e.wtPlain})`);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function eventBlock(e, term, stamp) {
  const p = e.parsed;
  const lines = ["BEGIN:VEVENT", `UID:${eventUid(e, term)}`, `DTSTAMP:${stamp}`];

  if (p.time) {
    // Timed: a 30-minute block at the due time, local Toronto time — but
    // never let the block cross midnight, or calendar apps render the
    // event on the *next* day too. Late-night blocks get clamped to end
    // at 23:59:59 on the due day.
    const [h, m] = p.time.split(":").map(Number);
    let eh = h;
    let em = m + 30;
    let es = "00";
    let endDate = p.start;
    if (em >= 60) {
      em -= 60;
      eh += 1;
    }
    if (eh >= 24) {
      eh = 23;
      em = 59;
      es = "59";
    }
    lines.push(`DTSTART;TZID=America/Toronto:${compactDate(p.start)}T${p.time.replace(":", "")}00`);
    lines.push(
      `DTEND;TZID=America/Toronto:${compactDate(endDate)}T${String(eh).padStart(2, "0")}${String(em).padStart(2, "0")}${es}`
    );
  } else {
    // Date-only (or range): all-day event; DTEND is exclusive.
    lines.push(`DTSTART;VALUE=DATE:${compactDate(p.start)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDay(p.end || p.start))}`);
  }

  lines.push(`SUMMARY:${icsEscape(eventSummary(e))}`);
  const desc = [stripInline(e.notes), "Unofficial study aid — verify on Brightspace."]
    .filter(Boolean)
    .join("\n");
  lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  lines.push("TRANSP:TRANSPARENT");
  lines.push("END:VEVENT");
  return lines;
}

function calendarLines(events, meta, stamp) {
  const sorted = [...events].sort((a, b) => {
    const ka = a.parsed.start + (a.parsed.time || "00:00");
    const kb = b.parsed.start + (b.parsed.time || "00:00");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//btech-due-dates//Cloudflare Worker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(meta.title || "Due Dates")}`,
    `X-WR-CALDESC:${icsEscape("Unofficial study-aid deadlines; auto-updates with the site. Verify on Brightspace.")}`,
    "X-WR-TIMEZONE:America/Toronto",
    ...VTIMEZONE,
  ];
  for (const e of sorted) lines.push(...eventBlock(e, meta.term, stamp));
  lines.push("END:VCALENDAR");
  return lines;
}

/** Build a complete VCALENDAR from parsed events (each must have `parsed`). */
export function buildIcs(events, meta, now = new Date()) {
  return calendarLines(events, meta, utcStamp(now)).map(foldLine).join(CRLF) + CRLF;
}

/**
 * Stable ETag over the feed's semantic content — everything except the
 * per-request DTSTAMP — so conditional requests get 304s between deploys.
 * Like the UIDs, it only changes when the feed content actually changes
 * (a deploy or a day rollover), never on a plain re-fetch.
 */
export function feedEtag(events, meta) {
  const canonical = calendarLines(events, meta, "STAMP")
    .filter((line) => !line.startsWith("DTSTAMP:"))
    .join("\n");
  let h = 5381;
  for (const ch of canonical) h = (h * 33 + ch.codePointAt(0)) | 0;
  return (h >>> 0).toString(36);
}
