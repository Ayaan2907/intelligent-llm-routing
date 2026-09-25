import { z } from "zod";
import { Logger } from "@/utils/logger";

const logger = new Logger("Config:Env");

// Schema for environment variables
const envSchema = z.object({
  // NODE_ENV: z.string(),
  // NEXT_PUBLIC_APP_URL: z.string(),
  OPEN_ROUTER_API_KEY: z.string(),
});

type Env = z.infer<typeof envSchema>;

// Function to validate environment variables
const validateEnv = (): Env => {
  try {
    logger.info("Validating environment variables");
    const env = {
      // NODE_ENV: process.env.NODE_ENV,
      // NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
    };
    const parsed = envSchema.parse(env);
    logger.info("Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => err.path.join("."));
      logger.error("Invalid environment variables", { error: { missingVars } });
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(
          ", "
        )}. Please check your .env file`
      );
    }
    throw error;
  }
};

let cachedEnv: Env | null = null;

/**
 * Lazy, cached env access. Validation runs at first property read — request
 * time — never at module scope, so importing (and building) the app with zero
 * env vars set never crashes. Demo mode depends on this.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    cachedEnv ??= validateEnv();
    return cachedEnv[prop as keyof Env];
  },
});
