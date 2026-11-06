# Timelog

Build session on 2026-11-06 (local time). Started 22:06 for code, after about 15 minutes of research.

| Part | Minutes | Notes |
|---|---|---|
| Research: HighLevel API, OptiMantra, HIPAA and hosting terms | 15 | Found that no API version accepts `source` when creating an opportunity, and that v3 is now the latest version |
| Scaffold, GHL client, mock, schema | 4 | |
| Sync engine, adapter, matching, ledger, simulator | 5 | Caught a replayed booking after a reschedule looking like a new move |
| Vitest suites | 4 | |
| UI, Playwright, CI | 5 | Dropped Tailwind for plain CSS tokens |
| Mutation checks on the safeguards | 3 | Two deliberate breaks survived; fixed with mock latency and stage-id assertions |
| README and HIPAA checklist | 3 | |
| gitleaks, repo, Vercel, Neon, live checks | 5 | |
