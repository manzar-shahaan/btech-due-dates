<!-- TODO: add logo -->

# btech-due-dates

<p align="center">
  A live due-dates page + calendar feed for the BTech cohort —<br>
  edit one Markdown file, every classmate's calendar updates itself.
</p>

<p align="center">
  <a href="https://btech-due-dates.&lt;your-subdomain&gt;.workers.dev">Open the live page</a> ·
  <a href="#subscribing-to-the-calendar">Subscribe to the calendar</a> ·
  <a href="#reporting-an-error">Report an error</a>
</p>

---

## Using the page

The page gives you, in one view:

- **Upcoming first** — items sorted by date with live countdowns ("today" = Ottawa time); older rows fold into a collapsed Past section.
- **Course filter chips** — tap a course code to include/exclude it. Your choice is remembered per browser and mirrored in the URL (`?courses=…`), so a filtered view can be shared.
- **Done checkboxes** — one per row; ticks strike the item and mute its Today/Tomorrow tag. Persists in your browser only — nothing is sent to the server.
- **🎨 Theme menu** — a single light/dark toggle (follows your system scheme until you pick one; "Follow system" re-enables that) plus accent colour via swatches or a custom hex code. Persisted per browser, no cookies.
- **Sorting** by date, course, or weight, and sticky column headers at every width.

Dates are cross-checked against course outlines and Brightspace where possible, but **Brightspace and official college communications are always authoritative**. Not affiliated with or endorsed by Algonquin College.

## Subscribing to the calendar

The calendar feed means due dates appear in your calendar app automatically — no re-checking the page.

**Apple Calendar / Outlook (subscribe once):**

1. On the page, click **Subscribe to calendar**.
2. Copy the `webcal://` URL from the modal.
3. Apple Calendar: **File → New Calendar Subscription** · Outlook: **Add calendar → Subscribe from web**. Paste and save.

Your app re-fetches the feed on its own schedule — every update flows into your calendar with no action needed on your part.

**Google Calendar** (web only):

1. **Settings → Add calendar → From URL** and paste the **https** form of the feed URL (Google rejects `webcal://`) — or use the one-click **Add to Google Calendar** button in the modal.
2. Google re-checks the feed roughly every 12–24 hours, so expect that much delay on updates. The mobile app displays the subscribed calendar but can't add it directly.

**Only taking some courses?** Use a filtered feed: `https://btech-due-dates.<your-subdomain>.workers.dev/calendar.ics?courses=CST3104,MGT4701` (comma-separated whitelist, case-insensitive). The modal builds this URL automatically from the courses you've enabled on the page.

