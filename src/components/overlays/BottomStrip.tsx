/**
 * 底部信息条: 左侧 KPI 迷你指标, 右侧实时告警推送流
 */
import { useAppStore } from '../../store/useAppStore'
import { Icon } from '../Icon'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'

const LEVEL_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-sky-400'
}

/** 迷你 KPI 指标卡 */
function KpiChip({ icon, label, value, unit, color }: { icon: string; label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-panel-2/60 px-3 py-2 backdrop-blur-md">
      <Icon name={icon} className={cn('h-4 w-4', color)} />
      <div>
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="font-mono text-sm leading-tight text-slate-100">
          {value}
          {unit && <span className="ml-0.5 text-[10px] text-slate-500">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export function BottomStrip({ className }: { className?: string }) {
  const peopleFlow = useAppStore((s) => s.peopleFlow)
  const spots = useAppStore((s) => s.spots)
  const alerts = useAppStore((s) => s.alerts)

  const lastFlow = peopleFlow[peopleFlow.length - 1]?.value ?? 0
  const occupied = spots.filter((s) => s.status === 'occupied').length
  const reserved = spots.filter((s) => s.status === 'reserved').length
  const usage = ((occupied + reserved) / spots.length) * 100
  const activeAlerts = alerts.filter((a) => a.level !== 'info').length

  return (
    <div className={cn('pointer-events-none absolute inset-x-5 bottom-5 flex items-end justify-between gap-4', className)}>
      {/* 左: KPI */}
      <div className="pointer-events-auto flex items-center gap-2.5">
        <KpiChip icon="users" label="实时人流" value={lastFlow.toLocaleString()} unit="人" color="text-glow" />
        <KpiChip icon="car" label="车位使用率" value={usage.toFixed(1)} unit="%" color="text-amber-400" />
        <KpiChip icon="bell" label="活跃告警" value={String(activeAlerts)} unit="条" color="text-red-400" />
      </div>

      {/* 右: 告警流 */}
      <div className="pointer-events-auto w-[300px] rounded-lg border border-line bg-panel/85 backdrop-blur-md">
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-300">
            <Icon name="activity" className="h-3.5 w-3.5 text-red-400" />
            实时告警
          </span>
          <span className="relative flex h-1.5 w-1.5">
            <i className="absolute h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <i className="h-1.5 w-1.5 rounded-full bg-red-500" />
          </span>
        </div>
        <div className="max-h-[136px] space-y-0.5 overflow-y-auto p-1.5">
          {alerts.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="alert-in flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-white/5"
            >
              <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[a.level])} />
              <span className="min-w-0 flex-1 truncate text-slate-300">{a.title}</span>
              <span className="shrink-0 text-slate-600">{timeAgo(a.timestamp)}</span>
            </div>
          ))}
          {alerts.length === 0 && <div className="px-1.5 py-2 text-[11px] text-slate-600">暂无告警</div>}
        </div>
      </div>
    </div>
  )
}
