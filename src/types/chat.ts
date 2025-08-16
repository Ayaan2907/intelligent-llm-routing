export interface Message {
  id: string
  content: string
  isUser: boolean
  timestamp: Date
  modelInfo?: {
    model: string
    reason: string
  }
}

export interface PromptProperties {
  accuracy: number
  cost: number
  speed: number
  tokenLimit: number
  reasoning: boolean
}

export interface Model {
  name: string
  description: string
}

export interface ModelSelection {
  model: string
  reason: string
}
