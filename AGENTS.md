# due-dates — Agent Notes

- Deploy = `git push` to `main`. A Cloudflare Workers CI/CD pipeline sees the push, rebuilds, and deploys the site — no local `npm run deploy` or `wrangler` needed.
- Edit `due-dates.md`, `semester.yml`, or `src/*` → commit → push. The worker rebuilds automatically; subscribed calendars refresh on their own schedule.
- Sanity check before pushing (optional): `npm run check` (dry-run build).
- Git commands run from the Mac host (this folder is a Parallels share), not from inside the Linux VM.
- After every change/implementation in this repo, always give the student the ready-to-paste `git add` / `git commit -m` / `git push` commands for the Mac host.
- Last-updated stamps are automatic: a `pre-commit` git hook (source: `hooks/pre-commit`, installed at `.git/hooks/pre-commit`) rewrites `updated:` in `semester.yml` and `Last updated:` in `due-dates.md` with the current Ottawa time on every commit, and `git add`s them into the commit. No manual stamping needed before pushes. Caveats: it only runs when using real git commits (not `--no-verify`); after a fresh clone, reinstall with `cp hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.
