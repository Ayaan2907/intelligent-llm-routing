'use client'

import { MessageSquare, Settings, MoreVertical } from 'lucide-react'

interface ChatHeaderProps {
  title?: string
  onNewChat?: () => void
  onSettings?: () => void
}

export function ChatHeader({ 
  title = "Chat Assistant", 
  onNewChat,
  onSettings 
}: ChatHeaderProps) {
  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {onNewChat && (
            <button
              onClick={onNewChat}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
            >
              New Chat
            </button>
          )}
          
          {onSettings && (
            <button
              onClick={onSettings}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          
          <button className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors duration-200">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
