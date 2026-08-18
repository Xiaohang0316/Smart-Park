import * as React from 'react'
import { cn } from '../../lib/utils'

/** 输入框(深色科技感) */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-line bg-panel-2/70 px-3 text-sm text-slate-100 placeholder:text-slate-500',
        'focus-visible:border-glow/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-glow/40',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
