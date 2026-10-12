import { z } from "zod";

const mode = z.enum(["fixture", "live"]).default("fixture");

const SOCIAL = ["google", "facebook", "github"] as const;
type SocialProvider = (typeof SOCIAL)[number];
type Social = Partial<
  Record<SocialProvider, { clientId: string; clientSecret: string }>
>;

const schema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]),
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().regex(/^https?:\/\/[^/]+$/),
    AUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_CLIENT_ID: z.string().optional(),
    FACEBOOK_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    PAYMENT_MODE: z.literal("mock").default("mock"),
    VERIFIER_MODE: z.literal("mock").default("mock"),
    RESEARCH_MODE: mode,
    AI_MODE: mode,
    SEARCH_API_KEY: z.string().optional(),
    MODEL_API_KEY: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.RESEARCH_MODE === "live" && !c.SEARCH_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["SEARCH_API_KEY"],
        message:
          "RESEARCH_MODE=live needs SEARCH_API_KEY. Set it, or set RESEARCH_MODE=fixture.",
      });
    }
    if (c.AI_MODE === "live" && !c.MODEL_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["MODEL_API_KEY"],
        message:
          "AI_MODE=live needs MODEL_API_KEY. Set it, or set AI_MODE=fixture.",
      });
    }
    // A provider with only half its credentials would fail at sign-in time.
    for (const provider of SOCIAL) {
      const upper = provider.toUpperCase();
      for (const [have, need] of [
        ["ID", "SECRET"],
        ["SECRET", "ID"],
      ] as const) {
        const env = c as Record<string, string | undefined>;
        if (env[`${upper}_CLIENT_${have}`] && !env[`${upper}_CLIENT_${need}`]) {
          ctx.addIssue({
            code: "custom",
            path: [`${upper}_CLIENT_${need}`],
            message: `${upper}_CLIENT_${have} is set, so ${upper}_CLIENT_${need} is required too.`,
          });
        }
      }
    }
  })
  .transform((c) => {
    const env = c as Record<string, string | undefined>;
    const social: Social = {};
    for (const provider of SOCIAL) {
      const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
      const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`];
      if (clientId && clientSecret)
        social[provider] = { clientId, clientSecret };
    }
    return { ...c, social };
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  // An .env line like `SEARCH_API_KEY=` yields "", which means unset.
  const set = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== ""),
  );
  const result = schema.safeParse(set);
  if (!result.success) {
    // Report variable names only, never values.
    const names = [
      ...new Set(result.error.issues.map((i) => i.path.join("."))),
    ];
    const custom = result.error.issues
      .filter((i) => i.code === "custom")
      .map((i) => i.message);
    throw new Error(
      `Invalid configuration: ${names.join(", ")} missing or not allowed. ${custom.join(" ")}`.trim(),
    );
  }
  return result.data;
}
