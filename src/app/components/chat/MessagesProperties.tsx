'use client'

import { useState, useEffect } from 'react'
import { Settings, Zap, DollarSign, Target, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PromptProperties } from '@/types/chat'


interface MessagesPropertiesProps {
  onPropertiesChange: (properties: PromptProperties) => void
}

export default function MessagesProperties({ onPropertiesChange }: MessagesPropertiesProps) {
  const [properties, setProperties] = useState<PromptProperties>({
    accuracy: 7,
    cost: 5,
    speed: 6,
    tokenLimit: 2000,
    reasoning: false  
  })

  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    onPropertiesChange(properties)
  }, [properties, onPropertiesChange])

  const updateProperty = (key: keyof PromptProperties, value: number | boolean) => {
    setProperties(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const SliderControl = ({ 
    label, 
    value, 
    onChange, 
    min = 1, 
    max = 10, 
    step = 1,
    icon: Icon,
    color = "blue"
  }: {
    label: string
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    icon: any
    color?: string
  }) => (
    <div className="flex items-center gap-3 py-2">
      <div className={cn(
        "flex items-center gap-2 min-w-[100px]",
        color === "green" && "text-green-600 dark:text-green-400",
        color === "red" && "text-red-600 dark:text-red-400",
        color === "blue" && "text-blue-600 dark:text-blue-400",
        color === "purple" && "text-purple-600 dark:text-purple-400"
      )}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      
      <div className="flex items-center gap-3 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "flex-1 h-2 rounded-lg appearance-none cursor-pointer",
            "bg-gray-200 dark:bg-gray-700",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer",
            color === "green" && "[&::-webkit-slider-thumb]:bg-green-500",
            color === "red" && "[&::-webkit-slider-thumb]:bg-red-500", 
            color === "blue" && "[&::-webkit-slider-thumb]:bg-blue-500",
            color === "purple" && "[&::-webkit-slider-thumb]:bg-purple-500"
          )}
        />
        <div className="w-12 text-right">
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
            {value}
          </span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50">
      {/* Toggle Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            LLM Routing Controls
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>A:{properties.accuracy}</span>
            <span>C:{properties.cost}</span>
            <span>S:{properties.speed}</span>
            <span>{properties.tokenLimit}t</span>
          </div>
          
          <div className={cn(
            "transform transition-transform duration-200",
            isExpanded ? "rotate-180" : "rotate-0"
          )}>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <SliderControl
                label="Accuracy"
                value={properties.accuracy}
                onChange={(value) => updateProperty('accuracy', value)}
                icon={Target}
                color="green"
              />
              
              <SliderControl
                label="Speed"
                value={properties.speed}
                onChange={(value) => updateProperty('speed', value)}
                icon={Zap}
                color="blue"
              />
            </div>
            
            <div className="space-y-2">
              <SliderControl
                label="Cost"
                value={properties.cost}
                onChange={(value) => updateProperty('cost', value)}
                icon={DollarSign}
                color="red"
              />
              
            </div>
          </div>
          
          {/* Token Limit and Reasoning */}
          <div className="flex items-center gap-6 pt-2 border-t border-gray-200 dark:border-gray-700">
            {/* Token Limit */}
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Token Limit</Label>
              <Input
                type="number"
                value={properties.tokenLimit}
                onChange={(e) => updateProperty('tokenLimit', Math.max(1, Number(e.target.value)))}
                className="w-20 h-8 text-sm"
                min={1}
                max={8000}
              />
            </div>
            
            {/* Reasoning Toggle */}
            <div className="flex items-center gap-2">
              <Label htmlFor="reasoning-toggle" >
                Reasoning
              </Label>
              <Switch 
                id="reasoning-toggle"
                checked={properties.reasoning}
                onCheckedChange={(checked) => updateProperty('reasoning', checked)}
              />
            </div>
          </div>
          
          {/* Quick Presets */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Quick presets:</span>
            <button
              onClick={() => setProperties({ accuracy: 9, cost: 2, speed: 4, tokenLimit: 4000, reasoning: false })}
              className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              High Accuracy
            </button>
            <button
              onClick={() => setProperties({ accuracy: 5, cost: 6, speed: 9, tokenLimit: 1000, reasoning: properties.reasoning })}
              className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              Fast
            </button>
            <button
              onClick={() => setProperties({ accuracy: 6, cost: 9, speed: 5, tokenLimit: 1500, reasoning: properties.reasoning })}
              className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors"
            >
              Cheap
            </button>
            <button
              onClick={() => setProperties({ accuracy: 7, cost: 5, speed: 6, tokenLimit: 2000, reasoning: properties.reasoning })}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Balanced
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
