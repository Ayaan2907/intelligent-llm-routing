'use client'

import { ChatHeader } from './components/chat/ChatHeader'
import { ChatContainer } from './components/chat/ChatContainer'
import { ChatInput } from './components/chat/ChatInput'
import { useChat } from '../hooks/useChat'

export default function ChatPage() {
  const { messages, isLoading, sendMessage, clearMessages, stopGeneration } = useChat()


  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <ChatHeader 
        title="Intelligent LLM Chat"
        onNewChat={clearMessages}
      />
      
      <ChatContainer 
        messages={messages}
        isLoading={isLoading}
      />
      
      <ChatInput 
        onSendMessage={sendMessage}
        isLoading={isLoading}
        onStop={stopGeneration}
        placeholder="Ask me anything..."
      />
    </div>
  )
}