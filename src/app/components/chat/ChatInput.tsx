'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  isLoading?: boolean
  onStop?: () => void
  placeholder?: string
}

export function ChatInput({ 
  onSendMessage, 
  isLoading = false, 
  onStop,
  placeholder = "Type your message..." 
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim())
      setMessage('')
      resetTextareaHeight()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  useEffect(() => {
    adjustTextareaHeight()
  }, [message])

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative flex items-end gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-colors">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent border-none outline-none px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 min-h-[44px] max-h-[120px] overflow-y-auto"
            rows={1}
          />
          
          <div className="flex items-center gap-2 pr-2 pb-2">
            {isLoading && onStop ? (
              <button
                type="button"
                onClick={onStop}
                className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors duration-200 flex items-center justify-center"
                title="Stop generation"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!message.trim() || isLoading}
                className={cn(
                  'p-2 rounded-lg transition-all duration-200 flex items-center justify-center',
                  message.trim() && !isLoading
                    ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                )}
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2 px-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Press Enter to send, Shift+Enter for new line
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {message.length}/2000
          </p>
        </div>
      </form>
    </div>
  )
}
