import { z } from "zod";

/** Header / footer / buttons validation, shared by template create + edit. */
const Button = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().trim().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().trim().min(1).max(25), url: z.string().trim().url("Button link must be a full https:// address").max(2000) }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().trim().min(1).max(25), phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Phone button needs a number with country code") }),
]);
export const PartsBase = z.object({
  headerFormat: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).default("NONE"),
  headerText: z.string().trim().max(60).nullable().optional(),
  headerMediaId: z.string().uuid().nullable().optional(),
  footer: z.string().trim().max(60).nullable().optional(),
  buttons: z.array(Button).max(10).default([]),
});
export const Parts = PartsBase.superRefine((v, ctx) => {
  if (v.headerFormat === "TEXT" && !v.headerText) ctx.addIssue({ code: "custom", message: "Write the header text, or choose no header." });
  if (v.headerText && /\{\{\d+\}\}/.test(v.headerText)) ctx.addIssue({ code: "custom", message: "Variables aren't supported in the header here — keep it fixed." });
  if (v.buttons.filter((b) => b.type === "URL").length > 2) ctx.addIssue({ code: "custom", message: "Up to 2 website buttons." });
  if (v.buttons.filter((b) => b.type === "PHONE_NUMBER").length > 1) ctx.addIssue({ code: "custom", message: "Only 1 call button." });
});

