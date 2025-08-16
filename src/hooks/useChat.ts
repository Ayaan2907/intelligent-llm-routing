import { useState } from 'react'
import { PromptProperties, Message } from '@/types/chat'

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = async (content: string, promptProps: PromptProperties) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)


    const aiMessageId = (Date.now() + 1).toString()
    const aiMessage: Message = {
      id: aiMessageId,
      content: '',
      isUser: false,
      timestamp: new Date()
    }

    try {
      // Step 1: Select the best model
      const modelResponse = await fetch('/api/select-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content, promptProps }),
      })

      if (!modelResponse.ok) {
        throw new Error('Failed to select model')
      }

      const modelData = await modelResponse.json()
      
      // Update message with model selection info
      setMessages(prev => [...prev, aiMessage])
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, modelInfo: { model: modelData.model, reason: modelData.reason } }
          : msg
      ))

      // Step 2: Get response from selected model
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: content, 
          promptProps, 
          selectedModel: modelData.model 
        }),
      })

      if (!chatResponse.ok) {
        throw new Error('Failed to get chat response')
      }

      const chatData = await chatResponse.json()
      
      // Update message with AI response
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: chatData.response }
          : msg
      ))
    } catch (error) {
      console.error('Error sending message:', error)
      
      // Update the AI message with error content
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: 'Sorry, I encountered an error processing your message. Please try again.' }
          : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const clearMessages = () => {
    setMessages([])
  }

  const stopGeneration = () => {
    setIsLoading(false)
  }

  return {
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    stopGeneration
  }
}
