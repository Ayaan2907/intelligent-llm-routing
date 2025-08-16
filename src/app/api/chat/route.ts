import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { openRouter } from "@/utils/openai";


const logger = new Logger("API:Chat");

export async function GET(request: Request) {
  try {
    logger.info("GET /api/chat - Request started");

    const response = {
      message: "Chat API is running",
      status: "healthy",
      timestamp: new Date().toISOString()
    };

    logger.info("GET /api/chat - Request completed successfully");

    return NextResponse.json(response);
  } catch (error) {
    logger.error("GET /api/chat - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info("POST /api/chat - Request started", { requestId });

    const body = await request.json();
    const { message, promptProps, selectedModel } = body;

    // Input validation with detailed logging
    if (!message || typeof message !== 'string') {
      logger.warn("POST /api/chat - Invalid message format", { 
        requestId,
        messageType: typeof message,
        messageLength: message?.length || 0,
        hasSelectedModel: !!selectedModel,
        body: JSON.stringify(body).substring(0, 200)
      });
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (!selectedModel || typeof selectedModel !== 'string') {
      logger.warn("POST /api/chat - Invalid selectedModel format", { 
        requestId,
        selectedModelType: typeof selectedModel,
        selectedModelValue: selectedModel,
        receivedKeys: Object.keys(body),
        body: JSON.stringify(body).substring(0, 200)
      });
      return NextResponse.json(
        { error: "selectedModel is required and must be a string" },
        { status: 400 }
      );
    }

    logger.info("POST /api/chat - Processing chat request", { 
      requestId,
      messageLength: message.length,
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      selectedModel,
      promptProps: promptProps ? {
        accuracy: promptProps.accuracy,
        cost: promptProps.cost,
        speed: promptProps.speed,
        tokenLimit: promptProps.tokenLimit,
        reasoning: promptProps.reasoning
      } : undefined
    });

    // Create response with the selected model
    const llmCallStart = Date.now();
    
    logger.info("POST /api/chat - Calling selected model", {
      requestId,
      selectedModel,
      messageTokenEstimate: Math.ceil(message.length / 4) // rough token estimate
    });
    
    const response = await openRouter.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    });

    const llmCallDuration = Date.now() - llmCallStart;
    const totalDuration = Date.now() - startTime;
    const aiResponse = response.choices[0]?.message?.content;

    logger.info("POST /api/chat - Response generated successfully", {
      requestId,
      selectedModel,
      llmCallDurationMs: llmCallDuration,
      totalDurationMs: totalDuration,
      responseLength: aiResponse?.length || 0,
      responseLatency: llmCallDuration > 10000 ? 'HIGH' : llmCallDuration > 5000 ? 'MEDIUM' : 'LOW',
      tokensUsed: response.usage ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
        costEstimate: response.usage.total_tokens * 0.00001 // rough cost estimate
      } : undefined
    });

    if (!aiResponse) {
      logger.warn("POST /api/chat - Empty response from model", {
        requestId,
        selectedModel,
        responseChoices: response.choices.length
      });
    }

    return NextResponse.json({
      response: aiResponse || "No response generated",
      timestamp: new Date().toISOString(),
      messageId: Date.now().toString()
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    logger.error("POST /api/chat - Request failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      totalDurationMs: totalDuration
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}