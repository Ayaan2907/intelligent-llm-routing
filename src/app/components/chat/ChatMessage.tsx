'use client'

import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: string
  isUser: boolean
  timestamp: Date
  isLoading?: boolean
  modelInfo?: {
    model: string
    reason: string
  }
}

export function ChatMessage({ message, isUser, timestamp, isLoading = false, modelInfo }: ChatMessageProps) {
  return (
    <div className={cn(
      'flex w-full mb-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'flex max-w-[80%] gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}>
        {/* Avatar */}
        <div className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
          isUser 
            ? 'bg-blue-500 text-white' 
            : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        )}>
          {isUser ? 'U' : 'AI'}
        </div>
        
        {/* Message Content */}
        <div className={cn(
          'rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md',
          isUser 
            ? 'bg-blue-500 text-white ml-2' 
            : 'bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 mr-2'
        )}>
          {isLoading ? (
            <div className="flex items-center space-x-1">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message}
            </p>
          )}
          
          {/* Model Selection Info */}
          {!isUser && modelInfo && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg border-l-4 border-blue-500">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                🤖 Selected Model: <span className="font-mono text-blue-600 dark:text-blue-400">{modelInfo.model}</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                💡 Reason: {modelInfo.reason}
              </div>
            </div>
          )}
          
          {/* Timestamp */}
          <div className={cn(
            'text-xs mt-2 opacity-70',
            isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
          )}>
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  )
}
