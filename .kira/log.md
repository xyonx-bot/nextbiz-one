# NextBiz One — .kira log (what shipped, how verified)

## Oct 25 — fix/nbo-broadcast-ux (Joydip dispatch, live bug report)
- Merged 54acada5 → deployed manual scripts/deploy.sh (CI deploy skips, known) → live-verified:
  public health ok, login 200, new broadcasts chunk page-c3a9a10549297c72.js serving with audience-picker markers.
- 4 fixes: (1) chat-tree nav had duplicate dead Broadcasts/Templates/Automation chips — removed;
  (2) composer audience was hard-wired "all opted-in" — now ALL or SELECT specific contacts
  (search + select all/clear + checkboxes; opt-in stays a server-side hard rule, ids always
  intersected with opt_in=true; empty/non-opted selections 400); (3) template pick had no
  selected state — .trow on (CSS already existed); (4) "Next: Schedule" dead because canNext
  required the name before it exists (name input is step 4) — fixed; preview now shows the
  picked audience count.
- Verified: tsc clean, lint clean (pre-existing img warnings only), unit 4/4, build green,
  full e2e 29/29 on fresh side-DB (nbo_e2e_pg, migrations 6/6) incl. 3 new tests
  (nav dedup, full composer flow w/ pg-seeded approved template, audience API hard-rule).
  Local gotcha: OPERATOR_EMAIL/PASS must be exported for the playwright run too (server vs
  spec defaults mismatch made the first run 13-red).
- Visual: 7 screenshots at kira profile cache/scratch/nbo-bux-shots/ (24h prune) — DOM-level
  checks passed (chips deduped, trow on sticks, count 1, step 4 reached); vision model was
  410-dead so no AI pixel pass — Joydip to eyeball.

## Oct 26 — e2e prod garbage cleanup + root cause fix
- **Problem found:** Oct 23 e2e runs accidentally hit PROD DB (nextbiz_one_db), leaving:
  10 e2e_draft_* templates, 4 e2e test contacts, 8 e2e users, 4 E2E Biz workspaces,
  8 access_requests, 8 audit_log entries, 100+ template_status_poll jobs. This IS what
  Joydip saw in the UI — "Drafts 10" = those 10 e2e templates.
- **Cleanup:** Fresh pg_dump backup (/home/ubuntu/nbo-prod-backup-20261026-135932.dump),
  then DELETE only e2e rows — real data preserved (4 real templates, 1 real contact,
  1 operator, 2 workspaces).
- **Root cause fix (merged bd8dfd0):**
  1. PROD GUARD on ALL 4 e2e specs (account-funnel, s4-automation-settings, design-fix,
     smoke) — if DATABASE_URL contains one-db:5432 or one.nextbizstudio.com, spec exits
     immediately (process.exit(0), no DB mutations, no docker exec). CI uses side-DB.
  2. account-funnel.spec.ts: replaced dangerous execSync(docker exec nextbiz_one_db psql)
     with pg Pool cleanup (same pattern as broadcasts.spec.ts).
  3. design-fix.spec.ts: same fix — removed execSync(nbo_ci_pg docker exec).
- Deployed bd8dfd07 → live verified: health ok, broadcast chunk serving, prod DB clean.