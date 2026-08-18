/**
 * Three.js 场景的 React 封装
 * 负责引擎生命周期与 store 状态 -> 引擎指令的桥接
 */
import { useEffect, useRef } from 'react'
import { ParkEngine, type ClickResult } from './engine'
import { useAppStore, type LayerKey } from '../store/useAppStore'

export function ThreeScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ParkEngine | null>(null)
  const prevBuildingId = useRef<string | null>(null)

  const isDay = useAppStore((s) => s.isDay)
  const layers = useAppStore((s) => s.layers)
  const selectedBuildingId = useAppStore((s) => s.selectedBuildingId)
  const selectedFloor = useAppStore((s) => s.selectedFloor)
  const selectedRoomId = useAppStore((s) => s.selectedRoomId)
  const spots = useAppStore((s) => s.spots)

  /* 创建引擎(仅一次) */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const engine = new ParkEngine(el, {
      onObjectClick: (r: ClickResult) => {
        const s = useAppStore.getState()
        if (r.type === 'room' && r.id) {
          s.selectRoom(r.id)
        } else if (r.type === 'building' && r.id) {
          // 楼层内部视角时点击自身外壳不处理(内部优先拾取房间)
          if (s.selectedBuildingId === r.id && s.selectedFloor != null) return
          s.selectBuilding(r.id)
        } else if (r.type === 'alert' && r.id) {
          s.selectAlert(r.id)
        } else if (r.type === 'parking') {
          s.selectSpot(r.id ?? null)
          s.setView('parking')
        }
      }
    })
    engineRef.current = engine
    engine.setParkingSpots(useAppStore.getState().spots)
    ;(window as unknown as Record<string, unknown>).__parkEngine = engine // debug: headless 坐标校验用
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  /* 昼夜 */
  useEffect(() => {
    engineRef.current?.setDayMode(isDay)
  }, [isDay])

  /* 图层开关 */
  useEffect(() => {
    const e = engineRef.current
    if (!e) return
    ;(Object.keys(layers) as LayerKey[]).forEach((k) => e.setLayer(k, layers[k]))
  }, [layers])

  /* 选中楼宇 -> 相机飞行; 取消选中 -> 回到总览 */
  useEffect(() => {
    const e = engineRef.current
    if (!e) return
    if (selectedBuildingId && selectedBuildingId !== prevBuildingId.current) {
      e.flyToBuilding(selectedBuildingId)
    } else if (!selectedBuildingId && prevBuildingId.current) {
      e.resetView()
    }
    prevBuildingId.current = selectedBuildingId
  }, [selectedBuildingId])

  /* 楼层钻取: 点击楼层 -> 飞入楼内; 返回 -> 退出内部回到楼宇外观 */
  useEffect(() => {
    const e = engineRef.current
    if (!e) return
    if (selectedBuildingId && selectedFloor != null) {
      e.enterFloor(selectedBuildingId, selectedFloor)
    } else if (selectedBuildingId) {
      if (e.exitInterior()) e.flyToBuilding(selectedBuildingId)
    } else {
      e.exitInterior()
    }
  }, [selectedBuildingId, selectedFloor])

  /* 房间高亮 */
  useEffect(() => {
    engineRef.current?.highlightRoom(selectedRoomId)
  }, [selectedRoomId])

  /* 车位状态实时同步到 3D 场景 */
  useEffect(() => {
    engineRef.current?.setParkingSpots(spots)
  }, [spots])

  return <div ref={containerRef} className="absolute inset-0" />
}
