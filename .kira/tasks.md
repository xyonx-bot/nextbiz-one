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

## S4 (r-nbo-s4) — Automation + Settings + hardening
| # | Task | Status |
|---|---|---|
| S4-1 | Migration 006: automation tables + pauses + workspaces.about | done |
| S4-2 | lib/automation engine (contains-match, away/hours IST, welcome once, pause contract) + webhook hook | done (b8b9107) |
| S4-3 | Automation APIs: state/settings/rules CRUD+test/faq | done |
| S4-4 | Settings APIs: profile/sessions/export CSV/danger-zone | done (208e03a, tsc clean) |
| S4-5 | Automation UI — 1:1 port (welcome 3-band card, keyword table+inspector, hours, FAQ) | done (c7b82bb) |
| S4-6 | Settings UI — 1:1 port (profile, connections, modules, security, data+danger zone) | done (c7b82bb) |
| S4-7 | E2e (automation fire + pause + away window) + merge + deploy | done — full suite 30/30 green Oct 27 (fresh side-DB); phone-collision flake + sessions-500 fixed en route |

## S3 DESIGN-FIX (r-nbo-s3-design-fix, Oct 24) — mira live-verify fix list A-E
| # | Task | Status |
|---|---|---|
| DF-A | Brand block (logo 30px + wordmark + tagline) above card on ALL auth pages + status states — new components/AuthBrand.tsx | done |
| DF-B | /operator spacing: op-shell padding 12+gap 12; op-main flex column gap 14 padding 12/12/26; scoped r-lg 18 (op-card radius) | done |
| DF-C | Login CTA dark ink text on lime (scoped .authwrap .btn-chat) + hover keeps deep-green+white; copy 'Log In' | done |
| DF-D | Signup legal microcopy (Terms + Privacy Policy) below CTA | done |
| DF-E | Request-access full subtitle + 'Email for updates' label | done |
| DF-F | Found-bug: StatusCard classes never matched ported CSS (warn-card vs pending; stile vs st-ic) — restructured 1:1 to wireframe markup | done |
| DF-T | e2e design-fix.spec.ts: brand order + CTA computed colors + copy + microcopy + lede/label + operator geometry (gap 14/radius 18/margin 24 @1280) | done (run pending) |
| DF-V | typecheck + lint + unit + build + full e2e (side-DB) + merge + deploy + live-verify | in progress |

## 2026-10-27 — beta-deploy-pipeline (shipped)
- [x] two-env release flow: beta.one.nextbizstudio.com auto-deploys origin/main (systemd timer, 5 min)
- [x] prod gated: deploy.sh --env prod --ref <v-tag> --approved-by "Joydip <date>" — refuses without GO
- [x] beta DB own container, seeded from prod dump; WhatsApp/Meta stubbed (no real sends)
- [x] CI deploy job (the silent skipper) removed — CI is tests-only
- merged to main: f5c524c; verified: health gates + systemd fire test (audit trail in ~/deploy-logs)

## 2026-10-27 AUDIT — true state (Kira, verified from repo evidence)
- S4 FULLY SHIPPED: UI ports landed in c7b82bb (Automation + Settings), APIs earlier
  (b8b9107 / 208e03a); s4-automation-settings.spec.ts exists (gated-endpoints, CRUD,
  match-simulate, pause contract, settings surfaces). S4-7 suite run: this session,
  side-DB nbo-e2e-db on 127.0.0.1:5435.
- S2/S3 finished earlier (broadcast UX fixes merged Oct 25: 1d84aa1 / 54acada; UI
  port-gaps round 8c43444 / 76910e6). Older rows above were STALE — do not re-dispatch.
- P0+P1 (v1 scope) = FEATURE COMPLETE per Nina backlog-v2. Plan's next: S5 acceptance
  (Joydip phone-driven end-to-end) + production polish. Then P2 (deferred by Oct-14
  decision): P2.1-2.3 Ads (needs Mira design + Meta permission audit), P2.4 embedded
  signup (externally gated on Meta app review), P2.5 NBS→NBO lead sync (deferred
  "until NBS S3 leads stable").
- Release: new beta-first flow live (beta.nextbizstudio.com pattern); first managed
  prod release = v1.0.0 after S5 acceptance GO.

