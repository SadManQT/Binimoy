import { z } from "zod";

const mode = z.enum(["fixture", "live"]).default("fixture");

const schema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]),
    DATABASE_URL: z.string().min(1),
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
