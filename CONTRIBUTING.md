# Contributing to btech-due-dates

Thanks for wanting to help! This started as a personal tool for my own
semester and is now opened up for the cohort — contributions are welcome.

## Reporting a wrong date (the most useful contribution)

The fastest way is the **⋮ → "Report incorrect"** menu on the page itself: it
copies the exact item and opens my Discord chat. If you'd rather use GitHub,
[open an issue](https://github.com/manzar-shahaan/btech-due-dates/issues) and
paste the same thing as the issue body:

```
Course: CST3104
Item: Week 5 Quiz
Shown due date: Fri Oct 16
Correct due date: <what it should be>
Source: <course outline / Brightspace / email>
```

**Note:** Brightspace and official college communications are always
authoritative — this page is a convenience copy, not the source of record.

## Other contributions

- **Docs fixes** — typos, unclear steps, anything stale in the README.
- **Worker improvements** — the Worker is plain JavaScript (`src/index.js`,
  `src/parse.js`, `src/render.js`, `src/ics.js`) with no build step and a
  single runtime dependency (`marked`). Keep it that way unless there's a
  good reason.

## Development setup

```sh
npm install
npm run dev     # serve locally at http://127.0.0.1:8787
npm run check   # validate config + bundling without deploying
```

Deploy is automatic: every push to `main` is built and deployed by Cloudflare
Workers Builds, so `main` should always be in a deployable state.

## Ground rules

- Keep `due-dates.md` table shapes valid — see
  [Editing due-dates.md](README.md#editing-due-datesmd-it-drives-everything)
  for the parsed Due-column formats. Anything outside those shapes still
  renders but loses its countdown and calendar entry.
- Imperative commit messages ("Fix ESC4300 midterm date"), one logical change
  per commit.
- No grades, submission statuses, or personal notes in `due-dates.md` — this
  is a public URL. See
  [Privacy rules](README.md#privacy-rules-before-every-push).
