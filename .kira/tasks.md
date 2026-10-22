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
