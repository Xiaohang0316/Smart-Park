/**
 * 空间钻取侧边面板
 * 三个层级: 楼宇列表 -> 楼层列表 -> 楼层概览 + 房间列表(点击房间在 3D 内部高亮)
 */
import { useAppStore } from '../../store/useAppStore'
import type { RoomType } from '../../types'
import { getFloorPlan } from '../../data/mockData'
import { Icon } from '../Icon'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/** 房间类型 -> 颜色(与 3D 内部地面色块一致) */
const ROOM_COLOR: Record<RoomType, string> = {
  office: '#155e75',
  meeting: '#5b21b6',
  restroom: '#3f3f46',
  device: '#713f12',
  hall: '#101a2e'
}

export function DrillPanel({ className }: { className?: string }) {
  const buildings = useAppStore((s) => s.buildings)
  const selectedBuildingId = useAppStore((s) => s.selectedBuildingId)
  const selectedFloor = useAppStore((s) => s.selectedFloor)
  const selectBuilding = useAppStore((s) => s.selectBuilding)
  const selectFloor = useAppStore((s) => s.selectFloor)

  const building = buildings.find((b) => b.id === selectedBuildingId)

  return (
    <aside className={cn('panel flex w-[300px] flex-col overflow-hidden', className)}>
      {/* 面板标题 + 返回 */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3.5">
        <span className="text-sm font-medium text-slate-100">
          {building ? (selectedFloor == null ? `${building.name} · 楼层` : `${building.name} · ${selectedFloor}层`) : '园区建筑'}
        </span>
        {(selectedBuildingId || selectedFloor != null) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (selectedFloor != null) selectFloor(null)
              else selectBuilding(null)
            }}
          >
            <Icon name="arrow-left" className="h-3.5 w-3.5" />
            返回
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* 层级一: 楼宇列表 */}
        {!building && (
          <div className="space-y-2">
            {buildings.map((b) => (
              <button
                key={b.id}
                onClick={() => selectBuilding(b.id)}
                className="group w-full rounded-md border border-line bg-panel-2/50 p-3 text-left transition-colors hover:border-glow/40 hover:bg-glow/5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100 group-hover:text-glow">{b.name}</span>
                  <span className="text-xs text-slate-500">{b.floors}F</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {b.function} · 入驻率 {(b.occupancyRate * 100).toFixed(0)}%
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-glow-dim to-glow transition-all"
                    style={{ width: `${b.occupancyRate * 100}%` }}
                  />
                </div>
              </button>
            ))}
            <p className="pt-1 text-center text-[11px] text-slate-600">点击楼宇聚焦 · 也可直接点击 3D 场景中的楼体</p>
          </div>
        )}

        {/* 层级二: 楼层列表(点击后飞入楼层内部) */}
        {building && selectedFloor == null && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: building.floors }, (_, i) => i + 1).map((f) => (
                <button
                  key={f}
                  onClick={() => selectFloor(f)}
                  className="flex h-14 items-center justify-center rounded-md border border-line bg-panel-2/50 text-sm text-slate-300 transition-colors hover:border-glow/40 hover:bg-glow/5 hover:text-glow"
                >
                  {f}F
                </button>
              ))}
            </div>
            <p className="pt-2 text-center text-[11px] text-slate-600">点击楼层号, 相机飞入楼层内部漫游</p>
          </>
        )}

        {/* 层级三: 楼层概览 + 房间列表 */}
        {building && selectedFloor != null && <FloorOverview buildingId={building.id} floor={selectedFloor} />}
      </div>
    </aside>
  )
}

/** 楼层概览: 基本信息 + 房间列表(点击在 3D 内部高亮) */
function FloorOverview({ buildingId, floor }: { buildingId: string; floor: number }) {
  const building = useAppStore((s) => s.buildings.find((b) => b.id === buildingId))
  const selectedRoomId = useAppStore((s) => s.selectedRoomId)
  const selectRoom = useAppStore((s) => s.selectRoom)
  if (!building) return null

  const rooms = getFloorPlan(building, floor)
  const officeRooms = rooms.filter((r) => r.type === 'office')
  const avgOcc =
    officeRooms.length > 0 ? officeRooms.reduce((sum, r) => sum + r.occupancy, 0) / officeRooms.length : 0
  const estPeople = Math.round(
    rooms.filter((r) => r.type === 'office' || r.type === 'meeting').reduce((s, r) => s + r.w * r.h * r.occupancy * 2.5, 0)
  )

  return (
    <div className="space-y-3">
      {/* 楼层信息 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: '层高', value: `${building.floorHeight}m` },
          { label: '房间数', value: String(rooms.length) },
          { label: '办公区平均占用', value: `${(avgOcc * 100).toFixed(0)}%` },
          { label: '预估人数', value: `${estPeople} 人` }
        ].map((cell) => (
          <div key={cell.label} className="rounded-md border border-line bg-panel-2/50 px-2.5 py-2">
            <div className="text-[10px] text-slate-500">{cell.label}</div>
            <div className="font-mono text-sm text-slate-100">{cell.value}</div>
          </div>
        ))}
      </div>

      {/* 房间列表 */}
      <div className="space-y-1">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => selectRoom(selectedRoomId === r.id ? null : r.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors',
              selectedRoomId === r.id
                ? 'border-glow/60 bg-glow/10 text-slate-100'
                : 'border-line bg-panel-2/40 text-slate-300 hover:border-glow/30 hover:bg-glow/5'
            )}
          >
            <i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ROOM_COLOR[r.type] }} />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 text-slate-500">占用 {Math.round(r.occupancy * 100)}%</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-600">
        点击房间可在 3D 楼层内部高亮 · 鼠标滚轮 / 拖拽可在楼内自由漫游
      </p>
    </div>
  )
}
