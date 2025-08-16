import { NextResponse } from "next/server";
import { Logger } from "@/utils/logger";
import { PromptProperties, Model, ModelSelection } from "@/types/chat";
import { AVAILABLE_MODELS } from "@/constants/models";
import { openRouter } from "@/utils/openai";

const logger = new Logger("API:SelectModel");

export async function POST(request: Request) {
  try {
    logger.info("POST /api/select-model - Request started");

    const body = await request.json();
    const { message, promptProps } = body;

    if (!message || typeof message !== 'string') {
      logger.warn("POST /api/select-model - Invalid message format", { body });
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    if (!promptProps) {
      logger.warn("POST /api/select-model - Missing promptProps", { body });
      return NextResponse.json(
        { error: "PromptProps is required" },
        { status: 400 }
      );
    }

    logger.info("POST /api/select-model - Selecting model", { 
      messageLength: message.length,
      preview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      promptProps
    });

    const modelSelection = await selectBestModel(AVAILABLE_MODELS, message, promptProps);
    
    logger.info("POST /api/select-model - Model selected successfully", {
      selectedModel: modelSelection.model,
      reason: modelSelection.reason
    });

    return NextResponse.json({
      model: modelSelection.model,
      reason: modelSelection.reason,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error("POST /api/select-model - Request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

const selectBestModel = async (models: Model[], prompt: string, parameter: PromptProperties): Promise<ModelSelection> => {
  logger.info("POST /api/select-model - Choosing model");
  
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
  ${models.map(model => `<model>${model.name}</model>`).join('')}
  </models_available>
  
  <output>
  {
  "model": "model_name",
  "reason": "reason"
  }
  </output>
  `

  try {
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

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No content received");
    
    const parsed = JSON.parse(content);
    return {
      model: parsed.model,
      reason: parsed.reason
    };
  } catch (error) {
    logger.error("Failed to parse model selection response", { error });
    // Fallback to a default model
    return {
      model: "openai/gpt-3.5-turbo",
      reason: "Fallback due to parsing error"
    };
  }
}
