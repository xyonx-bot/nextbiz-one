# Meta App Review — paste-ready responses
App: 1950786512230644 (NextBiz One) · Site: one.nextbizstudio.com (prod), one-beta.nextbizstudio.com (beta)
Product: NextBiz One — done-for-you WhatsApp + Instagram + Ads workspace for local businesses (India).
Model: the business owner ("operator") connects their OWN WhatsApp number, Instagram professional account, Facebook Page and ad account through our app. We only ever touch assets they explicitly connected.

---

## Tier question — Marketing API Access Tier
> We request the access tier needed for ads_read + ads_management so operators can view and manage campaigns inside their own ad account (e.g. act_1724784822411857 "NextBiz One Ads") from the /ads dashboard. We never run ads on Meta assets the user did not connect; we create/edit/pause campaigns only inside the ad account linked to their connected Page. Test calls already performed with our system-user token: `GET /v21.0/act_1724784822411857` and `GET /v21.0/act_1724784822411857/campaigns` → HTTP 200. If Advanced Access is required, we will complete Business Verification.

## business_asset_user_profile_access (Business Asset User Profile Access)
> Used to read the profile (id, name) of business assets the operator connected (Pages, ad accounts, WABA, IG account) so Settings can label them correctly, e.g. "NextBiz One Ads (act_…)". Read-only; no targeting, no sharing with third parties.

## instagram_business_basic
> Base permission for all Instagram Business features. We use it to read the connected professional account's profile (`GET /v21.0/me?fields=id,username,name`) after Instagram Business Login and to display the account in Settings → Connections. Required as the parent of instagram_business_manage_messages / instagram_business_manage_comments.

## instagram_business_manage_messages
> Core feature — Instagram DMs. Our signature-verified webhook `https://one.nextbizstudio.com/api/webhooks/instagram` receives incoming DM events (X-Hub-Signature-256 checked, invalid → 401) and stores them; the operator reads and replies from the NextBiz One inbox via `POST /{ig-user-id}/messages`. Screencast: Connect Instagram → Meta sends test webhook event (Webhooks → Test) → event visible in app → reply sent via Graph Explorer with the connected token.

## instagram_manage_comments
> Manage comments on the business's own media: `GET /{media-id}/comments` to list and `POST /{comment-id}/replies` to reply (and hide spam). Submitted together with instagram_basic as the form requires. We only touch comments on media owned by the connected IG account.

## threads_business_basic
> Read-only profile read of the connected Threads business profile (if the client has one) to show its connection status in Settings. No posting.

## pages_show_list
> `GET /me/accounts` to list the operator's Facebook Pages so they can pick which Page to connect for ads/IG management. Read-only; required parent for pages_manage_ads and pages_read_engagement.

## pages_read_engagement
> Read Page engagement metrics (reach/impressions on posts) for the reporting view alongside ads. Parent pages_show_list is included in this submission.

## pages_manage_ads
> Create, edit, pause and set budgets on ad campaigns in the Page-connected ad account from the /ads UI (`POST /act_{id}/campaigns`, `POST /act_{id}/adsets`, …). Only the connected ad account is touched. pages_show_list is included as required.

## ads_read
> Read campaign + insights (spend, results, status) from the connected ad account to render the /ads performance table. Test call already made with system-user token: `GET /v21.0/act_1724784822411857/campaigns?fields=name,status,spend` → 200.

## ads_management
> Full campaign lifecycle from the /ads dashboard: create draft campaign → preview → publish → pause. Scoped to the operator's own ad account. pages_read_engagement included as required. Advanced Access / Business Verification will be completed if prompted.

## whatsapp_business_messaging
> Send + receive WhatsApp for the client's business number. Inbound: webhook `/api/webhooks/whatsapp` (signature-verified) — ALREADY LIVE in production since 25 Oct 2026, a real template broadcast was delivered to a test number. Outbound: `POST /{phone-number-id}/messages` with approved templates and free-form replies inside the 24h customer-service window. Screencast shows prod: send template → recipient receives → reply → appears in inbox.

## whatsapp_business_manage_events
> Receive message-status webhook events (sent / delivered / read receipts) so the dashboard can show delivery status per campaign. Event payloads only; no extra message content is stored beyond status.

## whatsapp_business_management
> Read WABA + phone-number config (display name, quality rating, status, template list) to show number health in Settings and to manage message templates used by campaigns.

## business_management
> Enumerate the business assets (ad accounts, Pages, WABA, IG accounts) the operator owns, to populate the Connections UI and to scope all API calls strictly to their own assets. No cross-business access.

## manage_app_solution
> Manage webhook subscriptions / app-solution config for the assets the operator connected (e.g. subscribing our webhook URL to their IG account so DM events flow). Only their connected assets.

## public_profile
> Basic Facebook profile (name, id) of the person logging in, used to create and label their workspace account. No posting, no friend-list access.

---

## Dependency notes (form requirements)
- instagram_manage_comments requires **instagram_basic** → also request instagram_basic in the same submission.
- pages_manage_ads requires **pages_show_list** → included.
- pages_read_engagement requires **pages_show_list** → included.
- ads_management requires **pages_read_engagement** → included.

## "Required API test calls" — checklist (do in Graph API Explorer, app selected, system-user token)
- [x] `GET /v21.0/me` (token debug: scopes list)
- [x] `GET /v21.0/2308850409942395` (WABA read) → 200
- [x] `GET /v21.0/act_1724784822411857` + `/campaigns` (ads_read) → 200
- [ ] `POST /{phone-id}/messages` — template test send to own test number (whatsapp_business_messaging)
- [ ] Webhook "Test" button on instagram + whatsapp fields → event received (webhook live, verified)
- [ ] `GET /me/accounts` (pages_show_list)
- [ ] `GET /{ig-user-id}` after connect (instagram_business_basic)
- [ ] `POST /act_{id}/campaigns` dry-run / draft campaign then delete (ads_management)

## Screencast plan (end-to-end UX)
1. Login to one-beta.nextbizstudio.com → /onboarding 3 steps.
2. Settings → Connections: WhatsApp number shows LIVE connected (prod WABA); click Connect Instagram → OAuth dialog → approve (dev mode: you are admin).
3. Meta Dashboard → Webhooks → Test → instagram message event → refresh app, event visible.
4. /ads: create campaign → preview → (beta shows mock badge until live; note this in the video).
5. Prod WhatsApp: send template to test number → delivered receipt webhook → status ticks in UI.
Record 2–3 min, 1080p, no real customer data — use test numbers/accounts only.
