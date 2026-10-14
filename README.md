# due-dates

Public, per-semester due-dates page for classmates, served via a Cloudflare
Worker on a public URL. Content-only repo for now — worker code will be added
later.

## Layout

- `due-dates.md` — **always the current semester** (sanitized public copy).
  A future Cloudflare Worker serves this file (and only this file) as the live page.
- `semester.yml` — metadata for the site: term label, last-updated date,
  course list. Update `updated:` every time you push content changes.
- `archive/<TERM>.md` — created at semester rollover (frozen snapshots of past
  semesters). Does not exist yet.

## Weekly update workflow

1. Edit the **master** (private) file in the Semesters repo:
   `_Active/<TERM>/due_dates.md` — that copy may contain personal statuses.
2. Copy it here as `due-dates.md`, **sanitized** (see Privacy rules below).
3. Update `updated:` in `semester.yml`.
4. Commit and push — the site updates on deploy.

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

## Cloudflare Worker integration (planned)

When the worker is added, keep this contract:
- Worker serves `due-dates.md` from the default branch as the current page.
- `semester.yml` supplies the page title/term and last-updated stamp.
- `archive/` is optional for the worker (browse-only, if wanted).

Note: this repo is excluded from the outer Semesters repository via its
`.gitignore` (nested git repos must not be committed as gitlinks).
