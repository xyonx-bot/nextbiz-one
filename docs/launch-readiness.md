# NextBiz One — launch & Meta App Review readiness

_Status as of v1.10.0 · 15 Nov 2026_

## Verdict

| Goal | Ready? | What's left |
|---|---|---|
| **Real users by invitation** (request access → you approve) | **Yes** | Do the manual check below once on prod. |
| **Meta App Review** (so clients outside your business can connect) | **Code: yes. Meta-side setup: not yet.** | Business verification, Tech Provider, app settings, screencasts (sections 1–3). |
| **Open public sign-up** (anyone, no approval) | **Not yet** | Automatic email (reset links, notices), team members, billing (section 5). |

Approval-gated early access is the right next step: it's ready now, and it's what reels and the first real users need.

---

## 1. Meta dashboard settings (one-time)

Meta App ID **1950786512230644** (Facebook / WhatsApp / Ads) and Instagram app ID **1102941089179743**.

| Setting | Value |
|---|---|
| App icon (1024×1024) | `public/art/app-icon-1024.png` (in the repo; also at https://one.nextbizstudio.com/art/app-icon-1024.png) |
| Category | Business and pages |
| App domains | `one.nextbizstudio.com` |
| Privacy Policy URL | https://one.nextbizstudio.com/privacy |
| Terms of Service URL | https://one.nextbizstudio.com/terms |
| User data deletion: callback URL | https://one.nextbizstudio.com/api/meta/data-deletion |
| User data deletion: instructions URL (if asked) | https://one.nextbizstudio.com/data-deletion |
| Deauthorize callback URL | https://one.nextbizstudio.com/api/meta/deauthorize |
| Instagram app → same deletion and deauthorize URLs | (the callbacks accept both apps' signatures) |
| Facebook Login for Business → Allowed domains for the JavaScript SDK | `https://one.nextbizstudio.com` (we use the JS SDK popup, so no redirect URI is needed) |
| Instagram → OAuth redirect | `https://one.nextbizstudio.com/api/auth/instagram/callback` |
| Webhooks | WhatsApp: `/api/webhooks/whatsapp` · Instagram: `/api/webhooks/instagram` |

**Before submitting:**
1. **Business verification** of NextBiz Studio in Business Settings → Security Center. Meta requires it for advanced access.
2. **Become a Tech Provider** (WhatsApp → Embedded Signup). Then set `WA_ES_CONFIG_ID` on the server; without it, clients can't connect their own number.
3. **Make sure the mailbox `privacy@nextbizstudio.com` exists.** It's on the legal pages and Meta may write to it.
4. **Reviewer login:** create a workspace for Meta's reviewer, with demo data and a working test number. Put the email and password in the review notes.
5. **Switch NextBiz AI to a paid model that doesn't train on data** (Operator → NextBiz AI). The privacy policy says we don't train on data. The current free default (`nvidia/nemotron-3.5-super-vl:free`) may let the model provider train on prompts, which contradicts that.

## 2. Permissions to request, and what each screencast should show

Record at 1080p, in English. Show the Meta login screen granting each permission, then the feature using it, 30–90 seconds each.

| Permission | Why we need it | Screencast: show… |
|---|---|---|
| `whatsapp_business_management` | Connect the client's WhatsApp account (Embedded Signup); create templates; read template statuses | Connections → Connect WhatsApp → finish signup → Templates → create one with an image header → Submit → status syncs |
| `whatsapp_business_messaging` | Receive and send WhatsApp messages | A customer messages → it appears in Inbox → reply. Window closed → send a template from the chat. A broadcast to opted-in contacts. |
| `business_management` | Embedded Signup, and listing the client's ad accounts and Pages | During WhatsApp signup and Connect Meta Ads: pick the business assets |
| `instagram_business_basic` | Show the connected Instagram profile and posts | Connections → Connect Instagram → Social overview with the profile and recent posts |
| `instagram_business_manage_messages` | Read and reply to Instagram DMs | Social → DMs: a DM arrives → reply. Auto-reply to a keyword. |
| `instagram_business_manage_comments` | Read, reply to and hide comments | Social → Comments: reply publicly, send a private reply, keyword auto-reply |
| `ads_management` | Create paused campaigns, upload media, pause and resume | Ads → Create campaign → fill → **Exact** preview → Publish (paused) → Campaigns → resume with confirmation |
| `ads_read` | Performance and spend | Ads → Performance with live numbers |
| `pages_show_list` | Choose which Facebook Page the ad runs from | The Page picker in the ad builder |
| `pages_read_engagement` | Page details needed for ads (name, linked WhatsApp) | The ad builder showing the Page and the WhatsApp-link check |
| `pages_manage_ads` | Create ads for the client's Page | Publishing the ad (same take as `ads_management`) |
| `instagram_basic` | Pick the Instagram account an ad runs from | The Instagram picker in the ad builder |

> **Tip:** request only what the screencasts show. You can add more permissions later; a rejection on one doesn't block the others.

## 3. Things Meta reviewers commonly reject for (now covered)

- [x] Privacy policy is live, specific to the app, and mentions Meta data and deletion
- [x] Terms of service live
- [x] Data-deletion callback works (verifies Meta's signature, deletes, returns a status URL)
- [x] Deauthorize callback works
- [x] Users can delete their workspace and export their data in the app
- [x] Marketing messages only to opted-in contacts; STOP opts out
- [x] Every AI action needs a person to approve it; nothing auto-sends
- [x] Ads are created **paused**; resuming asks for confirmation
- [ ] Business verification, Tech Provider, `WA_ES_CONFIG_ID` (Meta side, see section 1)

## 4. Manual check before inviting people (≈30 minutes on prod)

Use a phone for the customer side.

**Sign-up & account**
- [ ] /request-access → submit → Operator → Requests → approve → log in as that user
- [ ] Forgot password → Operator → Password help → create link → set new password → log in
- [ ] Settings → Login & security: sessions list, "Sign out all others"
- [ ] /privacy, /terms, /data-deletion look right on a phone

**WhatsApp**
- [ ] Message the business number from your phone → shows in Inbox within seconds, with a notification badge
- [ ] Reply; check ✓✓ ticks change to read
- [ ] Wait out or simulate a closed 24-hour window → send a template from the chat → arrives on the phone with its image
- [ ] Templates: create with an image header + quick-reply button → submit → approved within the hour → ⋮ → Send to a contact
- [ ] Contacts: Add contact, Import CSV (try a bad row), Send template from a profile
- [ ] Broadcast to 2 opted-in contacts; reply STOP from one → they become "not opted in"
- [ ] Automation: welcome message, a keyword reply, away hours

**Instagram**
- [ ] DM @nextbizstudio from another account → appears in Social → DMs, with profile picture → reply
- [ ] Comment on a post → Comments → public reply and private reply

**Ads** (keep budgets tiny, everything is created paused)
- [ ] Builder: the **Exact** preview renders for Instagram feed and Story
- [ ] "When the chat opens" greeting + quick questions → **Chat** preview tab
- [ ] Publish (paused) → appears in Campaigns → delete it afterwards

**AI**
- [ ] ✨ Suggest in a chat, Tab to cycle; Ask AI "what needs me today?"

**Mobile:** repeat Inbox, Templates and Contacts on a phone browser.

## 5. Missing features, in priority order

| # | Feature | Why it matters | Size |
|---|---|---|---|
| 1 | **Automatic email** (reset links, approval notice, daily digest), e.g. via Resend or Amazon SES | Removes the manual reset step; needed for open sign-up | S |
| 2 | **Send photos and files in chat** (WhatsApp and Instagram) | Customers expect it; the most common request after text | M |
| 3 | **Team members** (invite staff, roles: owner / agent) | Most businesses have more than one person replying | M |
| 4 | **New-message alerts** (browser notifications and a sound; later a phone app) | Replies are slow if nobody notices new messages | S |
| 5 | **Error tracking and uptime alerts** (Sentry plus a ping monitor) | Know about problems before users tell you | S |
| 6 | **Plans and billing** (Razorpay) | Needed before charging | L |
| 7 | **Public landing page** (`one.nextbizstudio.com` → marketing page, or link from nextbizstudio.com) | Somewhere for reels to send people | S–M |
| 8 | Two-factor sign-in for owners | Security for accounts holding customer data | S |
| 9 | Message search across chats, and saved replies in the composer | Speed for busy inboxes | S |

**Done in v1.10:** Privacy, Terms and Data-deletion pages; Meta deletion and deauthorize callbacks; password help (an operator-sent link); limits on login guessing; security headers; friendly 404 and error pages; robots.txt and sitemap; link-preview card; the 1024 app icon; extra ad permissions for client accounts; motion and polish.
