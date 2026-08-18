/**
 * 全局类型定义(Mock 数据的数据结构)
 * 后续替换为真实 API 时, 只需要在 data 层保持相同结构即可
 */

/** 楼宇 */
export interface Building {
  id: string // 如 'A'
  name: string // 如 'A栋 · 研发中心'
  /** 三维场景世界坐标 (x, y, z), y 为地面高度 0 */
  position: [number, number, number]
  /** 尺寸 (宽, 高, 深) */
  size: [number, number, number]
  floors: number
  floorHeight: number
  /** 入驻率 0~1 */
  occupancyRate: number
  /** 日能耗 kWh */
  energyKwh: number
  /** 建筑功能 */
  function: string
  /** 楼层平面布局随机种子 */
  seed: number
}

/** 楼层 */
export interface Floor {
  id: string
  buildingId: string
  floorNumber: number
  rooms: Room[]
}

export type RoomType = 'office' | 'meeting' | 'restroom' | 'device' | 'hall'

/** 房间(简化平面图网格单元) */
export interface Room {
  id: string
  name: string
  type: RoomType
  /** 平面图网格坐标(网格为 6 列 x 5 行) */
  x: number
  y: number
  w: number
  h: number
  /** 人员占用率 0~1 */
  occupancy: number
}

export type ParkingStatus = 'free' | 'occupied' | 'reserved' | 'fault'

/** 车位 */
export interface ParkingSpot {
  id: string // 如 'A-01'
  zone: string // 分区 如 'A'
  status: ParkingStatus
  plateNumber?: string
  /** 预约截止时间戳(ms), 仅 reserved 时有 */
  reservedUntil?: number
  /** 世界坐标 (x, z), 2D 图与 3D 场景共用 */
  x: number
  z: number
}

export type AlertType = 'fire' | 'security' | 'device'
export type AlertLevel = 'info' | 'warning' | 'critical'

/** 告警 */
export interface Alert {
  id: string
  type: AlertType
  level: AlertLevel
  title: string
  description: string
  /** 3D 场景坐标(可选, 部分实时告警不落点) */
  position?: [number, number, number]
  timestamp: number
}

/** 人流数据点(看板折线图用) */
export interface PeopleFlowPoint {
  time: string // 'HH:MM'
  value: number
}
