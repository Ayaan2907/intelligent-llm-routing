'use client'

import { useEffect, useRef } from 'react'
import { ChatMessage } from './ChatMessage'
import { Message } from '@/types/chat'


interface ChatContainerProps {
  messages: Message[]
  isLoading?: boolean
}

export function ChatContainer({ messages, isLoading = false }: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-gray-50 dark:bg-gray-900"
    >
      <div className="max-w-4xl mx-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">AI</span>
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              How can I help you today?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              play around the correct model for your prompts based on the parameters you choose
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message.content}
                isUser={message.isUser}
                timestamp={message.timestamp}
                modelInfo={message.modelInfo}
              />
            ))}
            
            {isLoading && (
              <ChatMessage
                message=""
                isUser={false}
                timestamp={new Date()}
                isLoading={true}
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
