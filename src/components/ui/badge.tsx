import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        cyan: 'bg-glow/10 text-glow border border-glow/30',
        green: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
        yellow: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
        red: 'bg-red-500/10 text-red-400 border border-red-500/30',
        gray: 'bg-slate-500/10 text-slate-400 border border-slate-500/30',
        blue: 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
      }
    },
    defaultVariants: { variant: 'cyan' }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
