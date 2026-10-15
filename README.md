# btech-due-dates

Public, per-semester due-dates page for classmates, served via a Cloudflare
Worker on a public URL. The Worker code lives in this repo (`src/index.js`)
and is built and deployed automatically by Cloudflare Workers Builds on every
push to `main`.

## Layout

- `due-dates.md` — **always the current semester** (sanitized public copy).
  The Worker bundles this file at deploy time and serves it as the live page.
- `semester.yml` — metadata for the site: term label, last-updated date,
  course list. Update `updated:` every time you push content changes.
- `src/index.js` — the Cloudflare Worker: renders `due-dates.md` to HTML
  (title and last-updated stamp come from `semester.yml`).
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
3. Update `updated:` in `semester.yml`.
4. Commit and push — Workers Builds rebuilds and redeploys the site
   automatically (usually live within a minute or two).

## End-of-semester rollover

1. `mkdir archive && git mv due-dates.md archive/<TERM>.md` (e.g.
   `archive/2026-Fall.md`), commit.
2. Create the new term's sanitized `due-dates.md` from the new term's master.
3. Update `term:`, `title:`, `courses:`, `updated:` in `semester.yml`.
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
| `/` | Rendered HTML page of the current `due-dates.md` |
| `/raw` (alias `/due-dates.md`) | Raw markdown |
| `/health` | Plain-text liveness check (`ok`) |

Content is bundled **at deploy time**, so there is no runtime dependency on
GitHub — editing `due-dates.md`/`semester.yml` and pushing to `main` is all
it takes to update the live site.

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
