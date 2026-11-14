import { z } from "zod";

/** Validation for the ad builder (shared by estimate + publish routes). */
const PLACEMENTS = ["facebook:feed", "facebook:story", "facebook:facebook_reels", "facebook:video_feeds", "facebook:marketplace",
  "instagram:stream", "instagram:story", "instagram:reels", "instagram:explore", "messenger:messenger_home", "messenger:story"] as const;

export const Targeting = z.object({
  goal: z.enum(["whatsapp", "instagram_dm", "website"]),
  locations: z.array(z.object({ key: z.string().min(1).max(64), type: z.string().max(20), name: z.string().max(120), radiusKm: z.number().min(10).max(80).optional() })).min(1, "Pick at least one location").max(25),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  genders: z.enum(["all", "men", "women"]),
  interests: z.array(z.object({ id: z.string().max(40), name: z.string().max(120) })).max(25),
  advantageAudience: z.boolean(),
  placements: z.union([z.literal("auto"), z.array(z.enum(PLACEMENTS)).min(1, "Pick at least one placement")]),
}).refine((t) => t.ageMax >= t.ageMin, { message: "Maximum age must be at least the minimum age" });

export const Welcome = z.object({
  greeting: z.string().trim().max(300),
  mode: z.enum(["autofill", "questions"]),
  autofill: z.string().trim().max(300).nullable().optional(),
  questions: z.array(z.string().trim().max(80)).max(4).optional(),
  extra: z.enum(["none", "call", "url"]).optional(),
  extraUrl: z.string().url().nullable().optional(),
});

export const Spec = z.object({
  name: z.string().trim().min(2).max(100),
  pageId: z.string().regex(/^\d{5,}$/, "Choose a Facebook Page"),
  instagramId: z.string().regex(/^\d{5,}$/).nullable(),
  format: z.enum(["image", "video"]),
  imageHash: z.string().max(80).nullable().optional(),
  videoId: z.string().regex(/^\d{5,}$/).nullable().optional(),
  videoThumb: z.string().url().nullable().optional(),
  primaryText: z.string().trim().min(1, "Write the main text").max(2200),
  headline: z.string().trim().min(1, "Write a headline").max(255),
  description: z.string().trim().max(255).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  cta: z.string().regex(/^[A-Z_]{3,30}$/).nullable().optional(),
  welcome: Welcome.nullable().optional(),
  dailyBudget: z.number().int().min(100, "Daily budget must be at least ₹100").max(1_000_000),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
}).and(Targeting);

/** A draft: only a name and a sane budget are required. */
export const Draft = z.object({
  name: z.string().trim().min(2, "Give your campaign a name").max(100),
  goal: z.enum(["whatsapp", "instagram_dm", "website"]).default("whatsapp"),
  dailyBudget: z.number().int().min(100, "Daily budget must be at least ₹100").max(1_000_000),
  headline: z.string().max(255).optional().default(""),
  primaryText: z.string().max(2200).optional().default(""),
  locations: z.array(z.object({ name: z.string().max(120) })).max(25).optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
}).passthrough();
