/**
 * 告警详情浮层(点击 3D 场景告警点位或告警流时展示)
 */
import { useAppStore } from '../../store/useAppStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Icon } from '../Icon'
import { fmtFull, timeAgo } from '../../lib/time'

const LEVEL_META: Record<string, { label: string; variant: 'red' | 'yellow' | 'blue' }> = {
  critical: { label: '严重', variant: 'red' },
  warning: { label: '警告', variant: 'yellow' },
  info: { label: '提示', variant: 'blue' }
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  fire: { label: '消防', icon: 'flame' },
  security: { label: '安防', icon: 'shield' },
  device: { label: '设备', icon: 'wrench' }
}

export function AlertCard({ className }: { className?: string }) {
  const alerts = useAppStore((s) => s.alerts)
  const selectedAlertId = useAppStore((s) => s.selectedAlertId)
  const selectAlert = useAppStore((s) => s.selectAlert)

  const alert = alerts.find((a) => a.id === selectedAlertId)
  if (!alert) return null

  const level = LEVEL_META[alert.level]
  const type = TYPE_META[alert.type]

  return (
    <div className={`panel w-[320px] overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <Icon name={type.icon} className="h-4 w-4 text-red-400" />
          {alert.title}
        </span>
        <Button variant="ghost" size="sm" onClick={() => selectAlert(null)}>
          <Icon name="x" className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2.5 p-4 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={level.variant}>{level.label}</Badge>
          <Badge variant="cyan">{type.label}</Badge>
          <span className="text-slate-500">{timeAgo(alert.timestamp)}</span>
        </div>
        <p className="leading-relaxed text-slate-300">{alert.description}</p>
        <p className="font-mono text-[10px] text-slate-600">{fmtFull(alert.timestamp)}</p>
      </div>
    </div>
  )
}
