/**
 * Mock 数据层: 静态园区数据 + 确定性随机生成器
 * 所有生成逻辑集中在这里, 后续可整体替换为真实 API 调用
 */
import type { Alert, Building, ParkingSpot, PeopleFlowPoint, Room } from '../types'

/** 确定性随机数生成器(同一 seed 生成相同序列, 保证布局稳定) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------------------------- 楼宇 ---------------------------------- */

/** 园区 6 栋楼, 排布为两排三列, 坐标与三维场景一致 */
export const buildings: Building[] = [
  { id: 'A', name: 'A栋 · 研发中心', position: [-55, 0, -35], size: [30, 19.2, 24], floors: 6, floorHeight: 3.2, occupancyRate: 0.88, energyKwh: 1860, function: '研发办公', seed: 11 },
  { id: 'B', name: 'B栋 · 总部大厦', position: [0, 0, -35], size: [34, 25.6, 26], floors: 8, floorHeight: 3.2, occupancyRate: 0.95, energyKwh: 2480, function: '总部办公', seed: 23 },
  { id: 'C', name: 'C栋 · 创新孵化', position: [55, 0, -35], size: [28, 16, 22], floors: 5, floorHeight: 3.2, occupancyRate: 0.72, energyKwh: 1240, function: '孵化办公', seed: 37 },
  { id: 'D', name: 'D栋 · 数据中心', position: [-55, 0, 35], size: [30, 19.2, 24], floors: 6, floorHeight: 3.2, occupancyRate: 0.91, energyKwh: 3120, function: '数据中心', seed: 41 },
  { id: 'E', name: 'E栋 · 智能制造', position: [0, 0, 35], size: [34, 12.8, 26], floors: 4, floorHeight: 3.2, occupancyRate: 0.8, energyKwh: 2050, function: '厂房研发', seed: 53 },
  { id: 'F', name: 'F栋 · 综合服务', position: [55, 0, 35], size: [28, 22.4, 22], floors: 7, floorHeight: 3.2, occupancyRate: 0.66, energyKwh: 980, function: '配套服务', seed: 67 }
]

/* ---------------------------------- 道路 ---------------------------------- */

/** 道路折线(供 3D 铺路与车流粒子使用) */
export const roads: { name: string; points: [number, number][] }[] = [
  { name: '北环', points: [[-110, -100], [110, -100]] },
  { name: '南环', points: [[-110, 100], [110, 100]] },
  { name: '东环', points: [[110, -100], [110, 100]] },
  { name: '西环', points: [[-110, -100], [-110, 100]] },
  { name: '中横路', points: [[-110, 0], [110, 0]] },
  { name: '中纵路', points: [[0, -100], [0, 100]] },
  { name: '北一横', points: [[-110, -60], [110, -60]] },
  { name: '南一横', points: [[-110, 60], [110, 60]] }
]

/* ---------------------------------- 停车场 ---------------------------------- */

/** 停车场 2D/3D 统一布局配置 */
export const parkingConfig = {
  entrance: { x: 0, z: 94 }, // 入口
  /** 6 个分区, 两排三列 */
  zones: [
    { id: 'A', x0: -45, z0: 66 },
    { id: 'B', x0: -15, z0: 66 },
    { id: 'C', x0: 15, z0: 66 },
    { id: 'D', x0: -45, z0: 84 },
    { id: 'E', x0: -15, z0: 84 },
    { id: 'F', x0: 15, z0: 84 }
  ],
  cols: 4, // 每区列数
  rows: 2, // 每区行数
  spotW: 2.2,
  spotH: 3.4,
  gapX: 0.5,
  gapZ: 0.6
}

const PLATES = ['沪A·8K2T9', '沪B·C3M21', '粤B·9X7Q1', '京N·5D0Z8', '浙A·2F6R3', '苏E·7H4L5', '沪C·1M9B7', '川A·3Q2W8', '闽D·6N5E4', '鄂A·4T8Y2', '沪D·5V3X6', '湘A·2K7J9']

/** 生成全部 48 个车位(6 区 x 8 位), 初始状态随机分布 */
export function generateSpots(): ParkingSpot[] {
  const rnd = mulberry32(7)
  const spots: ParkingSpot[] = []
  for (const zone of parkingConfig.zones) {
    for (let i = 0; i < parkingConfig.cols * parkingConfig.rows; i++) {
      const col = i % parkingConfig.cols
      const row = Math.floor(i / parkingConfig.cols)
      const x = zone.x0 + col * (parkingConfig.spotW + parkingConfig.gapX)
      const z = zone.z0 + row * (parkingConfig.spotH + parkingConfig.gapZ)
      const r = rnd()
      let status: ParkingSpot['status'] = 'free'
      if (r < 0.42) status = 'free'
      else if (r < 0.76) status = 'occupied'
      else if (r < 0.9) status = 'reserved'
      else status = 'fault'
      spots.push({
        id: `${zone.id}-${String(i + 1).padStart(2, '0')}`,
        zone: zone.id,
        status,
        plateNumber: status === 'occupied' || status === 'reserved' ? PLATES[Math.floor(rnd() * PLATES.length)] : undefined,
        reservedUntil: status === 'reserved' ? Date.now() + (15 + Math.floor(rnd() * 75)) * 60000 : undefined,
        x,
        z
      })
    }
  }
  return spots
}

