import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { PromptProperties, Model, ModelSelection } from "@/types/chat";
import { AVAILABLE_MODELS } from "@/constants/models";
import { openRouter } from "@/utils/openai";

const logger = new Logger("API:SelectModel");

export async function POST(request: Request) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    logger.info("POST /api/select-model - Request started", { requestId });

    const body = await request.json();
    const { message, promptProps } = body;

    // Input validation with detailed logging
    if (!message || typeof message !== 'string') {
      logger.warn("POST /api/select-model - Invalid message format", { 
        requestId,
        messageType: typeof message,
        messageLength: message?.length || 0,
        body: JSON.stringify(body).substring(0, 200)
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
        body: JSON.stringify(body).substring(0, 200)
      });
      return NextResponse.json(
        { error: "PromptProps is required" },
        { status: 400 }
      );
    }

    // Log request details
    logger.info("POST /api/select-model - Processing request", { 
      requestId,
      messageLength: message.length,
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      promptProps: {
        accuracy: promptProps.accuracy,
        cost: promptProps.cost,
        speed: promptProps.speed,
        tokenLimit: promptProps.tokenLimit,
        reasoning: promptProps.reasoning
      },
      availableModels: AVAILABLE_MODELS.length
    });

    const selectionStartTime = Date.now();
    const modelSelection = await selectBestModel(AVAILABLE_MODELS, message, promptProps);
    const selectionDuration = Date.now() - selectionStartTime;
    
    const totalDuration = Date.now() - startTime;
    
    logger.info("POST /api/select-model - Model selected successfully", {
      requestId,
      selectedModel: modelSelection.model,
      reason: modelSelection.reason,
      selectionDurationMs: selectionDuration,
      totalDurationMs: totalDuration,
      modelSelectionLatency: selectionDuration > 5000 ? 'HIGH' : selectionDuration > 2000 ? 'MEDIUM' : 'LOW'
    });

    return NextResponse.json({
      model: modelSelection.model,
      reason: modelSelection.reason,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    logger.error("POST /api/select-model - Request failed", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorStack: error instanceof Error ? error.stack : undefined,
      totalDurationMs: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

const selectBestModel = async (models: Model[], prompt: string, parameter: PromptProperties): Promise<ModelSelection> => {
  const selectionId = `sel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  logger.info("POST /api/select-model - Starting model selection", {
    selectionId,
    promptLength: prompt.length,
    availableModels: models.length,
    userPreferences: parameter
  });
  
    const systemPrompt = `You are an expert in selecting the best LLM for a given prompt. 
  
  Given the following user prompt, select the best LLM for this prompt based on the following criteria and the preferences of the user:
  
  <criteria>
  Category of prompt,
  Accuracy,
  Cost,
  Speed,
  Token Limit,
  Reasoning Enabled,
  </criteria>

  <models_available>
  ${models}
  </models_available>
  
  <output>
  {
  "model": "model_name",
  "reason": "reason"
  }
  </output>
  `

  try {
    const llmCallStart = Date.now();
    
    logger.info("POST /api/select-model - Calling LLM for selection", {
      selectionId,
      selectorModel: "openai/gpt-oss-20b:free",
      systemPromptLength: systemPrompt.length
    });
    
    const response = await openRouter.chat.completions.create({
      model: "openai/gpt-oss-20b:free",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `<user_prompt>${prompt}</user_prompt> <user_preferences>${JSON.stringify(parameter)}</user_preferences>`
        }
      ]
    });

    const llmCallDuration = Date.now() - llmCallStart;
    
    logger.info("POST /api/select-model - LLM response received", {
      selectionId,
      llmCallDurationMs: llmCallDuration,
      responseLength: response.choices[0]?.message?.content?.length || 0,
      tokensUsed: response.usage ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens
      } : undefined
    });

    const content = response.choices[0].message.content;
    if (!content) {
      logger.warn("POST /api/select-model - Empty response from LLM", { selectionId });
      throw new Error("No content received from LLM");
    }
    
    // Strip markdown code blocks if present
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
    
    const parsed = JSON.parse(cleanContent);
    return {
      model: parsed.model,
      reason: parsed.reason
    };
  } catch (error) {
    logger.error("POST /api/select-model - Model selection failed", { 
      selectionId,
      error: error instanceof Error ? error.message : "Unknown error",
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      fallbackModel: "openai/gpt-3.5-turbo"
    });
    
    // Fallback to a default model
    return {
      model: "openai/gpt-3.5-turbo",
      reason: "Fallback due to model selection error: " + (error instanceof Error ? error.message : "Unknown error")
    };
  }
}
