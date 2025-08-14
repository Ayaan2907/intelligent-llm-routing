'use client'

import { useState } from 'react'
import { ChatHeader } from './components/chat/ChatHeader'
import { ChatContainer } from './components/chat/ChatContainer'
import { ChatInput } from './components/chat/ChatInput'

interface Message {
  id: string
  content: string
  isUser: boolean
  timestamp: Date
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      // Call the chat API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response,
        isUser: false,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        isUser: false,
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewChat = () => {
    setMessages([])
  }

  const handleStop = () => {
    setIsLoading(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <ChatHeader 
        title="Intelligent LLM Chat"
        onNewChat={handleNewChat}
      />
      
      <ChatContainer 
        messages={messages}
        isLoading={isLoading}
      />
      
      <ChatInput 
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onStop={handleStop}
        placeholder="Ask me anything..."
      />
    </div>
  )
}