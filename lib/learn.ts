/**
 * Learning Center content. Plain data, so a guide can be added or edited without touching the pages.
 * Text supports **bold** only. Every guide ends with "Try it" links into the app.
 */
export type Block =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[] }
  | { t: "steps"; items: [string, string][] }          // [title, detail]
  | { t: "tip"; tone?: "info" | "warn" | "good"; title: string; text: string }
  | { t: "compare"; left: { title: string; items: string[] }; right: { title: string; items: string[] } }
  | { t: "example"; label: string; lines: [("in" | "out"), string][] };

export type Guide = {
  slug: string; cat: CatKey; title: string; summary: string; minutes: number; icon: string;
  blocks: Block[]; try?: { label: string; href: string }[]; featured?: boolean;
};
export type CatKey = "start" | "whatsapp" | "automation" | "instagram" | "ads" | "growth";
export const CATS: Record<CatKey, { label: string; tone: string; icon: string }> = {
  start: { label: "Start here", tone: "grape", icon: "rocket-launch" },
  whatsapp: { label: "WhatsApp", tone: "green", icon: "whatsapp-logo" },
  automation: { label: "Automation", tone: "banana", icon: "lightning" },
  instagram: { label: "Instagram", tone: "pink", icon: "instagram-logo" },
  ads: { label: "Meta Ads", tone: "orange", icon: "target" },
  growth: { label: "Grow your list", tone: "neutral", icon: "users-three" },
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-use-whatsapp-api", cat: "start", featured: true, icon: "lightbulb", minutes: 4,
    title: "Use this number for automation — not for long chats",
    summary: "The most important idea in NextBiz One: let the API number capture and qualify leads automatically, then continue real conversations on your WhatsApp Business app.",
    blocks: [
      { t: "p", text: "The number you connect to NextBiz One runs on Meta's **official WhatsApp Business API**. It's built for scale: replying instantly at 2 am, answering the same question for the hundredth time, sending a broadcast to 500 customers, and catching every lead from your ads." },
      { t: "p", text: "It is **not** built for long, personal back-and-forth. Meta's rules (like the 24-hour reply window and paid templates) exist to stop spam, and they get in the way when you're chatting with someone over several days. Many businesses get frustrated here, and it's not your fault: it's the wrong tool for that job." },
      { t: "compare",
        left: { title: "This number (NextBiz One)", items: ["Welcome message the moment someone writes", "Price lists, timings, delivery info by keyword", "Leads from Click-to-WhatsApp ads and Instagram", "Broadcasts and order updates", "After-hours away message"] },
        right: { title: "Your WhatsApp Business app", items: ["Negotiation and custom orders", "Voice notes, quick photos, “let me check and call you”", "Relationships with regular customers", "Conversations that go on for days", "Anything where the 24-hour window would get in the way"] } },
      { t: "h", text: "The hand-off: how leads move to your app" },
      { t: "steps", items: [
        ["Automation catches and qualifies", "Your welcome message and keyword rules answer the basics: price, delivery, location. The customer gets an answer in seconds."],
        ["You spot a serious lead", "Someone asks for a custom order, a bulk quote, or wants to talk. Tag them (for example “Hot lead”) in Contacts so nothing is lost."],
        ["Send them your app number", "Reply with a short message and your personal business link, like: “For custom orders, chat with our team directly: wa.me/91XXXXXXXXXX”. Save it as a keyword rule so it's one tap."],
        ["Continue on the app", "The conversation carries on in your WhatsApp Business app, with no window and no template fees, while NextBiz One keeps handling everyone else."],
      ] },
      { t: "example", label: "A hand-off that feels natural", lines: [
        ["in", "Hi, can you make 120 candles for my wedding?"],
        ["out", "Congratulations! 🎉 Yes, we do wedding favours from 50 pieces. For custom orders our team will help you personally — tap here to chat: wa.me/919845012345"],
        ["in", "Perfect, messaging now!"],
      ] },
      { t: "tip", tone: "warn", title: "Use two different numbers", text: "A number connected to the API can't also be logged in to the normal WhatsApp app the usual way. Keep a separate number for your WhatsApp Business app on your phone." },
      { t: "tip", tone: "good", title: "Rule of thumb", text: "If the conversation is the same for every customer, automate it here. If it's different for every customer, take it to your app." },
    ],
    try: [{ label: "Add a hand-off keyword rule", href: "/automation" }, { label: "Tag a lead in Contacts", href: "/contacts" }],
  },
  {
    slug: "24-hour-window", cat: "whatsapp", featured: true, icon: "clock-countdown", minutes: 3,
    title: "The 24-hour window, explained",
    summary: "Why you sometimes can't just reply, what a template is, and how to never get stuck.",
    blocks: [
      { t: "p", text: "WhatsApp lets a business send **any message it likes for 24 hours after the customer's last message**. This is the “reply window”. Every new message from the customer restarts the 24 hours." },
      { t: "p", text: "After the window closes you can only send an **approved template**: a message Meta has checked in advance. This protects people from businesses messaging them whenever they want. It applies to every app built on the WhatsApp API, not just NextBiz One." },
      { t: "compare",
        left: { title: "Window open (green timer)", items: ["Type anything, like a normal chat", "Replies are free on WhatsApp's side", "Each customer message restarts the clock"] },
        right: { title: "Window closed", items: ["Only approved templates can be sent", "Meta charges per conversation started", "Once they reply, the window opens again"] } },
      { t: "h", text: "Where you see it in NextBiz One" },
      { t: "list", items: ["Every chat in the Inbox shows the time left, e.g. **“23h 54m left to reply”**.", "Chats about to close show an hourglass in the list and on the Dashboard.", "When it's closed, the composer turns into a **Send template** button."] },
      { t: "h", text: "How to never get stuck" },
      { t: "list", items: ["**Reply fast.** A welcome message and keyword rules answer within seconds, which keeps the window useful.", "**End with a question** (“Shall I reserve one for you?”). When they answer, the window reopens.", "**Keep 2–3 templates approved** (an order update, a follow-up), so you can restart any chat.", "**Long conversations belong on your WhatsApp Business app.** See the guide on using this number for automation."] },
      { t: "tip", tone: "info", title: "Instagram has the same rule", text: "Instagram DMs also have a 24-hour window, and a private reply to a comment must be sent within 7 days." },
    ],
    try: [{ label: "Open the Inbox", href: "/inbox" }, { label: "Create a template", href: "/templates?new=1" }],
  },
  {
    slug: "start-automation", cat: "automation", featured: true, icon: "lightning", minutes: 5,
    title: "Set up automation in 10 minutes",
    summary: "Welcome message, away hours and your first three keyword replies, in the right order.",
    blocks: [
      { t: "p", text: "Automation answers the questions you get every day, so customers hear back instantly and you only step in when it matters. Set it up once; it works on WhatsApp and Instagram." },
      { t: "steps", items: [
        ["1 · Welcome message", "Sent once to every new customer. Say who you are, what you sell, and when a person replies. Example: “Hi! 👋 Thanks for messaging Mellowmoon. Type PRICE for our price list — a real person replies within the hour.”"],
        ["2 · Business hours + away message", "Set your hours. Outside them, customers get your away message instead, e.g. “We're closed for the night 🌙 We'll reply at 10 am.”"],
        ["3 · Your top 3 keyword rules", "Look at your last 20 chats. The same 3 questions usually come up: **price**, **delivery**, **location/timings**. Make one rule for each."],
        ["4 · Test from your own phone", "Send “price?” to your business number. The reply should arrive within seconds and show up in the Inbox."],
        ["5 · Let it run, then improve", "Check the Automation page weekly: which rules fire, and which questions still need a person."],
      ] },
      { t: "tip", tone: "good", title: "Automation steps aside for you", text: "When you reply to a chat yourself, automation pauses for that chat, so customers never get a bot reply in the middle of your conversation." },
      { t: "tip", tone: "info", title: "Ask NextBiz AI", text: "Ask AI “write a welcome message and 3 keyword replies for my business”. It uses your business details, and you approve everything before it's saved." },
    ],
    try: [{ label: "Open Automation", href: "/automation" }, { label: "Instagram auto-replies", href: "/social/automation" }],
  },
  {
    slug: "keyword-rules", cat: "automation", icon: "chat-text", minutes: 3,
    title: "Keyword rules that actually work",
    summary: "Choosing keywords, one topic per rule, and turning Instagram comments into DMs.",
    blocks: [
      { t: "list", items: [
        "**One topic per rule.** “Price list”, “Delivery” and “Store visit” work better than one giant FAQ reply.",
        "**Add every way people ask.** For price: price, cost, rate, how much, kitna. A rule fires if the message contains any of them.",
        "**Keep replies short and useful.** Put the answer first, then one next step (“Reply ORDER to place an order”).",
        "**Send once vs always.** “Send once” stops the same rule answering the same person twice, which is usually right for long replies like price lists.",
        "**Use the tester** on the Automation page to check which rule a message would trigger before going live.",
      ] },
      { t: "h", text: "Instagram: comment → DM" },
      { t: "p", text: "Turn on “Instagram comment” for a rule, then post: “Comment PRICE and we'll DM you the details.” Everyone who comments gets the reply privately, plus an optional public reply under their comment (“Sent you a DM 💌”). Posts like this get far more comments, which also helps reach." },
      { t: "tip", tone: "warn", title: "Avoid one-letter or very common keywords", text: "A keyword like “hi” or “ok” fires on almost everything. Pick words that only appear when someone asks that exact question." },
    ],
    try: [{ label: "Add a keyword rule", href: "/automation" }],
  },
  {
    slug: "templates", cat: "whatsapp", icon: "notebook", minutes: 4,
    title: "Templates: approved the first time",
    summary: "Marketing vs utility, variables, media headers, and the reasons Meta rejects templates.",
    blocks: [
      { t: "p", text: "Templates are the messages you can send outside the 24-hour window and in broadcasts. Meta reviews each one, usually within minutes, sometimes up to a day." },
      { t: "compare",
        left: { title: "Utility", items: ["Order confirmations", "Delivery and appointment updates", "Payment reminders", "No offers or promotions at all"] },
        right: { title: "Marketing", items: ["Offers, launches, festive sales", "Back-in-stock and restock alerts", "“We miss you” follow-ups", "Needs the customer's opt-in"] } },
      { t: "h", text: "Why templates get rejected" },
      { t: "list", items: [
        "**Wrong category:** a discount inside a Utility template. Submit it as Marketing.",
        "**Variables at the very start or end,** or two variables side by side ({{1}} {{2}}). Put words around them.",
        "**Missing or odd sample values.** Give realistic examples (“Priya”, “#MM-2741”).",
        "**Too vague or threatening** (“Final warning!”), or asking for sensitive data like card numbers.",
      ] },
      { t: "tip", tone: "good", title: "Add a picture", text: "An image header (your product, your offer) gets noticeably more replies. Choose Image in the Header section; the same picture is sent with every message." },
    ],
    try: [{ label: "Create a template", href: "/templates?new=1" }],
  },
  {
    slug: "broadcasts", cat: "whatsapp", icon: "megaphone", minutes: 3,
    title: "Broadcasts without getting blocked",
    summary: "Opt-in, frequency and timing: how to keep your number's quality rating high.",
    blocks: [
      { t: "p", text: "WhatsApp watches how people react to your messages. If many recipients block or report you, your **quality rating** drops and Meta limits how many people you can message per day." },
      { t: "list", items: [
        "**Only opted-in contacts.** NextBiz One sends broadcasts to opted-in contacts only. Ask people (“Want our offers on WhatsApp?”) and mark consent when you import.",
        "**Make it easy to leave.** Anyone who replies STOP is opted out automatically.",
        "**1–2 broadcasts a week at most.** More than that and blocks go up fast.",
        "**Send when people read:** late morning or 7–9 pm usually works best.",
        "**Segment with tags.** A wholesale offer to wholesale customers beats a message to everyone.",
      ] },
      { t: "tip", tone: "info", title: "Read the report", text: "Each broadcast shows sent, delivered, read and replied. Failed messages show why, e.g. the number isn't on WhatsApp." },
    ],
    try: [{ label: "New broadcast", href: "/broadcasts?new=1" }, { label: "Contacts & tags", href: "/contacts" }],
  },
  {
    slug: "instagram-comments", cat: "instagram", icon: "chat-teardrop-text", minutes: 3,
    title: "Turning Instagram comments into customers",
    summary: "Reply publicly or privately, the 7-day rule, and posts that get more comments.",
    blocks: [
      { t: "p", text: "Every comment on your posts lands in **Social → Comments**. Answer publicly (everyone sees it under the post) or privately (a DM to that person, which starts a conversation)." },
      { t: "list", items: [
        "**Public reply** for compliments and general questions: it shows other people you're responsive.",
        "**Private reply** for prices, orders and anything personal. Each comment can get **one** private reply, within **7 days**.",
        "**Dismiss** comments that don't need an answer, so “Needs reply” stays a real to-do list.",
      ] },
      { t: "tip", tone: "good", title: "Posts that pull comments", text: "End captions with a clear action: “Comment PRICE”, “Comment your city and we'll tell you the delivery time”. Pair it with a comment keyword rule and it answers itself." },
    ],
    try: [{ label: "Open Comments", href: "/social/comments" }],
  },
  {
    slug: "click-to-whatsapp-ads", cat: "ads", icon: "target", minutes: 4,
    title: "Click-to-WhatsApp ads, start to finish",
    summary: "Ads that open a chat with you: greeting, quick questions, budget, and what happens next.",
    blocks: [
      { t: "p", text: "A Click-to-WhatsApp ad has a “Send message” button. Tapping it opens WhatsApp with your business, and the chat lands straight in your NextBiz One inbox." },
      { t: "steps", items: [
        ["Pick the goal", "WhatsApp messages (or Instagram DMs). Choose website visits only if you sell online."],
        ["Write the greeting", "The first thing people see in the chat. Add 3–4 **quick questions** (“What's the price?”, “Do you deliver?”) so starting is one tap."],
        ["Match your keyword rules", "If a quick question is “What's the price?”, make sure your Price rule catches it. Every ad lead then gets an instant answer."],
        ["Start small", "₹300–500 a day for 5–7 days is enough to learn what works. Campaigns are created **paused**; you start them when ready."],
        ["Watch cost per chat", "Performance shows spend, chats started and cost per result. Keep what works, pause the rest."],
      ] },
      { t: "tip", tone: "warn", title: "Link your Facebook Page to WhatsApp first", text: "Meta only runs Click-to-WhatsApp ads when your Page is linked to the WhatsApp number (Facebook Page → Settings → Linked accounts)." },
    ],
    try: [{ label: "Create a campaign", href: "/ads/new" }, { label: "See performance", href: "/ads/performance" }],
  },
  {
    slug: "grow-contacts", cat: "growth", icon: "user-plus", minutes: 2,
    title: "Growing your contact list the right way",
    summary: "Automatic contacts, importing a CSV with consent, and tags that make broadcasts useful.",
    blocks: [
      { t: "list", items: [
        "**Everyone who messages you is saved automatically**, with their name from WhatsApp.",
        "**Import a CSV** of past customers. Only tick “they agreed to get offers” if they really did.",
        "**Share your chat link** (wa.me/your-number) on Instagram bio, Google Business, packaging and bills. A QR code on the counter works well.",
        "**Tag as you chat:** New lead, Repeat buyer, Wholesale, VIP. Tags turn one big list into useful segments.",
      ] },
    ],
    try: [{ label: "Open Contacts", href: "/contacts" }],
  },
  {
    slug: "nextbiz-ai", cat: "start", icon: "sparkle", minutes: 2,
    title: "Getting the most from NextBiz AI",
    summary: "Reply suggestions, Ask AI, and why nothing is ever sent without you.",
    blocks: [
      { t: "list", items: [
        "**✨ Suggest** in any chat drafts a reply from the conversation and your business details. Press Tab to see another.",
        "**Ask AI** (⌘J / Ctrl+J) answers questions like “what needs me today?” or “write a Diwali broadcast”.",
        "**You always approve.** AI never sends a message or changes a setting on its own.",
        "**Better input, better output:** fill in “About your business” in Settings (prices, timings, delivery areas).",
      ] },
    ],
    try: [{ label: "Business details in Settings", href: "/settings" }],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
