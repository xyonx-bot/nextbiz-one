# NextBiz One — .kira working tasks (Kira's scratch; decisions live in Nina's project dir)

## S0 — build-start (r-nbo-s0; tech-plan §S0 + Mira package Oct 20)
| # | Task | Status |
|---|---|---|
| S0-1 | GitHub repo xyonx-bot/nextbiz-one (Joydip created) + local scaffold (Next 15, TS, Tailwind 4, vitest, playwright, eslint — NBS mirror) | done |
| S0-2 | Design tokens + shell v4.3 port (rail 64 + panel 248 + header card, leaf-active) 1:1 from Mira dashboard/auth wireframes | done |
| S0-3 | Migration 001: workspaces, users, sessions, waba_connections, contacts, conversations, messages, webhook_events (workspace_id everywhere) | done |
| S0-4 | Auth skeleton: login card (Mira auth wireframe) + bcrypt + DB session + operator bootstrap + hard middleware gate | done |
| S0-5 | Webhook: GET hub.challenge + POST X-Hub-Signature-256 HMAC + raw event store + auto-contact + conversation last_inbound_at + message row | done |
| S0-6 | Backup skeleton: scripts/db-backup.py (NBS boto3 pattern, bucket joyverse-db-backups, 30d prune) | done |
| S0-7 | Deploy skeleton: compose + one.conf.example + CI/CD workflow (deploy skips till Tony DNS/secrets) | done |
| S0-8 | Tests: unit (signature×4) + e2e smoke (health, gate, login+shell, webhook GET/POST valid/invalid) | done |
| S0-9 | Real WABA webhook wired (Joydip's app secret + verify token via env; DNS one.nextbizstudio.com — Tony) | pending |
| S0-10 | S0 acceptance: Joydip sends "hi" → row in messages | pending |

## S2 (r-nbo-s2) — Templates + Broadcasts + scheduler
| # | Task | Status |
|---|---|---|
| S2-1 | Migration 004: templates/broadcasts/recipients/jobs | done (e74ed88) |
| S2-2 | Templates surface (list/editor/submit/status-sync) + wa-client template fns | done (6745cfb, feced56) |
| S2-2b | LIVE PROOF: sample-format fix (flat array), 2 templates PENDING Meta review (nextbiz_static_test, nextbiz_var_test); 4 rejected rows retained (format history) | done |
| S2-3 | Broadcasts 4-step composer (audience opt-in hard rule + estimate → approved template → preview → schedule + test send) | next |
| S2-4 | Job scheduler: 30s worker tick + template status auto-poll | next |
| S2-5 | Delivery report: per-recipient, Meta errors decoded (131026/131047/131049), CSV | pending |
| S2-6 | E2e + completion report (screenshot-vs-wireframe per page) | pending |
| S2-7 | Merge to main → deploy → live verify | pending (after suite green) |

External pending: display-name "NextBiz Studio" review (Manager); template approvals (Meta review); inbound "Hi" test on 9088727191 (Joydip, from another phone).

## S3 DISPATCHED (r-nbo-s3, Nina 13:12Z) — SEQUENCED AFTER S2 MERGE
P1.1 signup · P1.2 request-access · P1.3 operator admin panel · P1.4 onboarding.
Design: mira prototypes auth/ + onboarding/ + operator-admin/ (Oct 19 wireframes).

## S2 FINISH PLAN (execute first — fresh session)
- broadcasts UI: wireframe zones staged at /tmp/nbo-bz.txt (blist/bdetail/bcomposer markup);
  broadcasts CSS ALREADY ported into app/globals.css (10.4KB + 4 media blocks, committed).
  Build: app/broadcasts/page.tsx + BroadcastsClient.tsx (list pills+search, detail report w/
  rstats+rtable+error decode, 4-step composer w/ phone preview) + /api/broadcasts/[id]/recipients
  (+?format=csv) + Shell chip 'Broadcasts'.
- e2e suite S2 (worker tick, opt-in gate, approved-template gate) → merge main → deploy → verify.
- Note: two-direction test on new number DONE (reply delivered 11:35Z) — Nina's log stale.
