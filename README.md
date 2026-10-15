# btech-due-dates

Public, per-semester due-dates page for classmates, served via a Cloudflare
Worker on a public URL. The Worker code lives in this repo (`src/`)
and is built and deployed automatically by Cloudflare Workers Builds on every
push to `main`.

## Layout

- `due-dates.md` — **always the current semester** (sanitized public copy).
  The Worker bundles this file at deploy time and serves it as the live page.
- `semester.yml` — metadata for the site: term label, last-updated stamp,
  course list. Update `updated:` every time you push content changes.
  Include the time (no seconds, quoted) — e.g. `updated: "2026-10-14 21:08"` —
  shown on the page as "Oct 14, 2026, 9:08 PM ET". Date-only (`2026-10-14`)
  also still works.
- `src/` — the Cloudflare Worker. `due-dates.md` is the **single source of
  truth**: one parser (`src/parse.js`) feeds both the dynamic HTML page
  (`src/render.js`) and the subscribable calendar feed (`src/ics.js`). Routes
  are wired in `src/index.js`. Edit `due-dates.md`, push, and the page and
  every subscribed classmate calendar update together.
- `wrangler.jsonc` — Worker configuration. The `name` (`btech-due-dates`)
  **must match** the Worker name in the Cloudflare dashboard.
- `package.json` / `package-lock.json` — dependencies (`marked` for
  markdown-to-HTML) and npm scripts.
- `archive/<TERM>.md` — created at semester rollover (frozen snapshots of past
  semesters). Does not exist yet.

## Weekly update workflow

1. Edit the **master** (private) file in the Semesters repo:
   `_Active/<TERM>/due_dates.md` — that copy may contain personal statuses.
2. Copy it here as `due-dates.md`, **sanitized** (see Privacy rules below).
3. Update `updated:` in `semester.yml` — date **and** time, e.g.
   `updated: "2026-10-14 21:08"` (your local Ottawa time; no seconds).
4. Commit and push — Workers Builds rebuilds and redeploys the site
   automatically (usually live within a minute or two); classmates with a
   subscribed calendar see the change on their app's next refresh.

## End-of-semester rollover

1. `mkdir archive && git mv due-dates.md archive/<TERM>.md` (e.g.
   `archive/2026-Fall.md`), commit.
2. Create the new term's sanitized `due-dates.md` from the new term's master.
3. Update `term:`, `title:`, `courses:`, `updated:` (date + time) in `semester.yml`.
4. Commit and push.

## Privacy rules (before every push)

This is a **public** URL. Never publish:
- Your submission status ("submitted", "written", attempt counts)
- Your grades/scores or professor feedback notes
- Anything else personally identifying

Keep those only in the private master file under `_Active/<TERM>/`.

## Cloudflare Worker (implemented)

The Worker serves `due-dates.md` from the default branch as the current page,
with `semester.yml` supplying the page title/term and last-updated stamp.
`archive/` is **not** served yet (optional browse-only feature; add later if
wanted).

### What it serves

| Route | Response |
|---|---|
| `/` | Dynamic HTML page: upcoming items first with countdowns ("today" = Ottawa time), stale rows auto-filed into a collapsed Past section, calendar buttons. **Course filter chips + sorting (date / course / weight) below the header** — the choice is remembered per browser (localStorage) and mirrored in the URL (`?courses=…`) so filtered views can be shared; a floating notice shows while courses are excluded. **🎨 Theme menu** in the top bar: Auto/Light/Dark + a sun/moon quick toggle + accent color (persisted per browser via localStorage — no cookies). **Sticky column headers** on wide screens (≥960px; narrow screens keep horizontal table scrolling, which is incompatible with sticky) |
| `/raw` (alias `/due-dates.md`) | Raw markdown |
| `/calendar.ics` | iCalendar feed of every dated upcoming item — subscribe (Apple/Outlook) or import (Google). `?id=<event>` returns a single event; `?download=1` forces a download; **`?courses=CST3104,MGT4701` whitelists courses** (for classmates not taking every course — the "Add to calendar" modal builds this URL automatically from the page's enabled courses) |
| `/health` | Plain-text liveness check (`ok`) |

Content is bundled **at deploy time**, so there is no runtime dependency on
GitHub — editing `due-dates.md`/`semester.yml` and pushing to `main` is all
it takes to update the live site.

### Calendar integration (subscription)

- The **"Add to calendar" button** opens a modal with the `webcal://` URL to
  paste **once**: Apple Calendar (File → New Calendar Subscription) and
  Outlook (Add calendar → Subscribe from web). Subscribers' apps re-fetch the
  feed on their own schedule — every push flows into their calendar with no
  action needed on their part.
- **Google Calendar** subscribes too (web only): Settings → Add calendar →
  From URL → paste the **https** form (Google rejects `webcal://`). The modal
  has a one-click **Add to Google Calendar** button that deep-links into the
  subscribe flow (`calendar.google.com/calendar/render?cid=…`). Google
  re-checks the feed roughly every 12–24 hours; the mobile app displays the
  subscribed calendar but can't add it directly. The `.ics` download remains
  a fallback for an editable local copy — note an imported calendar is a
  static snapshot that won't auto-update.
- Feed details for client compatibility: stable content-hashed UIDs (Google
  keys updates on UID), `TRANSP:TRANSPARENT` per event, all-day `VALUE=DATE`
  for date-only entries, and ETag/304 support for conditional re-fetches.
- Each upcoming row has a **📅 button** that downloads just that event.
- **Course-filtered feeds**: `?courses=` accepts a comma-separated whitelist
  (case-insensitive; unknown codes are ignored; an empty/invalid param means
  all courses). The ETag varies per filter set, so conditional fetches still
  304 correctly per URL.
- Estimated rows (leading `~`) are prefixed `(est.)` in the feed. Date-only
  entries become all-day events; timed entries use `America/Toronto`.
- The feed only ever contains today-and-future items, so subscribed calendars
  self-clean at semester rollover — nothing for classmates to re-add.

### Editing due-dates.md (it drives everything)

The **Due** column is parsed, not just displayed. Supported shapes:

- `Sun Oct 11` or `Mon Dec 14, 11:59 PM` — single date, optional time
- `Oct 26–30` — date range (becomes a multi-day all-day event)
- leading `~` — estimated date (kept in output, marked `(est.)`)
- `**bold**` — emphasis only; `(wk N)` suffixes are excluded from date math

Anything else still renders as a normal row, but gets no countdown and no
calendar entry — keep Due dates in the shapes above.

### First-time dashboard setup (Workers Builds)

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create
   application** → **Create Worker**.
2. Name it **exactly `btech-due-dates`** (must match `name` in
   `wrangler.jsonc`, or the build will fail) and deploy the starter.
3. Open the Worker → **Settings** → **Builds** (Build & deploy) →
   **Connect**.
4. Authorize the Cloudflare GitHub app and select this repository
   (`manzar-shahaan/btech-due-dates`), production branch `main`.
5. Build settings: root directory `/` (default), leave the build command
   empty (dependencies install automatically from `package.json`), deploy
   command `npx wrangler deploy` (default).
6. Push a commit (or retry a build) to trigger the first deploy, then visit
   `https://btech-due-dates.<your-subdomain>.workers.dev`.

### Local development

```sh
npm install
npm run dev     # serves at http://127.0.0.1:8787
npm run check   # validate config + bundling without deploying
```

Note: this repo is excluded from the outer Semesters repository via its
`.gitignore` (nested git repos must not be committed as gitlinks).
