#!/usr/bin/env node
/**
 * Demo workspace for promo videos: "Mellowmoon Candle Co.", a small candle brand in Bengaluru.
 * Prints SQL that (re)creates the whole workspace — contacts, WhatsApp chats, Instagram DMs and comments,
 * templates, broadcasts, automation, and a simulated Meta ad account. Every time is relative to now(),
 * so re-running it makes the data fresh again ("4 min ago") before a recording.
 *
 *   node scripts/seed-demo.mjs [password] | docker exec -i nextbiz_one_db psql -U nextbiz -d nextbiz_one -v ON_ERROR_STOP=1
 *
 * All channel ids start with "demo", so nothing ever reaches Meta (see lib/demo.ts). Re-running deletes
 * and recreates only this workspace. The login is printed to stderr.
 */
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const WS_NAME = "Mellowmoon Candle Co.";
const EMAIL = "demo@nextbizstudio.com";
const PASSWORD = process.argv[2] || `Mellow-${randomBytes(4).toString("hex")}`;
const PHONE_ID = "demo-wa-mellowmoon", WABA_ID = "demo-waba-mellowmoon", IG_ID = "demo-ig-mellowmoon", ACT = "act_demo_mellowmoon";

let seed = 20261115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const q = (v) => v === null || v === undefined ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const arr = (a) => `ARRAY[${a.map(q).join(",")}]::text[]`;
const ago = (min) => `now() - interval '${Math.round(min)} minutes'`;
const json = (o) => `${q(JSON.stringify(o))}::jsonb`;
const H = 60, D = 1440;
let mid = 0;
const msgId = (k) => `demo-${k}-seed-${++mid}`;
const out = [];
const sql = (s) => out.push(s.trim().replace(/\s+\n/g, "\n") + ";");

const ws = randomUUID(), user = randomUUID();
out.push("BEGIN;");
// start clean: this workspace only
sql(`DELETE FROM users WHERE email = ${q(EMAIL)}`);
sql(`DELETE FROM workspaces WHERE name = ${q(WS_NAME)}`);

sql(`INSERT INTO workspaces (id, name, about, created_at) VALUES (${q(ws)}, ${q(WS_NAME)}, ${q("Handmade soy candles and home fragrance from Bengaluru. Ships across India in 3–5 days (next day in Bengaluru). Gift sets, wedding favours, and wholesale for cafés and boutiques. Prices: small jar ₹449, large jar ₹899, Monsoon gift set ₹1,299. Free shipping above ₹999.")}, ${ago(120 * D)})`);
sql(`INSERT INTO users (id, workspace_id, email, password_hash, display_name, is_operator, is_approved, email_digest, created_at)
     VALUES (${q(user)}, ${q(ws)}, ${q(EMAIL)}, ${q(bcrypt.hashSync(PASSWORD, 10))}, 'Aditi Rao', false, true, false, ${ago(120 * D)})`);

/* ── channels (simulated) ── */
sql(`INSERT INTO waba_connections (workspace_id, phone_number_id, business_account_id, display_name, status, created_at)
     VALUES (${q(ws)}, ${q(PHONE_ID)}, ${q(WABA_ID)}, 'Mellowmoon Candle Co. (918045671234)', 'connected', ${ago(110 * D)})`);
const igAcct = randomUUID();
sql(`INSERT INTO ig_accounts (id, workspace_id, ig_user_id, username, display_name, live, scopes, webhook_subscribed, expires_at, comments_synced_at, dms_synced_at, created_at, updated_at)
     VALUES (${q(igAcct)}, ${q(ws)}, ${q(IG_ID)}, 'mellowmoon.studio', 'Mellowmoon Candle Co.', true,
             ${arr(["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments"])}, true, now() + interval '50 days', now(), now(), ${ago(100 * D)}, now())`);
sql(`INSERT INTO ads_connections (workspace_id, ad_account_id, name, currency, timezone, uses_system_token, connected_by, created_at, updated_at)
     VALUES (${q(ws)}, ${q(ACT)}, 'Mellowmoon Candle Co.', 'INR', 'Asia/Kolkata', false, ${q(EMAIL)}, ${ago(60 * D)}, now())`);

/* ── automation ── */
const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, ["09:00", "22:00"]])); // wide hours: keyword replies (not the away message) show whenever a video is recorded
sql(`INSERT INTO automation_settings (workspace_id, welcome_enabled, welcome_text, away_enabled, away_text, business_hours, ig_welcome_enabled, ig_welcome_text, ig_away_enabled, ig_away_text)
     VALUES (${q(ws)}, true, ${q("Hi! 👋 Thanks for messaging Mellowmoon. Every candle is hand-poured in our Bengaluru studio — ask us anything, a real person replies within the hour.")},
             true, ${q("We're closed for the night 🌙 We'll reply first thing at 9 am. Meanwhile, our gift sets are here: mellowmoon.example/gifts")}, ${json(hours)},
             true, ${q("Hey! 💛 Thanks for the DM — we'll get back to you shortly. Type PRICE for our price list.")}, false, null)`);
