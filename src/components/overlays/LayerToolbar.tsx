/**
 * 图层叠加工具栏(右侧竖排)
 * 人流热力 / 车流状态 / 告警点位 / 绿化图层
 */
import { LAYER_META, useAppStore } from '../../store/useAppStore'
import { Icon } from '../Icon'
import { cn } from '../../lib/utils'

export function LayerToolbar({ className }: { className?: string }) {
  const layers = useAppStore((s) => s.layers)
  const toggleLayer = useAppStore((s) => s.toggleLayer)

  return (
    <div className={cn('panel w-[128px] overflow-hidden', className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-line px-3 text-xs text-slate-300">
        <Icon name="layers" className="h-3.5 w-3.5 text-glow" />
        图层叠加
      </div>
      <div className="p-1.5">
        {LAYER_META.map(({ key, label, color }) => {
          const active = layers[key]
          return (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors',
                active ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <i
                className="h-2 w-2 shrink-0 rounded-full transition-all"
                style={{
                  background: color,
                  opacity: active ? 1 : 0.25,
                  boxShadow: active ? `0 0 8px ${color}` : 'none'
                }}
              />
              {label}
              <span
                className={cn(
                  'ml-auto h-3.5 w-6 rounded-full border transition-colors',
                  active ? 'border-glow/60 bg-glow/20' : 'border-line bg-white/5'
                )}
              >
                <i
                  className="block h-2.5 w-2.5 rounded-full transition-transform"
                  style={{
                    background: active ? '#22d3ee' : '#475569',
                    transform: active ? 'translate(10px, 1.5px)' : 'translate(2px, 1.5px)'
                  }}
                />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
