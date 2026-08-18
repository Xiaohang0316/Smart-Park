/**
 * 数据看板
 * - KPI 指标卡(数字滚动动效)
 * - 24h 人流折线(实时追加) / 楼宇能耗柱状 / 告警类型分布环图
 * - 实时告警列表
 */
import { useMemo } from 'react'
import * as echarts from 'echarts'
import { useAppStore } from '../store/useAppStore'
import { EChart } from '../components/charts/EChart'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui/badge'
import { timeAgo } from '../lib/time'
import { useCountUp } from '../hooks/useCountUp'
import { cn } from '../lib/utils'

const LEVEL_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-sky-400'
}
const LEVEL_BADGE: Record<string, 'red' | 'yellow' | 'blue'> = {
  critical: 'red',
  warning: 'yellow',
  info: 'blue'
}

/* ------------------------------ KPI 卡片 ------------------------------ */

function KpiCard({
  icon,
  label,
  value,
  unit,
  sub,
  iconClass
}: {
  icon: string
  label: string
  value: number
  unit: string
  sub: string
  iconClass: string
}) {
  const display = useCountUp(value)
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-panel-2/60', iconClass)}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl leading-tight text-slate-100">
              {Math.round(display).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">{unit}</span>
          </div>
          <div className="truncate text-[11px] text-slate-600">{sub}</div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------------ 图表 option ------------------------------ */

const AXIS_LABEL = '#7c8db5'
const SPLIT_LINE = 'rgba(148, 163, 184, 0.12)'

/** 24h 人流折线 */
function usePeopleFlowOption() {
  const peopleFlow = useAppStore((s) => s.peopleFlow)
  return useMemo<echarts.EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 30, bottom: 30 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: peopleFlow.map((p) => p.time),
        boundaryGap: false,
        axisLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_LABEL, interval: 'auto' },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_LABEL }
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: peopleFlow.map((p) => p.value),
          lineStyle: { width: 2.5, color: '#22d3ee' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(34, 211, 238, 0.35)' },
              { offset: 1, color: 'rgba(34, 211, 238, 0.02)' }
            ])
          },
          animationDuration: 400
        }
      ]
    }),
    [peopleFlow]
  )
}

/** 各楼宇能耗柱状 */
function useEnergyOption() {
  const buildings = useAppStore((s) => s.buildings)
  return useMemo<echarts.EChartsOption>(
    () => ({
      backgroundColor: 'transparent',
      grid: { left: 48, right: 16, top: 30, bottom: 30 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: buildings.map((b) => b.name.split('·')[0].trim()),
        axisLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_LABEL },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: AXIS_LABEL },
        splitLine: { lineStyle: { color: SPLIT_LINE } },
        axisLabel: { color: AXIS_LABEL }
      },
      series: [
        {
          type: 'bar',
          barWidth: 22,
          data: buildings.map((b) => b.energyKwh),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#22d3ee' },
              { offset: 1, color: '#3b82f6' }
            ])
          },
          label: { show: true, position: 'top', color: '#94a3b8', fontSize: 10 }
        }
      ]
    }),
    [buildings]
  )
}

/** 告警类型分布环图 */
function useAlertPieOption() {
  const alerts = useAppStore((s) => s.alerts)
  return useMemo<echarts.EChartsOption>(() => {
    const typeMeta: Record<string, { name: string; color: string }> = {
      fire: { name: '消防', color: '#ef4444' },
      security: { name: '安防', color: '#f59e0b' },
      device: { name: '设备', color: '#38bdf8' }
    }
    const data = Object.entries(typeMeta).map(([type, meta]) => ({
      name: meta.name,
      value: alerts.filter((a) => a.type === type).length,
      itemStyle: { color: meta.color }
    }))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: AXIS_LABEL, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: false,
          itemStyle: { borderColor: '#0d1526', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
          data
        }
      ],
      graphic: {
        type: 'text',
        left: 'center',
        top: '38%',
        style: { text: String(alerts.length), fill: '#e2e8f0', fontSize: 22, fontWeight: 'bold' }
      }
    }
  }, [alerts])
}

/* ------------------------------ 页面 ------------------------------ */

export function DashboardPage() {
  const peopleFlow = useAppStore((s) => s.peopleFlow)
  const spots = useAppStore((s) => s.spots)
  const buildings = useAppStore((s) => s.buildings)
  const alerts = useAppStore((s) => s.alerts)

  const peopleOption = usePeopleFlowOption()
  const energyOption = useEnergyOption()
  const pieOption = useAlertPieOption()

  const usage = ((spots.filter((s) => s.status === 'occupied' || s.status === 'reserved').length) / spots.length) * 100
  const totalEnergy = buildings.reduce((sum, b) => sum + b.energyKwh, 0)
  const activeAlerts = alerts.filter((a) => a.level !== 'info').length
  const todayPeople = Math.round(peopleFlow.reduce((sum, p) => sum + p.value, 0) * 0.12)

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon="users" label="今日累计人流" value={todayPeople} unit="人次" sub={`当前实时 ${peopleFlow[peopleFlow.length - 1]?.value.toLocaleString() ?? 0} 人`} iconClass="text-glow" />
        <KpiCard icon="car" label="车位使用率" value={usage} unit="%" sub={`空闲 ${spots.filter((s) => s.status === 'free').length} / 共 ${spots.length}`} iconClass="text-amber-400" />
        <KpiCard icon="zap" label="今日能耗" value={totalEnergy} unit="kWh" sub="较昨日 +4.2%" iconClass="text-yellow-400" />
        <KpiCard icon="bell" label="活跃告警" value={activeAlerts} unit="条" sub={`历史累计 ${alerts.length} 条`} iconClass="text-red-400" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>
              <Icon name="activity" className="h-4 w-4 text-glow" />
              24 小时人流趋势
              <Badge variant="green">实时</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={peopleOption} height={250} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Icon name="alert-triangle" className="h-4 w-4 text-red-400" />
              告警类型分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={pieOption} height={250} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <Icon name="zap" className="h-4 w-4 text-yellow-400" />
              各楼宇日能耗对比
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={energyOption} height={230} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Icon name="bell" className="h-4 w-4 text-glow" />
              实时告警列表
              <Badge variant="red">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[250px] overflow-y-auto p-2">
            <div className="space-y-0.5">
              {alerts.slice(0, 20).map((a) => (
                <div key={a.id} className="alert-in flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs hover:bg-white/5">
                  <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[a.level])} />
                  <span className="min-w-0 flex-1 truncate text-slate-300">{a.title}</span>
                  <Badge variant={LEVEL_BADGE[a.level]} className="shrink-0">
                    {a.level === 'critical' ? '严重' : a.level === 'warning' ? '警告' : '提示'}
                  </Badge>
                  <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
              {alerts.length === 0 && <div className="px-2 py-3 text-center text-xs text-slate-600">暂无告警</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
