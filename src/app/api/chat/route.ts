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
  try {
    logger.info("POST /api/chat - Request started");

    const body = await request.json();
    const { message, promptProps, selectedModel } = body;

    if (!message || typeof message !== 'string') {
      logger.warn("POST /api/chat - Invalid message format", { body });
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (!selectedModel || typeof selectedModel !== 'string') {
      logger.warn("POST /api/chat - Invalid selectedModel format", { body });
      return NextResponse.json(
        { error: "selectedModel is required and must be a string" },
        { status: 400 }
      );
    }

    logger.info("POST /api/chat - Processing message", { 
      messageLength: message.length,
      preview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      promptProps
    });

    logger.info("POST /api/chat - Creating streaming response", {
      selectedModel,
      messageLength: message.length
    });

    // Create response with the selected model
    const response = await openRouter.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    });


    logger.info("POST /api/chat - Response generated successfully", {
    });

    return NextResponse.json({
      response: response.choices[0].message.content,
      timestamp: new Date().toISOString(),
      messageId: Date.now().toString()
    });
  } catch (error) {
    logger.error("POST /api/chat - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}