## 2026-10-27 (evening) — revoke UX (Joydip report: no feedback, row never changed)
- [x] Root cause: sessions/profile GETs had NO Cache-Control → browser heuristic-cached them → DELETE worked (DB row gone) but load() re-served the stale list; zero UI feedback compounded it
- [x] Fix: Cache-Control: no-store on both GET routes + cache:'no-store' client fetches + revokeSession handler with explicit feedback (Revoking… / Session revoked ✓ / error)
- [x] Regression: s4 spec UI path — click Revoke → toast appears → row count drops by 1
- [x] Suite 30/30 (fresh side-DB); merged d0280dd; beta live-verified (header present, revoke 200, row gone)
- [x] Joydip confirmed (Sep-Oct prod testing): broadcast fired, automation worked, WhatsApp send/receive worked — S5 acceptance evidence, prod side
- NOTE: "Revoked" as a visible state/marking = design decision (Mira) if wanted; current behavior = row disappears + toast

## 2026-10-28 — Ads module P2 (STARTED, Joydip's active pick)
| # | Task | Status |
|---|---|---|
| A1 | Meta permission audit (live Graph probe) | done — 0 ad accounts, no ads_read/ads_management → module ships MOCK-BADGED (backlog rule) |
| A2 | Mira design dispatch (registry nbo-ads-module + brief file + Nina routing) | done — brief at kira joyverse file nbo-ads-design-brief.md |
| A3 | Mock ads backend (lib/ads + /api/ads/* + migration 008 + tests) | done (f9343b9) — live on beta, unit 8/8, e2e 34/34 |
| A4 | Mira wireframes P2.1-2.3 + Joydip approval | next (Mira) |
| A5 | UI ports (campaign list, composer, performance) | blocked on A4 |
| A6 | Ads e2e UI + nav unlock + merge + deploy | blocked on A4/A5 |

## 2026-11-01 — r-nbo-ads-ui-port (branch feat/ads-ui-port) — gate ANSWERED 01:53Z Oct 31
Design source (LAW): ~/workspaces/mira/prototypes/nextbiz-one/ads/ (PLAN.md + HANDOFF.md + 3 wireframes). Mock API live (f9343b9). Mock-badge contract on EVERY surface.
| # | Task | Status |
|---|---|---|
| U1 | lib/ads.ts: prev_totals in performance() (additive; delta chips per HANDOFF) | pending |
| U2 | globals.css: ADS shared (qa-btn.ads, btn-ads, badge-mock, mocknote, st, dt-ic) + P2.1 (azone/clist/crow/cdetail/wells/mgrid/arow/banner-review/zerores) + P2.2 (wzone/steps/wform/aprev) + P2.3 (pzone/ptool/stats/stat/chart/btable) + mount (dashcard/ministats/spark/dashlink) + responsive | pending |
| U3 | Shell: active += ads/ads-new/ads-perf; rail mod-ads link /ads + on + parent-chip flyout; panel ads tree (Performance, Campaigns accordion All/Drafts/Needs review w/ live counts); qa slot prop | pending |
| U4 | components/AdsQA.tsx — header qa-btn ads "New Campaign" + 3-tile menu | pending |
| U5 | app/ads/page.tsx + AdsClient.tsx — P2.1 master-detail: pills+counts, search, rows, detail (wells/zerores/banner/settings/adsets), pause/resume drafts-only, demo disabled 409 tooltip, mobile show-detail | pending |
| U6 | app/ads/new/page.tsx + NewCampaignClient.tsx — P2.2 7-step wizard + validation + live preview + counters + draft/submit → redirect | pending |
| U7 | app/ads/performance/page.tsx + PerformanceClient.tsx — P2.3 range chips, 6 stat cards + deltas, series chart + hover tooltip, per-campaign table | pending |
| U8 | app/page.tsx — dashboard Ads mount (dashcard, range 7d, server-side via lib/ads) | pending |
| U9 | tests/e2e/ads-ui.spec.ts — list/search/pills/detail/badge, wizard create draft+submit, perf render+range, dashboard mount, overflow 375/768/1440 | pending |
| U10 | Gates: lint, typecheck, vitest, build, e2e vs nbo_qa_db:5434 standalone :3200 → merge main → push | pending |
| U11 | Beta live-verify one-beta.nextbizstudio.com/ads* + answer r-nbo-ads-ui-port + log | pending |
