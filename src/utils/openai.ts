import OpenAI from "openai";
import { env } from "@/config/env";

export const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: env.OPEN_ROUTER_API_KEY,
});
