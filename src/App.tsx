/**
 * 应用入口: 轻量视图路由 + 启动模拟实时数据流
 */
import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { startMockStream } from './data/mockStream'
import { Header } from './components/layout/Header'
import { ParkPage } from './pages/ParkPage'
import { ParkingPage } from './pages/ParkingPage'
import { DashboardPage } from './pages/DashboardPage'

export default function App() {
  const view = useAppStore((s) => s.view)

  // 启动模拟 IoT 实时数据流(组件卸载时清理)
  useEffect(() => {
    const stop = startMockStream()
    return stop
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-deep text-slate-200">
      <Header />
      <main className="relative min-h-0 flex-1">
        {view === 'park' && <ParkPage />}
        {view === 'parking' && <ParkingPage />}
        {view === 'dashboard' && <DashboardPage />}
      </main>
    </div>
  )
}
