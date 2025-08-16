import { Model } from '@/types/chat'

export const AVAILABLE_MODELS: Model[] = [
  {
    name: "openai/gpt-4o",
    description: "Most advanced multimodal model with vision capabilities. Context: 128,000 tokens. Pricing: $0.000005 prompt, $0.000015 completion. TTFT: 0.56s. Throughput: 109 tokens/s. Tier: Premium. Capabilities: reasoning, vision, coding."
  },
  {
    name: "openai/gpt-4o-mini",
    description: "Faster, more affordable version of GPT-4o. Context: 128,000 tokens. Pricing: $0.00000015 prompt, $0.0000006 completion. TTFT: 0.35s. Throughput: 120 tokens/s. Tier: High. Capabilities: reasoning, vision, coding."
  },
  {
    name: "openai/gpt-4-turbo",
    description: "Enhanced GPT-4 with improved performance. Context: 128,000 tokens. Pricing: $0.00001 prompt, $0.00003 completion. TTFT: 0.85s. Throughput: 20 tokens/s. Tier: Premium. Capabilities: reasoning, vision, coding."
  },
  {
    name: "openai/gpt-4",
    description: "Most capable GPT model for complex reasoning. Context: 8,192 tokens. Pricing: $0.00003 prompt, $0.00006 completion. TTFT: 1.2s. Throughput: 15 tokens/s. Tier: Premium. Capabilities: reasoning, coding."
  },
  {
    name: "openai/gpt-3.5-turbo",
    description: "Fast and cost-effective for most tasks. Context: 16,385 tokens. Pricing: $0.0000005 prompt, $0.0000015 completion. TTFT: 0.25s. Throughput: 85 tokens/s. Tier: Medium. Capabilities: general, coding."
  },
  {
    name: "openai/gpt-3.5-turbo-instruct",
    description: "Instruction-following variant of GPT-3.5. Context: 4,096 tokens. Pricing: $0.0000015 prompt, $0.000002 completion. TTFT: 0.30s. Throughput: 80 tokens/s. Tier: Medium. Capabilities: instructions, general."
  },
  {
    name: "anthropic/claude-3.5-sonnet",
    description: "Most intelligent Claude model with enhanced reasoning. Context: 200,000 tokens. Pricing: $0.000003 prompt, $0.000015 completion. TTFT: 1.23s. Throughput: 28 tokens/s. Tier: Premium. Capabilities: reasoning, analysis, coding, vision."
  },
  {
    name: "anthropic/claude-3-opus",
    description: "Most powerful Claude model for complex tasks. Context: 200,000 tokens. Pricing: $0.000015 prompt, $0.000075 completion. TTFT: 2.1s. Throughput: 23 tokens/s. Tier: Premium. Capabilities: reasoning, analysis, coding, vision."
  },
  {
    name: "anthropic/claude-3-sonnet",
    description: "Balanced performance and speed. Context: 200,000 tokens. Pricing: $0.000003 prompt, $0.000015 completion. TTFT: 1.8s. Throughput: 35 tokens/s. Tier: High. Capabilities: reasoning, analysis, coding, vision."
  },
  {
    name: "anthropic/claude-3-haiku",
    description: "Fastest Claude model for quick responses. Context: 200,000 tokens. Pricing: $0.00000025 prompt, $0.00000125 completion. TTFT: 0.8s. Throughput: 65 tokens/s. Tier: Medium. Capabilities: general, coding, vision."
  },
  {
    name: "openai/gpt-oss-20b:free",
    description: "Open weight 20B parameter model with MoE architecture. Context: 131,072 tokens. Pricing: Free. TTFT: 0.40s. Throughput: 45 tokens/s. Tier: Standard. Capabilities: general, coding."
  }
]
