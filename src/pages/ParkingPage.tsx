/**
 * 停车场模块
 * - 2D 车位平面图(颜色标识状态: 空闲绿/占用红/预约黄/故障灰)
 * - 点击车位弹出详情卡(编号/车牌/剩余时间)
 * - 反向寻车: 输入车位号, 高亮车位并绘制寻车路径线
 */
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { parkingConfig } from '../data/mockData'
import type { ParkingSpot } from '../types'
import { Icon } from '../components/Icon'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'

const STATUS_META: Record<ParkingSpot['status'], { label: string; color: string; badge: 'green' | 'red' | 'yellow' | 'gray' }> = {
  free: { label: '空闲', color: '#22c55e', badge: 'green' },
  occupied: { label: '占用', color: '#ef4444', badge: 'red' },
  reserved: { label: '预约', color: '#eab308', badge: 'yellow' },
  fault: { label: '故障', color: '#64748b', badge: 'gray' }
}

/** SVG 坐标映射(世界坐标 -> 视图坐标) */
const MIN_X = -66
const MIN_Z = 58
const toSvg = (x: number, z: number) => ({ x: x - MIN_X, y: z - MIN_Z })

export function ParkingPage() {
  const spots = useAppStore((s) => s.spots)
  const selectedSpotId = useAppStore((s) => s.selectedSpotId)
  const searchSpotId = useAppStore((s) => s.searchSpotId)
  const selectSpot = useAppStore((s) => s.selectSpot)
  const setSearchSpot = useAppStore((s) => s.setSearchSpot)
  const setView = useAppStore((s) => s.setView)

  const [query, setQuery] = useState('')
  const [notFound, setNotFound] = useState(false)

  const stats = useMemo(() => {
    const count = (st: ParkingSpot['status']) => spots.filter((s) => s.status === st).length
    return {
      total: spots.length,
      free: count('free'),
      occupied: count('occupied'),
      reserved: count('reserved'),
      fault: count('fault')
    }
  }, [spots])

  const usage = ((stats.occupied + stats.reserved) / stats.total) * 100
  const selected = spots.find((s) => s.id === selectedSpotId)

  /** 反向寻车 */
  const handleSearch = () => {
    const id = query.trim().toUpperCase()
    const spot = spots.find((s) => s.id === id)
    if (!spot) {
      setNotFound(true)
      setSearchSpot(null)
      window.setTimeout(() => setNotFound(false), 2000)
      return
    }
    setNotFound(false)
    setSearchSpot(spot.id)
    selectSpot(spot.id)
  }

  return (
    <div className="flex h-full">
      {/* 左侧控制区 */}
      <aside className="panel m-4 mr-0 flex w-[300px] shrink-0 flex-col gap-4 p-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-100">
            <Icon name="car" className="h-4 w-4 text-glow" />
            反向寻车
          </div>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入车位号, 如 C-05"
            />
            <Button variant="solid" size="sm" onClick={handleSearch}>
              <Icon name="search" className="h-3.5 w-3.5" />
              查找
            </Button>
          </div>
          {notFound && <p className="mt-1.5 text-xs text-red-400">未找到该车位, 请检查编号格式</p>}
          <p className="mt-1.5 text-[11px] text-slate-600">示例: A-01 · B-03 · C-05 · D-02</p>
        </div>

        {/* 使用率 */}
        <div className="rounded-md border border-line bg-panel-2/50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">车位使用率</span>
            <span className="font-mono text-lg text-glow">{usage.toFixed(1)}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-gradient-to-r from-glow-dim to-glow" style={{ width: `${usage}%` }} />
          </div>
        </div>

        {/* 状态统计与图例 */}
        <div className="grid grid-cols-2 gap-2">
          {(['free', 'occupied', 'reserved', 'fault'] as ParkingSpot['status'][]).map((st) => (
            <div key={st} className="flex items-center gap-2 rounded-md border border-line bg-panel-2/40 px-2.5 py-2">
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_META[st].color }} />
              <span className="text-xs text-slate-400">{STATUS_META[st].label}</span>
              <span className="ml-auto font-mono text-sm text-slate-100">{stats[st]}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setView('park')}>
            <Icon name="arrow-left" className="h-3.5 w-3.5" />
            返回园区总览
          </Button>
        </div>
      </aside>

      {/* 右侧平面图 */}
      <div className="relative min-w-0 flex-1 p-4">
        <div className="panel flex h-full items-center justify-center overflow-hidden">
          <ParkingMap spots={spots} selectedId={selectedSpotId} searchId={searchSpotId} onSelect={selectSpot} />
        </div>
      </div>

      {/* 车位详情卡 */}
      {selected && <SpotDetail spot={selected} onClose={() => selectSpot(null)} />}
    </div>
  )
}

/* ------------------------------ 2D 平面图 ------------------------------ */

