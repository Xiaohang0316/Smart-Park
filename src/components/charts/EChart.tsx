/**
 * ECharts 轻量 React 封装
 * 负责实例生命周期、自适应尺寸与 option 更新(merge 模式支持实时数据)
 */
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export function EChart({ option, height = 260, className }: { option: echarts.EChartsOption; height?: number; className?: string }) {
  const divRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    const chart = echarts.init(el)
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option)
  }, [option])

  return <div ref={divRef} style={{ height }} className={className ?? 'w-full'} />
}
