/**
 * 园区总览页(第一阶段 MVP 核心)
 * 全屏 3D 场景 + 面包屑 + 钻取面板 + 图层工具栏 + 告警浮层 + 底部信息条
 */
import { ThreeScene } from '../three/ThreeScene'
import { Breadcrumb } from '../components/overlays/Breadcrumb'
import { DrillPanel } from '../components/overlays/DrillPanel'
import { LayerToolbar } from '../components/overlays/LayerToolbar'
import { BottomStrip } from '../components/overlays/BottomStrip'
import { AlertCard } from '../components/overlays/AlertCard'

export function ParkPage() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 3D 场景 */}
      <ThreeScene />

      {/* 顶部面包屑 */}
      <Breadcrumb className="absolute left-5 top-4" />

      {/* 左侧钻取面板 */}
      <DrillPanel className="absolute bottom-5 left-5 top-16" />

      {/* 右侧图层工具栏 */}
      <LayerToolbar className="absolute right-5 top-1/2 -translate-y-1/2" />

      {/* 告警详情(点击 3D 告警点位时出现) */}
      <AlertCard className="absolute bottom-5 left-[340px]" />

      {/* 底部 KPI + 告警流 */}
      <BottomStrip />
    </div>
  )
}