function ParkingMap({
  spots,
  selectedId,
  searchId,
  onSelect
}: {
  spots: ParkingSpot[]
  selectedId: string | null
  searchId: string | null
  onSelect: (id: string) => void
}) {
  const zones = parkingConfig.zones
  const entrance = toSvg(parkingConfig.entrance.x, parkingConfig.entrance.z)

  /* 寻车路径: 入口 -> 目标车位(L 形折线) */
  const searchSpot = spots.find((s) => s.id === searchId)
  const path = useMemo(() => {
    if (!searchSpot) return ''
    const t = toSvg(searchSpot.x, searchSpot.z)
    return `M ${entrance.x} ${entrance.y} L ${entrance.x} ${t.y} L ${t.x} ${t.y}`
  }, [searchSpot, entrance.x, entrance.y])

  return (
    <svg viewBox="0 0 132 42" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* 区域底色 */}
      <rect x={toSvg(-60, 63).x} y={toSvg(0, 63).y} width={120} height={29} fill="#0b1730" stroke="rgba(34,211,238,0.15)" rx="2" />

      {/* 寻车路径 */}
      {path && (
        <path
          d={path}
          fill="none"
          stroke="#facc15"
          strokeWidth="1.4"
          strokeDasharray="6 4"
          className="path-anim"
          strokeLinecap="round"
        />
      )}

      {/* 车位 */}
      {spots.map((s) => {
        const p = toSvg(s.x, s.z)
        const meta = STATUS_META[s.status]
        const isSel = s.id === selectedId
        const isSearch = s.id === searchId
        return (
          <g key={s.id} onClick={() => onSelect(s.id)} className="cursor-pointer">
            <rect
              x={p.x - parkingConfig.spotW / 2}
              y={p.y - parkingConfig.spotH / 2}
              width={parkingConfig.spotW}
              height={parkingConfig.spotH}
              rx="0.5"
              fill={meta.color}
              opacity={isSel || isSearch ? 1 : 0.8}
              stroke={isSearch ? '#facc15' : isSel ? '#22d3ee' : 'rgba(255,255,255,0.12)'}
              strokeWidth={isSel || isSearch ? 2 : 0.6}
            />
            {/* 选中/寻车高亮光环 */}
            {(isSel || isSearch) && (
              <rect
                x={p.x - parkingConfig.spotW / 2 - 1.2}
                y={p.y - parkingConfig.spotH / 2 - 1.2}
                width={parkingConfig.spotW + 2.4}
                height={parkingConfig.spotH + 2.4}
                rx="1.2"
                fill="none"
                stroke={isSearch ? '#facc15' : '#22d3ee'}
                strokeWidth="0.6"
                className="pulse-ring"
              />
            )}
            <text
              x={p.x}
              y={p.y + 0.35}
              textAnchor="middle"
              fontSize="1.7"
              fill="#e2e8f0"
              fontFamily="monospace"
              pointerEvents="none"
            >
              {s.id}
            </text>
          </g>
        )
      })}

      {/* 分区标签 */}
      {zones.map((z) => (
        <text
          key={z.id}
          x={toSvg(z.x0 + 4, 0).x}
          y={toSvg(0, z.z0 - 2.5).y}
          fontSize="2.6"
          fill="#67e8f9"
          textAnchor="middle"
          letterSpacing="1"
        >
          {z.id} 区
        </text>
      ))}

      {/* 入口 */}
      <circle cx={entrance.x} cy={entrance.y} r="1.6" fill="#22d3ee" opacity="0.25" className="pulse-ring" />
      <circle cx={entrance.x} cy={entrance.y} r="0.9" fill="#22d3ee" />
      <text x={entrance.x} y={entrance.y - 2.6} fontSize="2.6" fill="#7dd3fc" textAnchor="middle">
        入口
      </text>
    </svg>
  )
}

/* ------------------------------ 详情卡 ------------------------------ */

function SpotDetail({ spot, onClose }: { spot: ParkingSpot; onClose: () => void }) {
  const meta = STATUS_META[spot.status]

  /* 本地 1s 计时, 驱动剩余时间倒计时 */
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const remainMin = spot.reservedUntil
    ? Math.max(0, Math.ceil((spot.reservedUntil - now) / 60000))
    : null

  return (
    <div className="panel absolute right-6 top-6 w-[280px] overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-medium text-slate-100">车位 {spot.id}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <Icon name="x" className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-3 p-4 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={meta.badge}>{meta.label}</Badge>
          <Badge variant="cyan">{spot.zone} 区</Badge>
        </div>
        <div className="grid grid-cols-2 gap-y-2">
          <span className="text-slate-500">车牌号</span>
          <span className="font-mono text-slate-100">{spot.plateNumber ?? '--'}</span>
          <span className="text-slate-500">剩余时间</span>
          <span className="font-mono text-glow">
            {remainMin != null ? `${remainMin} 分钟` : spot.status === 'reserved' ? '--' : '--'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-panel-2/50 px-2.5 py-2 text-[11px] text-slate-400">
          <Icon name="map-pin" className="h-3.5 w-3.5 text-glow" />
          区域坐标 ({spot.x.toFixed(0)}, {spot.z.toFixed(0)})
        </div>
      </div>
    </div>
  )
}