/* ---------------------------------- 告警 ---------------------------------- */

/** 初始告警(带 3D 点位) */
export const initialAlerts: Alert[] = [
  {
    id: 'al-1', type: 'fire', level: 'critical',
    title: '烟感报警 · A栋3层走廊',
    description: 'A栋3层西侧走廊烟感探测器触发报警, 请立即前往核实',
    position: [-46, 0, -28], timestamp: Date.now() - 1000 * 60 * 12
  },
  {
    id: 'al-2', type: 'security', level: 'warning',
    title: '门禁异常 · D栋南门',
    description: 'D栋南门人脸闸机连续 3 次识别失败, 疑似尾随闯入',
    position: [-42, 0, 30], timestamp: Date.now() - 1000 * 60 * 34
  },
  {
    id: 'al-3', type: 'device', level: 'warning',
    title: '空调主机负载过高 · B栋',
    description: 'B栋 2 号冷水机组负载达 92%, 接近告警阈值 90%',
    position: [8, 0, -22], timestamp: Date.now() - 1000 * 60 * 58
  },
  {
    id: 'al-4', type: 'security', level: 'info',
    title: '地磁感应 · F区车位',
    description: '停车场 F 区 3 号车位地磁传感器离线恢复',
    position: [18, 0, 88], timestamp: Date.now() - 1000 * 60 * 90
  }
]

/** 实时告警模板(模拟 IoT 推送) */
const ALERT_TEMPLATES: Omit<Alert, 'id' | 'timestamp'>[] = [
  { type: 'fire', level: 'critical', title: '烟感报警 · C栋2层电梯厅', description: 'C栋2层电梯厅烟感触发, 已联动喷淋预案' },
  { type: 'device', level: 'warning', title: '设备离线 · 供水泵房', description: '供水泵房 2 号机组心跳丢失超过 60 秒' },
  { type: 'security', level: 'warning', title: '周界入侵告警 · 园区东侧', description: '东侧围栏红外对射触发, 已派安保巡检' },
  { type: 'device', level: 'info', title: '能耗异常 · 数据中心D栋', description: 'D栋 PUE 瞬时值 1.38, 超出基线 0.05' },
  { type: 'security', level: 'info', title: '访客预约审批', description: '访客预约单 WS-20260815-014 已通过审批' },
  { type: 'device', level: 'warning', title: '电梯困人监测 · F栋1号梯', description: 'F栋 1 号电梯轿厢停留 3 层超过 5 分钟' }
]

/** 随机生成一条新告警(模拟实时推送) */
export function randomAlert(): Alert {
  const t = ALERT_TEMPLATES[Math.floor(Math.random() * ALERT_TEMPLATES.length)]
  return { ...t, id: `al-${Date.now()}-${Math.floor(Math.random() * 1000)}`, timestamp: Date.now() }
}

/* ---------------------------------- 人流 ---------------------------------- */

/** 生成 24 小时基线人流(早晚双峰曲线 + 噪声) */
export function generatePeopleFlow(): PeopleFlowPoint[] {
  const rnd = mulberry32(99)
  const points: PeopleFlowPoint[] = []
  for (let h = 0; h < 24; h++) {
    const morning = 1500 * Math.exp(-((h - 9) ** 2) / 4)
    const evening = 1600 * Math.exp(-((h - 18) ** 2) / 4)
    const base = 380 + morning + evening
    const value = Math.round(base + (rnd() - 0.5) * 240)
    points.push({ time: `${String(h).padStart(2, '0')}:00`, value })
  }
  return points
}

/* ---------------------------------- 楼层平面 ---------------------------------- */

/** 生成某栋某层的简化平面图(6 列 x 5 行网格, 居中走廊布局) */
export function getFloorPlan(building: Building, floor: number): Room[] {
  const rnd = mulberry32(building.seed * 100 + floor * 7)
  const occ = () => Math.round((30 + rnd() * 65)) / 100
  const rooms: Room[] = [
    { id: `${building.id}-${floor}-01`, name: '办公区甲', type: 'office', x: 0, y: 0, w: 2, h: 2, occupancy: occ() },
    { id: `${building.id}-${floor}-02`, name: '办公区乙', type: 'office', x: 0, y: 2, w: 2, h: 2, occupancy: occ() },
    { id: `${building.id}-${floor}-03`, name: '会议室', type: 'meeting', x: 3, y: 0, w: 3, h: 2, occupancy: occ() },
    { id: `${building.id}-${floor}-04`, name: '办公区丙', type: 'office', x: 3, y: 2, w: 3, h: 2, occupancy: occ() },
    { id: `${building.id}-${floor}-05`, name: '洗手间', type: 'restroom', x: 0, y: 4, w: 2, h: 1, occupancy: 0.5 },
    { id: `${building.id}-${floor}-06`, name: '设备间', type: 'device', x: 3, y: 4, w: 3, h: 1, occupancy: 1 },
    { id: `${building.id}-${floor}-07`, name: '走廊', type: 'hall', x: 2, y: 0, w: 1, h: 5, occupancy: 1 }
  ]
  return rooms
}

export { PLATES }
