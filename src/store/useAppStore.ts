/**
 * 全局状态管理(Zustand)
 * - 视图/图层/钻取导航状态
 * - 模拟实时数据(车位/人流/告警)的 tick 更新逻辑
 */
import { create } from 'zustand'
import type { Alert, ParkingSpot, PeopleFlowPoint } from '../types'
import { buildings as initialBuildings, generateSpots, generatePeopleFlow, initialAlerts, PLATES } from '../data/mockData'
import { randomAlert } from '../data/mockData'

export type View = 'park' | 'parking' | 'dashboard'
export type LayerKey = 'heatmap' | 'traffic' | 'alert' | 'greenery'

/** 图层元信息(顺序即展示顺序) */
export const LAYER_META: { key: LayerKey; label: string; color: string }[] = [
  { key: 'heatmap', label: '人流热力', color: '#f59e0b' },
  { key: 'traffic', label: '车流状态', color: '#22d3ee' },
  { key: 'alert', label: '告警点位', color: '#ef4444' },
  { key: 'greenery', label: '绿化图层', color: '#22c55e' }
]

interface AppState {
  /** 当前视图(轻量路由) */
  view: View
  isDay: boolean
  /** 图层开关 */
  layers: Record<LayerKey, boolean>

  /* ---------- 钻取导航状态 ---------- */
  selectedBuildingId: string | null
  selectedFloor: number | null
  /** 楼层内部视角下高亮的房间 */
  selectedRoomId: string | null
  selectedAlertId: string | null

  /* ---------- 停车场 ---------- */
  selectedSpotId: string | null
  /** 反向寻车高亮的车位 */
  searchSpotId: string | null

  /* ---------- 实时数据 ---------- */
  buildings: typeof initialBuildings
  spots: ParkingSpot[]
  alerts: Alert[]
  peopleFlow: PeopleFlowPoint[]

  /* ---------- 动作 ---------- */
  setView: (v: View) => void
  setDayMode: (d: boolean) => void
  toggleLayer: (k: LayerKey) => void
  selectBuilding: (id: string | null) => void
  selectFloor: (n: number | null) => void
  selectRoom: (id: string | null) => void
  selectAlert: (id: string | null) => void
  /** 面包屑返回: 有楼层先退楼层, 否则退楼宇 */
  back: () => void
  selectSpot: (id: string | null) => void
  setSearchSpot: (id: string | null) => void
  /* 模拟实时数据流 tick */
  tickParking: () => void
  tickPeopleFlow: () => void
  maybePushAlert: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'park',
  isDay: true,
  layers: { heatmap: true, traffic: true, alert: true, greenery: true },

  selectedBuildingId: null,
  selectedFloor: null,
  selectedRoomId: null,
  selectedAlertId: null,
  selectedSpotId: null,
  searchSpotId: null,

  buildings: initialBuildings,
  spots: generateSpots(),
  alerts: initialAlerts,
  peopleFlow: generatePeopleFlow(),

  setView: (view) => set({ view }),
  setDayMode: (isDay) => set({ isDay }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  selectBuilding: (id) => set({ selectedBuildingId: id, selectedFloor: null, selectedRoomId: null, selectedAlertId: null }),
  selectFloor: (n) => set({ selectedFloor: n, selectedRoomId: null }),
  selectRoom: (id) => set({ selectedRoomId: id }),
  selectAlert: (id) => set({ selectedAlertId: id }),
  back: () => {
    const s = get()
    if (s.selectedFloor != null) set({ selectedFloor: null, selectedRoomId: null })
    else set({ selectedBuildingId: null, selectedAlertId: null, selectedRoomId: null })
  },
  selectSpot: (id) => set({ selectedSpotId: id, searchSpotId: null }),
  setSearchSpot: (id) => set({ searchSpotId: id }),

  /* ---- 每 3s: 随机翻转若干车位状态, 模拟 IoT 地磁/闸机数据 ---- */
  tickParking: () =>
    set((s) => {
      const spots = s.spots.map((p) => ({ ...p }))
      // 先处理预约超时
      const now = Date.now()
      for (const p of spots) {
        if (p.status === 'reserved' && p.reservedUntil && p.reservedUntil < now) {
          p.status = 'occupied'
        }
      }
      // 随机 2~4 个车位状态迁移
      const n = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const p = spots[Math.floor(Math.random() * spots.length)]
        if (p.status === 'free') {
          const r = Math.random()
          if (r < 0.55) {
            p.status = 'occupied'
            p.plateNumber = PLATES[Math.floor(Math.random() * PLATES.length)]
          } else if (r < 0.75) {
            p.status = 'reserved'
            p.plateNumber = PLATES[Math.floor(Math.random() * PLATES.length)]
            p.reservedUntil = now + (15 + Math.floor(Math.random() * 75)) * 60000
          } else {
            p.status = 'fault'
          }
        } else if (p.status === 'occupied') {
          if (Math.random() < 0.5) {
            p.status = 'free'
            p.plateNumber = undefined
            p.reservedUntil = undefined
          }
        } else if (p.status === 'fault') {
          if (Math.random() < 0.5) p.status = 'free'
        }
      }
      return { spots }
    }),

  /* ---- 每 2s: 追加一个人流数据点(随机游走) ---- */
  tickPeopleFlow: () =>
    set((s) => {
      const last = s.peopleFlow[s.peopleFlow.length - 1]
      const value = Math.max(400, Math.min(4200, Math.round(last.value + (Math.random() - 0.5) * 600)))
      const time = new Date().toTimeString().slice(0, 5)
      return { peopleFlow: [...s.peopleFlow, { time, value }].slice(-60) }
    }),

  /* ---- 每 6s: 40% 概率推送一条新告警 ---- */
  maybePushAlert: () => {
    if (Math.random() < 0.4) {
      set((s) => ({ alerts: [randomAlert(), ...s.alerts].slice(0, 40) }))
    }
  }
}))
