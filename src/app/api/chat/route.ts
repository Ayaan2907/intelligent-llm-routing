import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { isRoutingError } from "llm-router-profiles";
import { getRouter, profileFromPromptProps } from "@/lib/router";

const logger = new Logger("API:Chat");

export async function GET() {
  try {
    logger.info("GET /api/chat - Request started");

    const response = {
      message: "Chat API is running",
      status: "healthy",
      timestamp: new Date().toISOString(),
    };

    logger.info("GET /api/chat - Request completed successfully");

    return NextResponse.json(response);
  } catch (error) {
    logger.error("GET /api/chat - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/chat — complete a prompt on the model the router selected. The
 * call goes through the library's OpenRouter passthrough so usage and cost
 * come from the live catalog pricing — not a per-token guess.
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  try {
    logger.info("POST /api/chat - Request started", { requestId });

    const body = await request.json();
    const { message, promptProps, selectedModel } = body;

    if (!message || typeof message !== "string") {
      logger.warn("POST /api/chat - Invalid message format", {
        requestId,
        messageType: typeof message,
        messageLength: message?.length || 0,
        hasSelectedModel: !!selectedModel,
      });
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (!selectedModel || typeof selectedModel !== "string") {
      logger.warn("POST /api/chat - Invalid selectedModel format", {
        requestId,
        selectedModelType: typeof selectedModel,
        selectedModelValue: selectedModel,
        receivedKeys: Object.keys(body),
      });
      return NextResponse.json(
        { error: "selectedModel is required and must be a string" },
        { status: 400 }
      );
    }

    logger.info("POST /api/chat - Processing chat request", {
      requestId,
      messageLength: message.length,
      selectedModel,
    });

    if (!promptProps) {
      return NextResponse.json(
        { error: "promptProps is required to build the routing profile" },
        { status: 400 }
      );
    }

    const llmCallStart = Date.now();
    const reply = await getRouter().chat(message, profileFromPromptProps(promptProps), {
      model: selectedModel,
    });
    const llmCallDuration = Date.now() - llmCallStart;
    const totalDuration = Date.now() - startTime;

    logger.info("POST /api/chat - Response generated successfully", {
      requestId,
      selectedModel: reply.model,
      llmCallDurationMs: llmCallDuration,
      totalDurationMs: totalDuration,
      responseLength: reply.text.length,
      tokensUsed: reply.meta.usage ?? undefined,
      costUsd: reply.meta.costUsd ?? undefined,
      costNote: reply.meta.provenance.costNote,
      provenance: reply.meta.provenance,
    });

    if (reply.text.length === 0) {
      logger.warn("POST /api/chat - Empty response from model", { requestId, selectedModel });
    }

    return NextResponse.json({
      response: reply.text,
      model: reply.model,
      usage: reply.meta.usage,
      costUsd: reply.meta.costUsd,
      costNote: reply.meta.provenance.costNote ?? null,
      provenance: reply.meta.provenance,
      timestamp: new Date().toISOString(),
      messageId: Date.now().toString(),
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    if (isRoutingError(error)) {
      // Typed routing failure — surfaced, never a degraded 200 that lies.
      logger.error("POST /api/chat - Routing failed", {
        requestId,
        code: error.code,
        message: error.message,
        totalDurationMs: totalDuration,
      });
      const status =
        error.code === "MISSING_CREDENTIALS"
          ? 503
          : error.code === "NO_MODEL_FITS"
            ? 422
            : 502;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      );
    }

    logger.error("POST /api/chat - Request failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
      totalDurationMs: totalDuration,
    });

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