const RULES = [
  ["Price list", ["price", "prices", "cost", "rate", "how much"], "Here's our price list 🕯️\n• Small jar (100 g) — ₹449\n• Large jar (250 g) — ₹899\n• Monsoon gift set (3 minis) — ₹1,299\nFree shipping above ₹999!", "Sent you the prices in DM 💌", 146],
  ["Delivery", ["delivery", "deliver", "shipping", "ship", "courier"], "We ship across India in 3–5 days 🚚 Bengaluru orders arrive next day. You'll get a tracking link on WhatsApp as soon as it's out.", "We ship all over India! Check your DMs 📦", 89],
  ["Gift sets & weddings", ["gift", "hamper", "wedding", "favours", "favors", "bulk"], "We love gifting! 🎁 Gift sets start at ₹1,299, and we make custom wedding favours from 50 pieces (with your names on the label). Tell us the date and quantity and we'll send a quote.", null, 54],
  ["Store visit", ["address", "location", "store", "visit", "studio"], "Our studio is in Indiranagar, Bengaluru — open Mon–Sat, 10 am to 7 pm. Drop by to smell everything before you buy ✨", null, 21],
];
const ruleIds = {};
for (const [name, kw, reply, pub, fired] of RULES) {
  const id = randomUUID(); ruleIds[name] = id;
  sql(`INSERT INTO keyword_rules (id, workspace_id, name, keywords, reply, enabled, send_once, fired_count, last_fired_at, on_whatsapp, on_instagram_dm, on_instagram_comment, comment_public_reply, created_at)
       VALUES (${q(id)}, ${q(ws)}, ${q(name)}, ${arr(kw)}, ${q(reply)}, true, false, ${fired}, ${ago(rnd() * 300 + 20)}, true, true, ${!!pub}, ${q(pub)}, ${ago(90 * D)})`);
}
for (const [qq, a] of [
  ["Are your candles soy wax?", "Yes — 100% natural soy wax with cotton wicks. No paraffin, ever."],
  ["How long does a candle burn?", "Small jars burn for about 25 hours, large jars about 55 hours."],
  ["Do you do cash on delivery?", "Yes, COD is available across India for orders under ₹5,000."],
  ["Can I return a candle?", "If anything arrives damaged, send us a photo within 48 hours and we'll replace it free."],
]) sql(`INSERT INTO faq_pairs (workspace_id, question, answer) VALUES (${q(ws)}, ${q(qq)}, ${q(a)})`);

