import OpenAI from "openai";
import { env } from "@/config/env";

let cachedClient: OpenAI | null = null;

/**
 * Lazy OpenRouter client. The API key is read and the client constructed at
 * first use — request time — never at module scope, so importing (and
 * building) the app with zero env vars set never crashes. Demo mode depends
 * on this; a missing key fails with a typed, readable error at request time.
 */
export const openRouter: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop) {
    cachedClient ??= new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPEN_ROUTER_API_KEY,
    });
    return cachedClient[prop as keyof OpenAI];
  },
});
