# NextBiz One

WhatsApp-first client messaging platform. **Single-tier Next.js 15 + docker
Postgres 16** (NBS-mirror stack, locked Oct 18 — see Nina's project dir
technical-plan.md). Design source of truth: Mira's package
`~/workspaces/mira/prototypes/nextbiz-one/` (design-sheet.html is LAW;
wireframe-match rule applies — missing wireframe = STOP + request via nina).

## S0 (current)
Foundation: auth gate (operator bootstrap via env), WhatsApp webhook
(HMAC-verified inbound → contacts/conversations/messages), shell v4.3,
backup + deploy skeletons.

**Acceptance:** send "hi" from the connected WhatsApp number → row appears
in `messages`.

## Dev
```
cp .env.example .env   # fill DATABASE_URL + operator creds
docker exec -i <pg> psql ... < db/migrations/001-core.sql
npm install && npm run build
cp -r .next/static .next/standalone/.next/static
PORT=3200 node .next/standalone/server.js
```

## Rules
- Branch discipline: feat/ per sprint, tests green, self-merge; irreversible
  steps (schema drops, auth changes) stop for Joydip.
- Business logic never imports React; routes never contain SQL.
- "WABA" never appears client-facing. No billing in-app. Mock data always badged.
