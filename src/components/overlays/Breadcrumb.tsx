/**
 * 面包屑导航: 园区 > A栋 > 3楼
 * 点击任意层级可返回
 */
import { useAppStore } from '../../store/useAppStore'
import { Icon } from '../Icon'
import { cn } from '../../lib/utils'

export function Breadcrumb({ className }: { className?: string }) {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const buildings = useAppStore((s) => s.buildings)
  const selectedBuildingId = useAppStore((s) => s.selectedBuildingId)
  const selectedFloor = useAppStore((s) => s.selectedFloor)
  const back = useAppStore((s) => s.back)
  const selectFloor = useAppStore((s) => s.selectFloor)

  const building = buildings.find((b) => b.id === selectedBuildingId)

  return (
    <nav className={cn('panel flex h-9 items-center gap-1 px-3 text-sm', className)}>
      <button
        onClick={() => setView('park')}
        className={cn(
          'flex items-center gap-1.5 transition-colors',
          view === 'park' ? 'text-slate-300 hover:text-glow' : 'text-slate-300 hover:text-glow'
        )}
      >
        <Icon name="home" className="h-4 w-4" />
        园区总览
      </button>

      {view === 'park' && building && (
        <>
          <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-600" />
          <button
            onClick={back}
            className={cn(
              'transition-colors hover:text-glow',
              selectedFloor == null ? 'text-glow' : 'text-slate-400'
            )}
          >
            {building.name}
          </button>
        </>
      )}

      {view === 'park' && building && selectedFloor != null && (
        <>
          <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-600" />
          <button
            onClick={() => selectFloor(null)}
            className="text-glow transition-colors hover:text-glow-dim"
          >
            {selectedFloor} 层
          </button>
        </>
      )}
    </nav>
  )
}
