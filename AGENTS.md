# due-dates — Agent Notes

- Deploy = `git push` to `main`. A Cloudflare Workers CI/CD pipeline sees the push, rebuilds, and deploys the site — no local `npm run deploy` or `wrangler` needed.
- Edit `due-dates.md`, `semester.yml`, or `src/*` → commit → push. The worker rebuilds automatically; subscribed calendars refresh on their own schedule.
- Sanity check before pushing (optional): `npm run check` (dry-run build).
- Git commands run from the Mac host (this folder is a Parallels share), not from inside the Linux VM.
- After every change/implementation in this repo, always give the student the ready-to-paste `git add` / `git commit -m` / `git push` commands for the Mac host.
