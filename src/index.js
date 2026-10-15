// btech-due-dates Worker — dynamic, date-aware due-dates page + subscribable
// calendar feed.
//
// Content is bundled at deploy time from the repo root:
//   - due-dates.md -> the single source of truth (page + calendar both
//                     derive from it; edit it and push to update everything)
//   - semester.yml -> title / term / last-updated metadata
// Workers Builds rebuilds on every push to main.

import dueDatesMarkdown from "../due-dates.md";
import semesterYml from "../semester.yml";
import { parseSemesterYml, parseDueDates, todayInToronto } from "./parse.js";
import { buildIcs, eventUid, feedEtag } from "./ics.js";
import { pageHtml, notFoundHtml } from "./render.js";

const meta = parseSemesterYml(semesterYml);

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // Short TTL: the page is computed per-request around "today".
  "cache-control": "public, max-age=60",
};

const RAW_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  "cache-control": "public, max-age=300",
};

const ICS_HEADERS = {
  "content-type": "text/calendar; charset=utf-8",
  "cache-control": "public, max-age=300",
};

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" },
      });
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      case "/":
      case "/index.html": {
        const parsed = parseDueDates(dueDatesMarkdown, meta.term);
        return new Response(pageHtml({ meta, parsed, today: todayInToronto() }), {
          headers: HTML_HEADERS,
        });
      }

      case "/raw":
      case "/due-dates.md":
        return new Response(dueDatesMarkdown, { headers: RAW_HEADERS });

      case "/calendar.ics": {
        const id = url.searchParams.get("id");
        const download = url.searchParams.has("download") || Boolean(id);
        const parsed = parseDueDates(dueDatesMarkdown, meta.term);
        const today = todayInToronto();
        const dated = [...parsed.past, ...parsed.upcoming].filter((e) => e.parsed);

        let events;
        if (id) {
          events = dated.filter((e) => eventUid(e, meta.term) === id);
          if (events.length === 0) {
            return new Response("Unknown event id\n", {
              status: 404,
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
        } else {
          // Feed: today and later — subscribers' calendars stay clean
          // without needing manual cleanup at semester rollover.
          events = dated.filter((e) => e.parsed.start >= today);
        }

        // ETag covers everything except the per-request DTSTAMP, so the
        // same feed content gets 304s between deploys (Apple/Google poll
        // politely with conditional requests).
        const etag = feedEtag(events, meta);
        if (request.headers.get("if-none-match") === `"${etag}"`) {
          return new Response(null, {
            status: 304,
            headers: {
              etag: `"${etag}"`,
              "cache-control": ICS_HEADERS["cache-control"],
            },
          });
        }

        const headers = { ...ICS_HEADERS, etag: `"${etag}"` };
        if (download) {
          headers["content-disposition"] = 'attachment; filename="btech-due-dates.ics"';
        }
        return new Response(buildIcs(events, meta), { headers });
      }

      case "/health":
        return new Response("ok\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });

      default:
        return new Response(notFoundHtml, { status: 404, headers: HTML_HEADERS });
    }
  },
};