/* ── templates ── */
const T = {};
const tpl = (key, name, cat, status, body, vars, extra = {}) => {
  const id = randomUUID(); T[key] = { id, body };
  sql(`INSERT INTO templates (id, workspace_id, name, meta_name, category, language, body, variables, status, meta_template_id, rejection_reason, header_format, header, footer, buttons_json, created_at, updated_at)
       VALUES (${q(id)}, ${q(ws)}, ${q(key)}, ${q(status === "draft" ? null : key)}, ${q(cat)}, 'en', ${q(body)}, ${arr(vars)}, ${q(status)}, ${q(status === "draft" ? null : `demo-seed-${key}`)},
               ${q(extra.reason ?? null)}, ${q(extra.header ? "TEXT" : "NONE")}, ${q(extra.header ?? null)}, ${q(extra.footer ?? null)}, ${json(extra.buttons ?? [])}, ${ago(extra.age ?? 30 * D)}, ${ago((extra.age ?? 30 * D) - 60)})`);
};
tpl("order_confirmed", "Order confirmed", "UTILITY", "approved", "Hi {{1}}, your order #{{2}} is confirmed 🕯️ We'll hand-pour it and ship within 2 days. Track it anytime here: {{3}}", ["Customer name", "Order number", "Tracking link"], { footer: "Mellowmoon Candle Co.", age: 80 * D });
tpl("monsoon_launch", "Monsoon Collection launch", "MARKETING", "approved", "Hi {{1}}, petrichor, wet jasmine and cedar 🌧️ Our new Monsoon Collection is live — three scents for slow rainy evenings. Use code RAIN15 for 15% off this week.", ["Customer name"], { header: "The Monsoon Collection is here", footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Shop the collection", url: "https://mellowmoon.example/monsoon" }, { type: "QUICK_REPLY", text: "Send me prices" }], age: 9 * D });
tpl("gift_sets_back", "Gift sets back in stock", "MARKETING", "approved", "Good news, {{1}}! 🎁 Our gift sets are back — three minis and a matchbox, wrapped and ready to give. They sold out in 4 days last time.", ["Customer name"], { footer: "Reply STOP to opt out", buttons: [{ type: "QUICK_REPLY", text: "Reserve one" }, { type: "QUICK_REPLY", text: "Not now" }], age: 16 * D });
tpl("out_for_delivery", "Out for delivery", "UTILITY", "approved", "Hi {{1}}, your Mellowmoon order is out for delivery today 🚚 Our courier partner will call before arriving.", ["Customer name"], { age: 70 * D });
tpl("cart_reminder", "Cart reminder", "MARKETING", "pending", "Hi {{1}}, you left {{2}} in your cart 🕯️ It's still waiting for you — and shipping is free above ₹999.", ["Customer name", "Product"], { age: 20 });
tpl("review_request", "Review request", "UTILITY", "rejected", "Hi {{1}}! Loved your candle? Leave us a review and get 20% off your next order 💛", ["Customer name"], { reason: "Utility templates can't include offers — submit it as Marketing instead.", age: 4 * D });
tpl("diwali_preorders", "Diwali pre-orders", "MARKETING", "draft", "Hi {{1}}, Diwali pre-orders are open 🪔 Reserve our festive gift boxes before 25 October and get free gift wrapping.", ["Customer name"], { age: 2 * D });

/* ── contacts ── */
const CITIES = ["Bengaluru", "Bengaluru", "Bengaluru", "Mumbai", "Pune", "Hyderabad", "Chennai", "Delhi", "Kochi", "Mysuru"];
const PEOPLE = [
  // name, tags, company, interested_in, budget, opt_in
  ["Rahul Sharma", ["New lead", "Gift sets"], null, "Monsoon gift set ×3", "₹3,000–4,000", true],
  ["Ananya Iyer", ["Repeat buyer"], null, "Large sandalwood jar", "₹1,000–2,000", true],
  ["Kavya Menon", ["Wedding order", "VIP"], null, "120 wedding favours", "₹25,000+", true],
  ["Rohan Desai", ["Wholesale"], "Brew & Bloom Café", "Monthly café candles", "₹15,000/month", true],
  ["Sneha Kulkarni", ["Repeat buyer", "VIP"], null, "Monsoon Collection", "₹2,000–3,000", true],
  ["Arjun Reddy", ["Repeat buyer"], null, "Sea Salt large jar", "₹1,000", true],
  ["Meera Pillai", ["New lead"], null, "Custom scent for her studio", "₹5,000", true],
  ["Vikram Singh", ["Gift sets"], "Northwind Consulting", "40 corporate gift boxes", "₹50,000", true],
  ["Ishita Banerjee", ["Repeat buyer"], null, "Catalogue", null, true],
  ["Neha Gupta", ["New lead"], null, "Jasmine small jar", "₹500", false],
  ["Aditya Joshi", [], null, "Gift for his mother", "₹1,500", true],
  ["Pooja Patel", ["Repeat buyer"], null, "Refill wax", null, true],
  ["Siddharth Rao", ["Wholesale"], "The Linen Loft", "Boutique shelf stock", "₹30,000", true],
  ["Riya Kapoor", ["Gift sets"], null, "Birthday hamper", "₹2,500", true],
  ["Nikhil Bhat", [], null, null, null, true],
  ["Tanvi Shah", ["Repeat buyer"], null, "Cedar & Smoke", null, true],
  ["Harsh Agarwal", [], null, null, null, false],
  ["Divya Krishnan", ["VIP", "Repeat buyer"], null, "Everything new", "₹5,000+", true],
  ["Varun Malhotra", ["Gift sets"], null, "Anniversary gift", "₹2,000", true],
  ["Sanya Arora", [], null, null, null, true],
  ["Kabir Khanna", ["New lead"], null, "Reed diffusers", null, true],
  ["Aisha Khan", ["Repeat buyer"], null, "Rose & Oud", "₹1,500", true],
  ["Manish Tiwari", ["Wholesale"], "Casa Interiors", "Staging candles", "₹12,000", true],
  ["Shreya Ghosh", [], null, null, null, true],
  ["Dev Chopra", ["New lead"], null, null, null, false],
  ["Lakshmi Narayanan", ["Repeat buyer"], null, "Temple jasmine", null, true],
  ["Farhan Qureshi", ["Gift sets"], null, "Eid gift boxes ×10", "₹12,000", true],
  ["Zoya Siddiqui", [], null, null, null, true],
  ["Gaurav Saxena", [], null, null, null, true],
  ["Nandini Hegde", ["Repeat buyer"], null, "Sandalwood", null, true],
  ["Yash Jain", [], null, null, null, false],
  ["Ritika Bose", ["Wedding order"], null, "Mehendi favours ×60", "₹15,000", true],
  ["Omkar Patil", [], null, null, null, true],
  ["Simran Kaur", ["Repeat buyer"], null, "Vanilla Chai", null, true],
  ["Abhishek Nair", [], null, null, null, true],
  ["Tara D'Souza", ["VIP"], null, "Monthly candle box", "₹1,200/month", true],
  ["Kunal Sethi", [], null, null, null, true],
  ["Priyanka Das", ["New lead"], null, "Housewarming gift", "₹2,000", true],
  ["Mohit Bansal", [], null, null, null, true],
  ["Swati Mishra", ["Repeat buyer"], null, "Lavender", null, true],
];
const C = {};
for (const [i, [name, tags, company, interested, budget, opt]] of PEOPLE.entries()) {
  const id = randomUUID();
  const wa = `91${pick(["98", "97", "99", "88", "90", "70", "81"])}${String(Math.floor(rnd() * 1e8)).padStart(8, "0")}`;
  C[name] = { id, wa };
  sql(`INSERT INTO contacts (id, workspace_id, wa_id, name, opt_in, tags, company, location, interested_in, budget, source, created_at)
       VALUES (${q(id)}, ${q(ws)}, ${q(wa)}, ${q(name)}, ${opt}, ${arr(tags)}, ${q(company)}, ${q(i < 8 ? (i === 3 || i === 7 ? "Bengaluru" : CITIES[i]) : pick(CITIES))}, ${q(interested)}, ${q(budget)},
               ${q(i % 9 === 4 ? "import" : "whatsapp")}, ${ago(i < 14 ? (i + 1) * 2.3 * D : (20 + rnd() * 90) * D)})`);
}

/* ── WhatsApp chats ── [dir, text, minutes ago, extra] ── */
const ME = "out", THEM = "in";
const CHATS = {
  "Rahul Sharma": { unread: true, msgs: [[THEM, "Hi! Is the Monsoon gift set still available? Need 3 for Friday 🙏", 4]] },
  "Ananya Iyer": { unread: true, msgs: [
    [THEM, "Hi, what's the price of the large sandalwood candle?", 26], [ME, RULES[0][2], 26, { auto: "Price list" }],
    [THEM, "Perfect, I'll take 2. Can you deliver by Saturday? I'm in Koramangala", 17]] },
  "Kavya Menon": { msgs: [
    [THEM, "Hi! I'm getting married on 14 December 💍 Can you make 120 small candles as wedding favours?", 3 * H + 10], [ME, RULES[2][2], 3 * H + 10, { auto: "Gift sets & weddings" }],
    [ME, "Congratulations Kavya! 🎉 Yes, we'd love to. For 120 pieces in our 50 g tins it's ₹180 each, with a custom label with both your names.", 3 * H - 5],
    [THEM, "That sounds lovely. Can the label say \"Kavya & Rohit · 14.12\"?", 2 * H + 40],
    [ME, "Absolutely. I'll send you 2 label designs by tomorrow evening 💛", 2 * H + 32],
    [THEM, "Amazing, thank you!! Which scent would you suggest for a winter wedding?", 68],
    [ME, "Cedar & Smoke or Vanilla Chai — both feel warm and cosy. I can courier you a sample of each before you decide.", 61]] },
  "Rohan Desai": { msgs: [
    [THEM, "Hey, this is Rohan from Brew & Bloom Café. We'd like candles for all 12 tables, refilled every month.", 6 * H], [ME, "Hi Rohan! Love that idea ☕ For 12 large jars a month we can do ₹650 each (instead of ₹899), delivered on the 1st.", 5 * H + 30],
    [THEM, "Great. Can we try something coffee-scented?", 5 * H], [ME, "We have Vanilla Chai, and our Espresso Bean is launching next week. I'll bring both when we drop the first batch.", 4 * H + 50],
    [THEM, "Deal 🤝 Send me the invoice please", 3 * H + 20], [ME, "Done — invoice sent to rohan@brewandbloom.example. First delivery on Monday!", 3 * H + 5]] },
  "Sneha Kulkarni": { msgs: [
    [ME, "Hi Sneha, your order #MM-2741 is confirmed 🕯️ We'll hand-pour it and ship within 2 days. Track it anytime here: mellowmoon.example/t/2741", 9 * H, { tpl: "order_confirmed" }],
    [THEM, "Yay thank you!! Can't wait 🥰", 8 * H + 40], [ME, "Thank you for ordering again 💛 We've added a free mini of Petrichor for you.", 8 * H + 30], [THEM, "You guys are the best", 8 * H + 25]] },
  "Arjun Reddy": { msgs: [
    [THEM, "Hi, I ordered on Monday, where's my order?", 22 * H], [ME, "Hi Arjun! It's with Delhivery and arrives tomorrow. Tracking: mellowmoon.example/t/2702", 21 * H + 50],
    [THEM, "Got it, thanks for the quick reply 👍", 21 * H + 40]] },
  "Meera Pillai": { msgs: [
    [THEM, "Do you make custom scents? I run a yoga studio and want a signature smell", 27 * H], [ME, "We do! 🧘‍♀️ We'll make 3 test blends for you to pick from. Most studios like something with lemongrass or sandalwood.", 26 * H + 30],
    [THEM, "Lemongrass + a bit of mint would be perfect", 26 * H], [ME, "Lovely combination. Samples will be ready Thursday — shall I send them to the studio?", 25 * H + 45], [THEM, "Yes please, Indiranagar 12th Main", 25 * H + 30]] },
  "Vikram Singh": { msgs: [
    [THEM, "Hello, we need 40 corporate gift boxes for our clients this Diwali. Do you do company branding?", 2 * D + 5 * H], [ME, "Hi Vikram! Yes — we can add your logo on the box sleeve. For 40 boxes it's ₹1,150 each including branding.", 2 * D + 4 * H],
    [THEM, "Sounds good, let me check with my team and get back.", 2 * D + 3 * H]] },
  "Ishita Banerjee": { msgs: [
    [ME, "Hi Ishita, petrichor, wet jasmine and cedar 🌧️ Our new Monsoon Collection is live — three scents for slow rainy evenings. Use code RAIN15 for 15% off this week.", 6 * D, { tpl: "monsoon_launch" }],
    [THEM, "Send me prices", 6 * D - 30], [ME, RULES[0][2], 6 * D - 30, { auto: "Price list" }], [THEM, "Ordering the gift set now 😍", 6 * D - 50]] },
  "Neha Gupta": { msgs: [[THEM, "Hi do you have the jasmine one in small size?", 26 * H], [ME, "Yes we do! Small Jasmine is ₹449. Shall I reserve one for you?", 25 * H + 50], [THEM, "Let me think and tell you", 25 * H + 30]] },
  "Aditya Joshi": { msgs: [
    [THEM, "Hi, want to gift something to my mom for her birthday", 13 * H + 20], [ME, "We're closed for the night 🌙 We'll reply first thing at 9 am. Meanwhile, our gift sets are here: mellowmoon.example/gifts", 13 * H + 20, { away: true }],
    [ME, "Good morning Aditya! A gift set with Rose & Oud, Jasmine and Vanilla Chai is our favourite for moms 💐 ₹1,299 with gift wrap.", 4 * H + 30], [THEM, "Perfect, booking it", 4 * H]] },
  "Pooja Patel": { msgs: [[THEM, "Do you sell refill wax for the jars?", 5 * D], [ME, "Not yet, but send the empty jars back and we'll refill them for ₹299 ♻️", 5 * D - 20], [THEM, "Oh that's so nice", 5 * D - 25]] },
  "Siddharth Rao": { msgs: [[THEM, "Hi, I own The Linen Loft in Pune. Interested in stocking your candles.", 8 * D], [ME, "Hi Siddharth! We'd love to be on your shelves. Sharing our wholesale catalogue now 📄", 8 * D - 15], [THEM, "Received, will place a first order next week", 8 * D - 70]] },
  "Riya Kapoor": { msgs: [[THEM, "Is there a birthday hamper?", 11 * D], [ME, "Yes! Our birthday hamper has 2 jars, a matchbox and a handwritten card — ₹1,899 🎂", 11 * D - 10], [THEM, "Ordering for my sister 💕", 11 * D - 30]] },
};
// lighter chats spread across the last 4 weeks (fills the dashboard charts)
const SHORT = [
  [["Do you deliver to Chennai?", "in"], [RULES[1][2], "out", "Delivery"], ["Thanks!", "in"]],
  [["Is it soy wax?", "in"], ["Yes — 100% natural soy wax with cotton wicks 🌱", "out"]],
  [["Hi, what's the price?", "in"], [RULES[0][2], "out", "Price list"], ["Ok ordering the large one", "in"]],
  [["Can I pay cash on delivery?", "in"], ["Yes, COD is available across India for orders under ₹5,000 👍", "out"]],
  [["Loved the candle, it smells amazing 😍", "in"], ["That made our day, thank you! 💛", "out"]],
  [["Where is your store?", "in"], [RULES[3][2], "out", "Store visit"]],
  [["Any discount on 3 jars?", "in"], ["Buy any 3 large jars and get 10% off — I'll apply it to your order.", "out"], ["Great, thanks", "in"]],
];
const rest = PEOPLE.map((p) => p[0]).filter((n) => !CHATS[n]);
rest.forEach((n, k) => {
  const days = k < 14 ? 1.5 + k * 0.85 : 15 + (k - 14) * 1.3;
  const s = SHORT[k % SHORT.length]; let t = days * D + 9 * H * rnd();
  CHATS[n] = { msgs: s.map(([text, dir, auto]) => { const m = [dir, text, t, auto ? { auto } : {}]; t -= dir === "in" ? 3 + rnd() * 6 : 1 + rnd() * 12; return m; }) };
});

// first-time customers got the welcome message right after their first message
const WELCOME = "Hi! 👋 Thanks for messaging Mellowmoon. Every candle is hand-poured in our Bengaluru studio — ask us anything, a real person replies within the hour.";
for (const n of ["Kavya Menon", "Rohan Desai", "Meera Pillai", "Vikram Singh", "Rahul Sharma"]) {
  const first = CHATS[n].msgs[0];
  CHATS[n].msgs.splice(1, 0, [ME, WELCOME, first[2] - 0.1, { welcome: true }]);
}
// automatic replies land a few seconds after the message that triggered them (and after the welcome)
for (const chat of Object.values(CHATS)) chat.msgs.forEach((m, i) => { if (m[3]?.auto || m[3]?.away) { const prev = chat.msgs[i - 1]; if (prev && m[2] >= prev[2]) m[2] = prev[2] - 0.15; } });
const autoLog = [];
for (const [name, chat] of Object.entries(CHATS)) {
  const conv = randomUUID(), c = C[name];
  const ins = chat.msgs.filter((m) => m[0] === THEM).map((m) => m[2]);
  const lastIn = ins.length ? Math.min(...ins) : null;
  sql(`INSERT INTO conversations (id, workspace_id, contact_id, last_inbound_at, last_read_at, welcome_sent_at, created_at)
       VALUES (${q(conv)}, ${q(ws)}, ${q(c.id)}, ${lastIn === null ? "NULL" : ago(lastIn)}, ${chat.unread ? "NULL" : "now()"}, ${ago(Math.max(...chat.msgs.map((m) => m[2])))}, ${ago(Math.max(...chat.msgs.map((m) => m[2])) + 1)})`);
  for (const [dir, text, min, extra = {}] of chat.msgs) {
    const tId = extra.tpl ? T[extra.tpl].id : null;
    const status = dir === "in" ? "received" : min < 3 ? "delivered" : "read";
    sql(`INSERT INTO messages (workspace_id, conversation_id, direction, wa_message_id, type, body, raw, status, template_id, created_at)
         VALUES (${q(ws)}, ${q(conv)}, ${q(dir)}, ${q(msgId(dir))}, ${q(tId ? "template" : "text")}, ${q(text)}, ${json(extra.auto ? { automation: "keyword", rule: extra.auto } : extra.away ? { automation: "away" } : extra.welcome ? { automation: "welcome" } : extra.tpl ? { template: extra.tpl } : {})}, ${q(status)}, ${q(tId)}, ${ago(min)})`);
    if (extra.auto) autoLog.push(["keyword", c.id, ruleIds[extra.auto], `rule "${extra.auto}" sent`, min]);
    if (extra.away) autoLog.push(["away", c.id, null, "away reply: sent", min]);
    if (extra.welcome) autoLog.push(["welcome", c.id, null, "welcome sent", min]);
  }
}

/* ── broadcasts ── */
const opted = PEOPLE.filter((p) => p[5]).map((p) => C[p[0]].id);
const bc = (name, key, status, sentMin, n, mix) => {
  const id = randomUUID();
  sql(`INSERT INTO broadcasts (id, workspace_id, template_id, name, audience_filter, status, scheduled_at, sent_at, created_at)
       VALUES (${q(id)}, ${q(ws)}, ${q(T[key].id)}, ${q(name)}, ${json({ optInOnly: true })}, ${q(status)}, ${status === "scheduled" ? `date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' + interval '1 day 10 hours'` : "NULL"}, ${status === "done" ? ago(sentMin) : "NULL"}, ${ago(Math.max(sentMin, 0) + 90)})`);
  if (status !== "done") return;
  opted.slice(0, n).forEach((cid, i) => {
    const st = i < mix[0] ? "read" : i < mix[0] + mix[1] ? "delivered" : i < mix[0] + mix[1] + mix[2] ? "sent" : "failed";
    sql(`INSERT INTO broadcast_recipients (broadcast_id, contact_id, status, wa_message_id, error_code, error_raw, sent_at)
         VALUES (${q(id)}, ${q(cid)}, ${q(st)}, ${q(st === "failed" ? null : msgId("bc"))}, ${st === "failed" ? 131026 : "NULL"}, ${q(st === "failed" ? "Message undeliverable — this number isn't on WhatsApp" : null)}, ${ago(sentMin - i * 0.05)})`);
  });
};
bc("Monsoon Collection launch", "monsoon_launch", "done", 6 * D, 34, [24, 7, 1]);
bc("Gift sets are back", "gift_sets_back", "done", 13 * D, 30, [19, 8, 1]);
bc("Weekend sale reminder", "gift_sets_back", "scheduled", -1, 0, []);

/* ── Instagram DMs ── */
const IG = {
  "priya.nair": ["Priya Nair", true, [["in", "Hey! Do you ship to Pune? Loved the new collection 😍", 7], ["out", "Hey! 💛 Thanks for the DM — we'll get back to you shortly. Type PRICE for our price list.", 7, "automation"]]],
  "tanvi.shah": ["Tanvi Shah", false, [["in", "Is Cedar & Smoke back in stock?", 52], ["out", "It is! Restocked yesterday 🔥 Want me to keep one aside for you?", 41, "app"], ["in", "Yes please, the large one", 37], ["out", "Done ✅ Sending you the payment link on WhatsApp.", 33, "app"]]],
  "kabir.k": ["Kabir Khanna", true, [["in", "do you make reed diffusers?", 95], ["in", "for a 2BHK", 94]]],
  "aisha.khan": ["Aisha Khan", false, [["in", "price?", 5 * H], ["out", RULES[0][2], 5 * H, "automation"], ["in", "The Rose & Oud is so pretty. Ordering!", 4 * H + 30], ["out", "Yay! It's one of our bestsellers 🌹", 4 * H + 20, "app"]]],
  "simran.kaur": ["Simran Kaur", false, [["in", "Your Vanilla Chai candle is my whole personality now ☕", 20 * H], ["out", "Hahaha this made our day 😂💛 Thank you Simran!", 19 * H, "app"]]],
  "zoya.s": ["Zoya Siddiqui", false, [["in", "Hi, can I visit the studio this weekend?", 2 * D], ["out", RULES[3][2], 2 * D, "automation"], ["in", "Perfect, see you Saturday!", 2 * D - 40]]],
  "devchopra": ["Dev Chopra", false, [["in", "Collab? I make home decor reels (48k followers)", 3 * D], ["out", "Hi Dev! We'd love to — sending you our Monsoon box to try 📦", 3 * D - 90, "app"]]],
  "ritika.bose": ["Ritika Bose", false, [["in", "Need 60 favours for my mehendi in January 🌿", 4 * D], ["out", RULES[2][2], 4 * D, "automation"], ["in", "60 pieces, 18 January, Kolkata", 4 * D - 25], ["out", "Noted! Quote coming your way today 💛", 4 * D - 60, "app"]]],
};
for (const [username, [name, unread, msgs]] of Object.entries(IG)) {
  const th = randomUUID(), igsid = `demo-igsid-${username}`;
  const lastIn = Math.min(...msgs.filter((m) => m[0] === "in").map((m) => m[2]));
  sql(`INSERT INTO ig_threads (id, workspace_id, ig_account_id, igsid, username, name, last_inbound_at, last_read_at, welcome_sent_at, profile_pic_at, created_at)
       VALUES (${q(th)}, ${q(ws)}, ${q(igAcct)}, ${q(igsid)}, ${q(username)}, ${q(name)}, ${ago(lastIn)}, ${unread ? "NULL" : "now()"}, ${ago(Math.max(...msgs.map((m) => m[2])))}, now(), ${ago(Math.max(...msgs.map((m) => m[2])) + 1)})`);
  for (const [dir, text, min, origin] of msgs) {
    sql(`INSERT INTO ig_messages (workspace_id, ig_account_id, thread_id, mid, sender_id, sender_name, body, raw, direction, status, origin, created_at)
         VALUES (${q(ws)}, ${q(igAcct)}, ${q(th)}, ${q(msgId("ig"))}, ${q(dir === "in" ? igsid : IG_ID)}, ${q(dir === "in" ? username : "mellowmoon.studio")}, ${q(text)}, '{}'::jsonb,
                 ${q(dir)}, ${q(dir === "in" ? "received" : "sent")}, ${q(dir === "in" ? "customer" : origin)}, ${ago(min)})`);
    if (origin === "automation") {
      const r = RULES.find((x) => x[2] === text);
      autoLog.push(r ? ["keyword", null, ruleIds[r[0]], `DM rule "${r[0]}" sent`, min] : ["welcome", null, null, "welcome sent", min]);
    }
  }
}

/* ── Instagram comments ── [user, text, post, minutes ago, state] ── */
const COMMENTS = [
  ["karan.mehta", "PRICE", 1, 3, "auto"],
  ["nehaaa.g", "This is so aesthetic 😍 Which one smells the most like rain?", 1, 14, "needs"],
  ["the.homebody", "Do you ship to Hyderabad?", 1, 38, "auto-ship"],
  ["sanya.arora", "Need this for my new flat!!", 1, 75, "needs"],
  ["varun.m", "price for the gift set?", 3, 2 * H, "auto"],
  ["lakshmi.n", "Ordered mine yesterday, can't wait 💛", 1, 3 * H, "replied"],
  ["mohit.bansal", "How long does one candle last?", 2, 5 * H, "replied-q"],
  ["divya.k", "Bought 3 last month, my whole house smells like a spa ✨", 3, 9 * H, "replied"],
  ["swati.m", "Is it soy wax?", 2, 20 * H, "replied-soy"],
  ["omkar.p", "🔥🔥🔥", 6, 26 * H, "needs"],
  ["priyanka.das", "Perfect housewarming gift. Do you gift wrap?", 3, 30 * H, "needs"],
  ["abhishek.nair", "PRICE", 6, 2 * D, "auto"],
  ["tara.dsouza", "My monthly favourite 💛", 5, 3 * D, "replied"],
  ["kunal.sethi", "Code MELLOW20 worked, thanks!", 6, 4 * D, "replied"],
  ["gaurav.s", "where is the studio?", 4, 5 * D, "auto-store"],
];
for (const [u, text, post, min, state] of COMMENTS) {
  const rule = state === "auto" ? "Price list" : state === "auto-ship" ? "Delivery" : state === "auto-store" ? "Store visit" : null;
  const reply = state === "replied" ? pick(["Thank you so much! 💛", "This makes us so happy 🥹💛", "Enjoy every burn ✨"]) : state === "replied-q" ? "About 25 hours for small jars and 55 for large ones 🕯️"
    : state === "replied-soy" ? "Yes! 100% natural soy wax with cotton wicks 🌱" : null;
  const at = ago(min), done = ago(Math.max(min - 2, 0.5));
  const ruleRow = rule ? RULES.find((r) => r[0] === rule) : null;
  sql(`INSERT INTO ig_comments (ig_account_id, comment_id, from_id, from_name, media_id, text, raw, rule_id, dm_status, public_status, handled_at, reply_text, reply_kind, replied_at, source, created_at)
       VALUES (${q(igAcct)}, ${q(msgId("cmt"))}, ${q(`demo-igsid-${u}`)}, ${q(u)}, ${q(`demo-media-post-${post}`)}, ${q(text)}, '{}'::jsonb, ${q(rule ? ruleIds[rule] : null)},
               ${q(rule ? "sent" : null)}, ${q(rule && ruleRow[3] ? "sent" : null)}, ${rule ? done : "NULL"}, ${q(reply)}, ${q(reply ? "public" : null)}, ${reply ? done : "NULL"}, 'webhook', ${at})`);
  if (rule) autoLog.push(["comment", null, ruleIds[rule], `comment rule "${rule}": DM sent${ruleRow[3] ? ", public reply sent" : ""}`, min]);
}

/* ── automation log ── */
for (const [type, cid, rid, detail, min] of autoLog)
  sql(`INSERT INTO automation_log (workspace_id, type, contact_id, rule_id, detail, status, created_at) VALUES (${q(ws)}, ${q(type)}, ${q(cid)}, ${q(rid)}, ${q(detail)}, 'sent', ${ago(min)})`);

/* ── an unpublished ad draft (the simulated account supplies live-looking campaigns) ── */
sql(`INSERT INTO ads_mock_campaigns (workspace_id, name, objective, status, daily_budget, destination, creative_headline, creative_body, audience, created_at)
     VALUES (${q(ws)}, 'Diwali pre-orders — WhatsApp', 'OUTCOME_ENGAGEMENT', 'draft', 600, 'whatsapp', 'Diwali gift boxes 🪔', 'Pre-order our festive gift boxes and get free gift wrapping. Tap to chat with us on WhatsApp.', 'Bengaluru, Mumbai, Pune', ${ago(2 * D)})`);

out.push("COMMIT;");
console.log(out.join("\n"));
console.error(`Demo workspace "${WS_NAME}" — log in as ${EMAIL} / ${PASSWORD}`);
