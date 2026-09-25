import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { isRoutingError } from "llm-router-profiles";
import { getRouter, profileFromPromptProps } from "@/lib/router";

const logger = new Logger("API:SelectModel");

/**
 * POST /api/select-model — pick a model for a prompt through the router
 * library. Selection is deterministic over the live public catalog, so this
 * works with zero API keys; failures are typed, never a fallback model.
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  try {
    logger.info("POST /api/select-model - Request started", { requestId });

    const body = await request.json();
    const { message, promptProps } = body;

    if (!message || typeof message !== "string") {
      logger.warn("POST /api/select-model - Invalid message format", {
        requestId,
        messageType: typeof message,
        messageLength: message?.length || 0,
      });
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (!promptProps) {
      logger.warn("POST /api/select-model - Missing promptProps", {
        requestId,
        receivedKeys: Object.keys(body),
      });
      return NextResponse.json(
        { error: "PromptProps is required" },
        { status: 400 }
      );
    }

    logger.info("POST /api/select-model - Processing request", {
      requestId,
      messageLength: message.length,
      promptProps: {
        accuracy: promptProps.accuracy,
        cost: promptProps.cost,
        speed: promptProps.speed,
        tokenLimit: promptProps.tokenLimit,
        reasoning: promptProps.reasoning,
      },
    });

    const selectionStartTime = Date.now();
    const pick = await getRouter().select(message, profileFromPromptProps(promptProps));
    const selectionDuration = Date.now() - selectionStartTime;
    const totalDuration = Date.now() - startTime;

    logger.info("POST /api/select-model - Model selected successfully", {
      requestId,
      selectedModel: pick.model,
      backend: pick.backend,
      reason: pick.why,
      selectionDurationMs: selectionDuration,
      totalDurationMs: totalDuration,
    });

    return NextResponse.json({
      model: pick.model,
      reason: pick.why,
      backend: pick.backend,
      matched: pick.matched,
      latencyMs: pick.latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    if (isRoutingError(error)) {
      // Typed routing failure — surfaced, never silently rerouted.
      logger.error("POST /api/select-model - Routing failed", {
        requestId,
        code: error.code,
        message: error.message,
        totalDurationMs: totalDuration,
      });
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "NO_MODEL_FITS" ? 422 : 502 }
      );
    }

    logger.error("POST /api/select-model - Request failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
      totalDurationMs: totalDuration,
    });

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
