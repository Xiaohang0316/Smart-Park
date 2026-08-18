/**
 * 顶部栏: 品牌 + 视图导航 + 昼夜切换 + 时钟
 */
import { useEffect, useState } from 'react'
import { useAppStore, type View } from '../../store/useAppStore'
import { Icon } from '../Icon'
import { fmtFull } from '../../lib/time'
import { cn } from '../../lib/utils'

const NAV: { key: View; label: string }[] = [
  { key: 'park', label: '园区总览' },
  { key: 'parking', label: '停车场' },
  { key: 'dashboard', label: '数据看板' }
]

export function Header() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const isDay = useAppStore((s) => s.isDay)
  const setDayMode = useAppStore((s) => s.setDayMode)

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-6 border-b border-line bg-panel/70 px-5 backdrop-blur-md">
      {/* 品牌 */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-glow/50 bg-glow/10 shadow-glow">
          <Icon name="layers" className="h-4.5 w-4.5 text-glow" />
        </div>
        <div className="leading-tight">
          <div className="glow-text text-[15px] font-semibold tracking-[0.15em] text-slate-100">
            智慧园区数字孪生平台
          </div>
          <div className="text-[10px] tracking-[0.3em] text-slate-500">SMART PARK DIGITAL TWIN</div>
        </div>
        <span className="ml-1 rounded border border-glow/30 bg-glow/10 px-1.5 py-0.5 text-[10px] text-glow">
          DEMO
        </span>
      </div>

      {/* 视图导航 */}
      <nav className="flex items-center gap-1">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => setView(n.key)}
            className={cn(
              'relative rounded-md px-4 py-2 text-sm transition-colors',
              view === n.key
                ? 'glow-text font-medium text-glow'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            )}
          >
            {n.label}
            {view === n.key && (
              <span className="absolute inset-x-4 -bottom-[1px] h-0.5 rounded-full bg-glow shadow-glow" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* 昼夜切换 */}
      <button
        onClick={() => setDayMode(!isDay)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
          isDay
            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            : 'border-indigo-400/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
        )}
        title="切换昼夜模式"
      >
        <Icon name={isDay ? 'sun' : 'moon'} className="h-4 w-4" />
        {isDay ? '昼' : '夜'}
      </button>

      {/* 时钟 */}
      <div className="rounded-md border border-line bg-panel-2/70 px-3 py-1.5 font-mono text-sm text-glow-dim">
        {fmtFull(now)}
      </div>
    </header>
  )
}
