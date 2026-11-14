/**
 * Which channels each feature needs. A workspace may connect any mix — WhatsApp only, Instagram only,
 * ads only, or all three — so every page checks its own requirement and, when it isn't met, shows a
 * guided setup state (components/ChannelGate.tsx) instead of an empty or broken screen.
 */
export type Channel = "whatsapp" | "instagram" | "ads";
export type Channels = Record<Channel, boolean>;

export type Feature = {
  /** any one of these channels unlocks the feature */
  needs: Channel[];
  name: string;
  title: string;
  blurb: string;
  perks: [string, string][]; // [icon, line]
  preview: "inbox" | "list" | "chart" | "rules";
};

export const FEATURES = {
  inbox: {
    needs: ["whatsapp", "instagram"], name: "Inbox", preview: "inbox",
    title: "Connect a channel to start your inbox",
    blurb: "Every WhatsApp message and Instagram DM your customers send lands here — one place to reply, tag and follow up.",
    perks: [["chat-circle-dots", "Reply to WhatsApp and Instagram from one screen"], ["clock-countdown", "See each chat's 24-hour reply window at a glance"], ["lightning", "Instant welcome and keyword replies, even after hours"]],
  },
  contacts: {
    needs: ["whatsapp", "instagram"], name: "Contacts", preview: "list",
    title: "Your contacts build themselves",
    blurb: "Connect WhatsApp or Instagram and everyone who messages you is saved here automatically — with opt-in status and history.",
    perks: [["user-plus", "New people are added the moment they message"], ["tag", "Tag and segment customers for follow-ups"], ["check-circle", "Opt-in tracked for every contact"]],
  },
  templates: {
    needs: ["whatsapp"], name: "Templates", preview: "list",
    title: "Templates need a WhatsApp number",
    blurb: "Templates are WhatsApp messages Meta approves in advance — they let you reach customers after the 24-hour window and power broadcasts.",
    perks: [["seal-check", "Submitted to Meta for review in one click"], ["arrows-clockwise", "Approval status synced automatically"], ["megaphone", "Ready to use in broadcasts and follow-ups"]],
  },
  broadcasts: {
    needs: ["whatsapp"], name: "Broadcasts", preview: "chart",
    title: "Broadcasts need a WhatsApp number",
    blurb: "Send an approved template to every opted-in customer at once — offers, reminders, restock alerts — and watch delivery and replies live.",
    perks: [["users-three", "Only ever sent to people who opted in"], ["calendar-check", "Send now or schedule for later"], ["chart-bar", "Sent, delivered, read and replied — per broadcast"]],
  },
  automation: {
    needs: ["whatsapp", "instagram"], name: "Automation", preview: "rules",
    title: "Automation replies on your channels",
    blurb: "Welcome messages, away replies and keyword rules answer customers instantly on WhatsApp and Instagram — connect one to switch them on.",
    perks: [["hand", "Welcome every new customer automatically"], ["clock", "Away message outside business hours"], ["chat-text", "Keyword replies for DMs and Instagram comments"]],
  },
  ads: {
    needs: ["ads"], name: "NextBiz Ads", preview: "chart",
    title: "Connect your Meta ad account",
    blurb: "Run click-to-WhatsApp and Instagram ads from NextBiz One — create campaigns, set budgets, and see what each rupee brings back.",
    perks: [["target", "Ads that open a WhatsApp chat with you"], ["currency-inr", "Daily budgets in rupees, pause any time"], ["chart-line-up", "Spend, clicks and leads in one view"]],
  },
} satisfies Record<string, Feature>;
export type FeatureKey = keyof typeof FEATURES;

export const CHANNEL_META: Record<Channel, { label: string; icon: string; tone: string; anchor: string }> = {
  whatsapp: { label: "WhatsApp", icon: "whatsapp-logo", tone: "green", anchor: "whatsapp" },
  instagram: { label: "Instagram", icon: "instagram-logo", tone: "pink", anchor: "instagram" },
  ads: { label: "Meta Ads", icon: "megaphone", tone: "orange", anchor: "ads" },
};

export const featureUnlocked = (f: FeatureKey, ch: Channels) => FEATURES[f].needs.some((c) => ch[c]);
