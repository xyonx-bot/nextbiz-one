# Meta App Review — paste-ready responses

App: 1950786512230644 (NextBiz One) · Site: https://one.nextbizstudio.com
Product: one workspace where a local business answers WhatsApp and Instagram messages and comments, sends approved WhatsApp templates to people who opted in, and runs Meta ads.
Model: the business owner connects their **own** WhatsApp number, Instagram professional account and ad account on Meta's login screens. The app only touches what they connected.

**Every answer below describes something the app does today.** Request only these permissions. Checked against the code on 25 Nov 2026.

## Do not request (the app doesn't use them)

`threads_business_basic` · `manage_app_solution` · `whatsapp_business_manage_events` · Business Asset User Profile Access · **Human Agent** (replies use the normal 24-hour window; no message tag is sent) · `instagram_manage_comments` / `instagram_manage_messages` (the Facebook-Login versions; we use the Instagram-Login ones)

---

## Instagram (Instagram API with Instagram Login)

### instagram_business_basic
> We read the connected professional account's id, username, name, profile picture, follower count and recent posts to show which account is connected (Connections), the Social overview, and which post each comment belongs to. It is also the required base for the two permissions below.

### instagram_business_manage_messages
> Businesses read and answer their Instagram DMs in NextBiz One. Incoming messages arrive through a signature-verified webhook, and recent conversations are loaded when the account is connected. A person types a reply in the inbox and we send it with POST /me/messages inside Instagram's 24-hour window; outside it, sending is blocked. The business can also switch on a welcome message, away message or keyword reply, sent only in answer to a customer's message. When a person replies by hand, automatic replies pause for that chat. Disconnecting stops events and deletes the token; the account's data can be deleted in Connections.

### instagram_business_manage_comments
> Businesses see the comments on their own posts and reply publicly, send one private reply within 7 days, or hide, unhide and delete a comment on Instagram. Optional keyword rules answer matching comments. We only act on media owned by the connected account.

## WhatsApp

### whatsapp_business_management
> During Embedded Signup we read the WhatsApp account and number the business selects and subscribe our webhook to it. In Templates, the business creates message templates (text or media header, buttons), submits them for Meta's review, sees their status and deletes them.

### whatsapp_business_messaging
> Customers' messages arrive in the inbox through a signature-verified webhook, and the business replies inside the 24-hour window. Outside it, only approved templates can be sent. Broadcasts send an approved template only to contacts who opted in; replying STOP opts a contact out at once. Delivery and read status is shown per message and per broadcast recipient.

### business_management
> Needed to list the business assets (WhatsApp account, ad accounts, Pages) the person selects during Embedded Signup and when connecting Meta ads. No changes are made to the business portfolio.

## Ads (request together, only if the screencast shows them)

### ads_read
> We show campaigns with spend, results and status for the ad account the business connected, in Campaigns, Performance and the dashboard.

### ads_management
> The business builds a campaign (audience, budget, creative), previews it with Meta's own preview and publishes it. Campaigns are always created paused; resuming asks for confirmation. They can be paused and resumed. Only the connected ad account is used, and Meta bills it directly.

### pages_show_list
> To let the business choose which of their Facebook Pages an ad runs from.

### pages_read_engagement
> To read the chosen Page's details needed for the ad: its name and whether WhatsApp is linked.

### pages_manage_ads
> To create the ad for the chosen Page when the business publishes a campaign.

### instagram_basic
> To list the Instagram account linked to the Page, so the business can choose it for the ad.

---

## Reviewer instructions

1. Open https://one.nextbizstudio.com/login and sign in with the login in the submission notes (never in this repo).
2. **Connections** → Instagram → "Log in with Instagram" → approve. The card shows the account as Connected.
3. Send a DM to that account from another Instagram account → **Social → Instagram DMs** → reply.
4. Comment on one of its posts → **Social → Comments** → reply publicly, then hide and unhide the comment.
5. **Connections** → Instagram → Disconnect → its chats leave the inbox. Under "Previously connected" → Delete data.

Privacy: https://one.nextbizstudio.com/privacy · Deletion: https://one.nextbizstudio.com/data-deletion

## Before recording

- [ ] Use test accounts only, no real customer data
- [ ] The workspace is clean: no test contacts, drafts or rejected templates
- [ ] 1080p, English; show Meta's login screen granting each permission, then the feature using it
- [ ] Make at least one successful API call per permission in the 30 days before submitting (Meta's dashboard shows a check mark)
