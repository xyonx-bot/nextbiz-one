# Demo account (promo videos)

**https://one.nextbizstudio.com** · log in as `demo@nextbizstudio.com`. The password isn't kept in the repo; ask Joydip.

The business is **Mellowmoon Candle Co.**, a made-up handmade candle brand in Bengaluru. Owner: Aditi Rao. Instagram: @mellowmoon.studio. WhatsApp, Instagram and a Meta ad account all show as connected, but they're simulated: nothing ever reaches Meta or a real phone, so anything can be clicked and sent.

## What's in it

| Page | What it shows |
|---|---|
| Dashboard | Unread chats, reply time, automation stats, a 14-day message chart, latest conversations, the last broadcast, and 7-day ad spend |
| Inbox | About 40 WhatsApp chats and 8 Instagram DMs. **Rahul Sharma** (new, unread), **Ananya Iyer** (asks a price, gets the automatic price list), **Kavya Menon** (120 wedding favours), **Rohan Desai** (café wholesale), **Priya Nair** (IG DM, unread) |
| Contacts | 40 contacts with tags (VIP, Wholesale, Wedding order, Repeat buyer…), cities, budgets, opt-in |
| Templates | 7: approved, in review, rejected (with Meta's reason) and draft |
| Broadcasts | Two sent (about 94% delivered, with read and failed counts) and one scheduled for tomorrow |
| Automation | Welcome and away messages, and 4 keyword rules (price list, delivery, gift sets/weddings, studio visit) |
| Social | Profile (18.4k followers), DMs, 15 comments (4 need a reply, 5 auto-answered, 6 replied). Post pictures show as placeholders unless `public/art/demo/post-1.jpg` … `post-6.jpg` are added. |
| Ads | 4 campaigns (2 active), 7- and 30-day performance with growth vs the previous period, and the campaign builder. Publishing creates a paused campaign. Use **Sketch** for the preview; Meta's **Exact** preview needs a real ad account. |
| NextBiz AI | Real (✨ Suggest, Ask AI) and works on this data |

## Live actions that look real on camera

- **Reply in a chat:** shows ✓, then ✓✓ after about 2 s, then blue ticks after about 7 s.
- **Submit a template:** "In review", then **approved about 20 s later** (press the sync ↻ button on Templates).
- **Pause or resume a campaign:** works instantly.
- **Make a customer message arrive:** press **Ctrl+Shift+M** (⌘⇧M on Mac) anywhere in the app. A small panel opens, visible only in this demo workspace. Pick a preset (Rahul, Ananya, Priya, or a "PRICE" comment from Karan), then **Send now**, or **Send in 5s** to close the panel first. The message goes through the real pipeline, so welcome and keyword auto-replies fire. Open pages refresh every 3 s.
  - From a script, in the logged-in page: `await window.nboDemo({ channel: "whatsapp" | "instagram" | "comment", name: "Priya Nair", handle: "priya.nair", text: "Do you ship to Pune?", post: 1 })`
  - Business hours are 9 am–10 pm IST every day. Outside them the away message replies instead of the keyword rule.

## Reset before a recording

Re-running the seed restores everything and makes the times fresh again ("4 min ago"). It deletes and recreates **only** this workspace. Run it on the server, from the repo:

```bash
node scripts/seed-demo.mjs "<password>" | docker exec -i nextbiz_one_db psql -q -U nextbiz -d nextbiz_one -v ON_ERROR_STOP=1
```

The same command with `nextbiz_one_beta_db` seeds it on one-beta.nextbizstudio.com.