**Want an editable local copy?** Download the `.ics` (the modal's download option, or `?download=1`) and import it — but an imported calendar is a static snapshot that won't auto-update. Subscribing is better.

<details>
<summary>Feed details</summary>

- Stable content-hashed UIDs — Google keys updates on UID, so edited events update in place instead of duplicating.
- Date-only entries become all-day `VALUE=DATE` events; timed entries render in `America/Toronto` — a start–end range becomes a real start/stop event (exams), while a bare time gets a 30-minute block.
- `TRANSP:TRANSPARENT` per event.
- Estimated rows (leading `~`) are prefixed `(est.)` in the feed.
- The feed only ever contains today-and-future items, so subscribed calendars self-clean at semester rollover — nothing to re-add.
- ETag/304 support for conditional re-fetches; the ETag varies per course-filter set, so each filtered URL 304s correctly.

</details>

## Reporting an error

Every event row has a **⋮ menu → "Report incorrect"**. It copies that exact item (course — item — due date) to your clipboard and opens my Discord chat — paste it with your correction. (Discord has no deep link that pre-fills a message, which is why the item rides on the clipboard.)

You can also [open an issue](https://github.com/manzar-shahaan/btech-due-dates/issues) with the same copied text.

---

# Maintainer documentation

## How it works

`due-dates.md` is the **single source of truth**: one parser (`src/parse.js`) feeds both the dynamic HTML page (`src/render.js`) and the subscribable calendar feed (`src/ics.js`); routes are wired in `src/index.js`. Edit `due-dates.md`, push, and the page and every subscribed classmate calendar update together.

Content is bundled **at deploy time**, so there is no runtime dependency on GitHub — editing `due-dates.md`/`semester.yml` and pushing to `main` is all it takes to update the live site. The Worker code lives in `src/` and is built and deployed automatically by Cloudflare Workers Builds on every push to `main`.

`semester.yml` supplies the page title, term, and last-updated stamp. `archive/` is **not** served yet (optional browse-only feature; add later if wanted).

### Repository layout

- `due-dates.md` — **always the current semester** (sanitized public copy).
- `semester.yml` — metadata for the site: term label, last-updated stamp, course list. `updated:` is rewritten automatically by the `pre-commit` hook (see [Weekly update workflow](#weekly-update-workflow)) — date **and** time, e.g. `updated: "2026-10-14 21:08"` (Ottawa time; no seconds) — shown on the page as "Oct 14, 2026, 9:08 PM ET". Date-only (`2026-10-14`) also still works.
- `src/` — the Cloudflare Worker (`index.js`, `parse.js`, `render.js`, `ics.js`).
- `wrangler.jsonc` — Worker configuration. The `name` (`btech-due-dates`) **must match** the Worker name in the Cloudflare dashboard.
- `package.json` / `package-lock.json` — dependencies (`marked` for markdown-to-HTML) and npm scripts.
- `hooks/pre-commit` — stamps `updated:` in `semester.yml` and `Last updated:` in `due-dates.md` at commit.
- `archive/<TERM>.md` — created at semester rollover (frozen snapshots of past semesters). Does not exist yet.

### Routes

| Route | Response |
|---|---|
| `/` | Dynamic HTML page — everything in [Using the page](#using-the-page), computed per-request around "today" (Ottawa time) |
| `/raw` (alias `/due-dates.md`) | Raw markdown |
| `/calendar.ics` | iCalendar feed of every dated upcoming item. `?id=<event>` returns a single event; `?download=1` forces a download; `?courses=CST3104,MGT4701` whitelists courses |
| `/health` | Plain-text liveness check (`ok`) |

## Editing due-dates.md (it drives everything)

The **Due** column is parsed, not just displayed. Supported shapes:

- `Sun Oct 11` or `Mon Dec 14, 11:59 PM` — single date, optional time
- `Mon Dec 14, 4:00–6:00 PM` or `Thu Dec 17, 11:00 AM–1:00 PM` — start–end time block (put the AM/PM on the end time and the start inherits it, or on both; bare 24h times like `14:00–16:30` also work) — becomes a timed calendar event
- `Oct 26–30` — date range (becomes a multi-day all-day event)
- leading `~` — estimated date (kept in output, marked `(est.)`)
- `**bold**` — emphasis only; `(wk N)` suffixes are excluded from date math

Anything else still renders as a normal row, but gets no countdown and no calendar entry — keep Due dates in the shapes above.

## Weekly update workflow

1. Edit the **master** (private) file in the Semesters repo: `_Active/<TERM>/due_dates.md` — that copy may contain personal statuses.
2. Copy it here as `due-dates.md`, **sanitized** (see [Privacy rules](#privacy-rules-before-every-push) below).
3. Commit and push — a `pre-commit` hook (see `hooks/pre-commit`) automatically stamps `updated:` in `semester.yml` (date **and** time, Ottawa time, e.g. `updated: "2026-10-14 21:08"`) and `Last updated:` in `due-dates.md`, so the stamps always reflect the commit/push moment. After a fresh clone, install it:
   `cp hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
4. Workers Builds rebuilds and redeploys the site automatically (usually live within a minute or two); classmates with a subscribed calendar see the change on their app's next refresh.

## End-of-semester rollover

1. `mkdir archive && git mv due-dates.md archive/<TERM>.md` (e.g. `archive/2026-Fall.md`), commit.
2. Create the new term's sanitized `due-dates.md` from the new term's master.
3. Update `term:`, `title:`, `courses:` in `semester.yml` (the hook refreshes `updated:` at commit).
4. Commit and push.

## Privacy rules (before every push)

> [!WARNING]
> This is a **public** URL. Never publish:
>
> - Your submission status ("submitted", "written", attempt counts)
> - Your grades/scores or professor feedback notes
> - Anything else personally identifying
>
> Keep those only in the private master file under `_Active/<TERM>/`.

## First-time deploy (Workers Builds)

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Create Worker**.
2. Name it **exactly `btech-due-dates`** (must match `name` in `wrangler.jsonc`, or the build will fail) and deploy the starter.
3. Open the Worker → **Settings** → **Builds** (Build & deploy) → **Connect**.
4. Authorize the Cloudflare GitHub app and select this repository (`manzar-shahaan/btech-due-dates`), production branch `main`.
5. Build settings: root directory `/` (default), leave the build command empty (dependencies install automatically from `package.json`), deploy command `npx wrangler deploy` (default).
6. Push a commit (or retry a build) to trigger the first deploy, then visit `https://btech-due-dates.<your-subdomain>.workers.dev`.

## Local development

```sh
npm install
npm run dev     # serves at http://127.0.0.1:8787
npm run check   # validate config + bundling without deploying
```

Note: this repo is excluded from the outer Semesters repository via its `.gitignore` (nested git repos must not be committed as gitlinks).

## Contributing

Bug reports and fixes welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Code of Conduct

Be decent to each other — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Manzar Shahaan
