/**
 * 园区三维场景引擎
 * 职责: 场景构建(地面/道路/楼宇/绿化/停车场)、拾取交互、
 *       相机飞行、图层开关、昼夜平滑切换、模拟动画(车流/热力脉冲/告警闪烁)
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { buildings, roads, parkingConfig, initialAlerts, getFloorPlan, mulberry32 } from '../data/mockData'
import type { Building, ParkingSpot } from '../types'
import type { LayerKey } from '../store/useAppStore'
import { createWindowTexture, createHeatTexture, heatColorByIntensity } from './textures'

export type ClickResult =
  | { type: 'building'; id: string }
  | { type: 'alert'; id: string }
  | { type: 'parking'; id?: string }
  | { type: 'room'; id: string }

export interface EngineCallbacks {
  onObjectClick?: (r: ClickResult) => void
}

/** 车位状态 -> 颜色 */
const STATUS_COLOR: Record<string, number> = {
  free: 0x22c55e,
  occupied: 0xef4444,
  reserved: 0xeab308,
  fault: 0x64748b
}

/* 昼夜配色 */
const DAY_BG = new THREE.Color('#93b4d4')
const NIGHT_BG = new THREE.Color('#030812')
const DAY_GROUND = new THREE.Color('#22344e')
const NIGHT_GROUND = new THREE.Color('#0b1526')
const DAY_SUN = new THREE.Color('#fff3da')
const NIGHT_MOON = new THREE.Color('#9db4ff')

interface FlightState {
  from: THREE.Vector3
  to: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  t: number
  dur: number
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 网格线段去重键(两端点归一化排序) */
function segKey(a: [number, number], b: [number, number]): string {
  const sorted = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a]
  return `${sorted[0][0]},${sorted[0][1]}|${sorted[1][0]},${sorted[1][1]}`
}

export class ParkEngine {
  private renderer: THREE.WebGLRenderer
  private labelRenderer: CSS2DRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private clock = new THREE.Clock()
  private rafId = 0
  private disposed = false
  private resizeObs: ResizeObserver

  /* 场景分组 */
  private envGroup = new THREE.Group()
  private buildingGroup = new THREE.Group()
  private parkingGroup = new THREE.Group()
  private layersGroup = new THREE.Group()
  private heatGroup = new THREE.Group()
  private trafficGroup = new THREE.Group()
  private alertGroup = new THREE.Group()
  private treeGroup = new THREE.Group()

  /* 昼夜过渡相关 */
  private modeFactor = 1 // 1=白天 0=夜晚, 平滑插值
  private isDay = true
  /** 每栋楼的立面/顶面材质(用于楼层内部视角的半透明外壳控制) */
  private buildingMats = new Map<string, { sideMat: THREE.MeshStandardMaterial; topMat: THREE.MeshStandardMaterial }>()
  private groundMat!: THREE.MeshStandardMaterial
  private starsMat!: THREE.PointsMaterial
  private sunLight!: THREE.DirectionalLight
  private ambientLight!: THREE.AmbientLight
  private hemiLight!: THREE.HemisphereLight

  /* 图层可见性 */
  private layerVisibility: Record<LayerKey, boolean> = {
    heatmap: true,
    traffic: true,
    alert: true,
    greenery: true
  }

  /* 楼层内部(3D 漫游) */
  private interiorGroups = new Map<string, THREE.Group>()
  private interiorFloorGroups = new Map<string, Map<number, THREE.Group>>()
  private roomMeshes = new Map<string, THREE.Mesh[]>()
  private roomTints = new Map<string, THREE.Mesh>()
  private interiorBuildingId: string | null = null
  private interiorFloor: number | null = null
  private highlightedRoomId: string | null = null

  /* 动画对象 */
  private traffic: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; t: number; speed: number }[] = []
  private heatMeshes: { mesh: THREE.Mesh; phase: number }[] = []
  private alertAnims: { beam: THREE.Mesh; ring: THREE.Mesh; phase: number }[] = []
  private parkingMeshes = new Map<string, THREE.Mesh>()
  private flight: FlightState | null = null
  private pointerDownPos = { x: 0, y: 0 }

  private tmpColor = new THREE.Color()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  constructor(
    private container: HTMLElement,
    private cb: EngineCallbacks = {}
  ) {
    /* 渲染器 */
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)

    /* CSS 标签渲染器(楼宇名称等) */
    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight)
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.top = '0'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(this.labelRenderer.domElement)

    /* 相机与控制器 */
    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000)
    this.camera.position.set(150, 130, 150)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 6, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 18
    this.controls.maxDistance = 480
    this.controls.maxPolarAngle = Math.PI * 0.48

    this.scene.fog = new THREE.Fog(NIGHT_BG.clone(), 260, 720)

    this.buildWorld()
    this.bindEvents()

    /* 自适应尺寸 */
    this.resizeObs = new ResizeObserver(() => this.handleResize())
    this.resizeObs.observe(container)

    this.animate()
  }

  /* ============================== 场景构建 ============================== */

  private buildWorld() {
    this.scene.add(this.envGroup, this.buildingGroup, this.parkingGroup, this.layersGroup)
    this.layersGroup.add(this.heatGroup, this.trafficGroup, this.alertGroup, this.treeGroup)

    this.buildLights()
    this.buildGround()
    this.buildRoads()
    this.buildBuildings()
    this.buildTrees()
    this.buildPlaza()
    this.buildParking()
    this.buildHeatmap()
    this.buildTraffic()
    this.buildAlerts()
    this.buildStars()
  }

  /** 灯光: 环境光 + 半球光 + 平行光(带阴影), 强度/颜色由昼夜过渡插值 */
  private buildLights() {
    this.ambientLight = new THREE.AmbientLight('#8fb8e8', 0.75)
    this.hemiLight = new THREE.HemisphereLight('#bfd9ff', '#101820', 0.55)
    this.sunLight = new THREE.DirectionalLight('#fff3da', 1.2)
    this.sunLight.position.set(120, 160, 80)
    this.sunLight.castShadow = true
    this.sunLight.shadow.mapSize.set(1024, 1024)
    this.sunLight.shadow.camera.left = -140
    this.sunLight.shadow.camera.right = 140
    this.sunLight.shadow.camera.top = 140
    this.sunLight.shadow.camera.bottom = -140
    this.sunLight.shadow.camera.far = 400
    this.scene.add(this.ambientLight, this.hemiLight, this.sunLight)
  }

  /** 地面 + 网格 */
  private buildGround() {
    this.groundMat = new THREE.MeshStandardMaterial({ color: DAY_GROUND.clone(), roughness: 0.95, metalness: 0.05 })
    const ground = new THREE.Mesh(new THREE.CircleGeometry(340, 48), this.groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.receiveShadow = true
    this.envGroup.add(ground)

    const grid = new THREE.GridHelper(680, 68, new THREE.Color('#22d3ee').multiplyScalar(0.25), new THREE.Color('#22d3ee').multiplyScalar(0.1))
    grid.position.y = 0.02
    this.envGroup.add(grid)
  }

  /** 道路(暗色路面 + 中心虚线) */
  private buildRoads() {
    const ROAD_W = 8
    for (const road of roads) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const [ax, az] = road.points[i]
        const [bx, bz] = road.points[i + 1]
        const dx = bx - ax
        const dz = bz - az
        const len = Math.hypot(dx, dz)
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x101d33, roughness: 0.9 })
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, ROAD_W), roadMat)
        mesh.position.set((ax + bx) / 2, 0.03, (az + bz) / 2)
        mesh.rotation.y = Math.atan2(dx, dz)
        this.envGroup.add(mesh)

        // 中心线
        const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0x2c4a75 }))
        line.position.set((ax + bx) / 2, 0.055, (az + bz) / 2)
        line.rotation.y = Math.atan2(dx, dz)
        this.envGroup.add(line)
      }
    }
  }

  /** 楼宇(窗格纹理 + 发光线框 + 名称标签) */
  private buildBuildings() {
    for (const b of buildings) {
      const [w, h, d] = b.size
      const [x, , z] = b.position

      const windowTex = createWindowTexture(b.seed)
      const sideMat = new THREE.MeshStandardMaterial({
        map: windowTex,
        emissiveMap: windowTex,
        emissive: new THREE.Color('#ffd27a'),
        emissiveIntensity: 0.28,
        roughness: 0.75,
        metalness: 0.1
      })
      const topMat = new THREE.MeshStandardMaterial({ color: 0x1c2c47, roughness: 0.85 })
      this.buildingMats.set(b.id, { sideMat, topMat })

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        [sideMat, sideMat, topMat, topMat, sideMat, sideMat]
      )
      mesh.position.set(x, h / 2, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.buildingId = b.id
      mesh.userData.isShell = true
      this.buildingGroup.add(mesh)

      // 楼体边缘发光线(科技感)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35 })
      )
      edges.position.copy(mesh.position)
      this.buildingGroup.add(edges)

      // 名称标签
      const label = document.createElement('div')
      label.className = 'bld-label'
      label.innerHTML = `${b.name}<span class="f">${b.floors}F · ${b.function}</span>`
      const obj = new CSS2DObject(label)
      obj.position.set(x, h + 2, z)
      this.buildingGroup.add(obj)
    }
  }

  /** 绿化: 树丛(树干 + 锥形树冠) */
  private buildTrees() {
    const clusters: [number, number, number][] = [
      [-95, -85, 10], [95, -85, 10], [-95, 85, 10], [95, 85, 10],
      [0, -95, 8], [0, 95, 8], [-70, -12, 8], [70, -12, 8], [-70, 12, 8], [70, 12, 8],
      [-25, -60, 6], [25, -60, 6], [-25, 60, 6], [25, 60, 6], [0, 22, 5]
    ]
    const treeColors = ['#1f7a4d', '#2f8f5a', '#1b6b42']
    for (const [cx, cz, radius] of clusters) {
      const n = 3 + Math.floor(Math.random() * 5)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * radius
        const x = cx + Math.cos(a) * r
        const z = cz + Math.sin(a) * r
        const scale = 0.75 + Math.random() * 0.7

        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.45, 1.8, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 })
        )
        trunk.position.set(x, 0.9, z)
        trunk.scale.setScalar(scale)
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(1.9, 3.8, 7),
          new THREE.MeshStandardMaterial({
            color: treeColors[Math.floor(Math.random() * treeColors.length)],
            roughness: 1
          })
        )
        crown.position.set(x, 3.1 * scale + 0.1, z)
        crown.scale.setScalar(scale)
        crown.castShadow = true
        this.treeGroup.add(trunk, crown)
      }
    }
  }

  /** 中央广场 + 喷泉 */
  private buildPlaza() {
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 0.14, 32),
      new THREE.MeshStandardMaterial({ color: 0x16263e, roughness: 0.8 })
    )
    plaza.position.set(0, 0.07, 0)
    this.envGroup.add(plaza)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(11, 14, 48),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.18, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.16
    this.envGroup.add(ring)

    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 1, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.4, metalness: 0.3 })
    )
    fountain.position.set(0, 0.6, 0)
    this.envGroup.add(fountain)
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(3.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 })
    )
    water.rotation.x = -Math.PI / 2
    water.position.set(0, 1.12, 0)
    this.envGroup.add(water)
  }

  /** 停车场(车位色块 + 分区边框 + 分区标签) */
  private buildParking() {
    const cfg = parkingConfig
    for (const zone of cfg.zones) {
      const zoneW = cfg.cols * (cfg.spotW + cfg.gapX)
      const zoneH = cfg.rows * (cfg.spotH + cfg.gapZ)
      // 底衬
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(zoneW + 1.6, zoneH + 1.6),
        new THREE.MeshStandardMaterial({ color: 0x0d1f38, roughness: 0.9 })
      )
      base.rotation.x = -Math.PI / 2
      base.position.set(zone.x0 + zoneW / 2 - cfg.gapX / 2, 0.03, zone.z0 + zoneH / 2 - cfg.gapZ / 2)
      this.parkingGroup.add(base)

      // 边框
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(zoneW + 1.6, zoneH + 1.6),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
      )
      frame.rotation.x = -Math.PI / 2
      frame.position.set(zone.x0 + zoneW / 2 - cfg.gapX / 2, 0.05, zone.z0 + zoneH / 2 - cfg.gapZ / 2)
      this.parkingGroup.add(frame)

      // 分区标签
      const label = document.createElement('div')
      label.className = 'zone-label'
      label.textContent = `${zone.id} 区`
      const obj = new CSS2DObject(label)
      obj.position.set(zone.x0 + zoneW / 2 - cfg.gapX / 2, 0.6, zone.z0 - 2)
      this.parkingGroup.add(obj)
    }

    // 入口标签
    const entrance = document.createElement('div')
    entrance.className = 'zone-label'
    entrance.textContent = '▶ 入口'
    const entranceObj = new CSS2DObject(entrance)
    entranceObj.position.set(cfg.entrance.x, 0.6, cfg.entrance.z + 2)
    this.parkingGroup.add(entranceObj)

    // 车位色块(状态由 setParkingSpots 更新)
    for (const zone of cfg.zones) {
      for (let i = 0; i < cfg.cols * cfg.rows; i++) {
        const col = i % cfg.cols
        const row = Math.floor(i / cfg.cols)
        const x = zone.x0 + col * (cfg.spotW + cfg.gapX)
        const z = zone.z0 + row * (cfg.spotH + cfg.gapZ)
        const spot = new THREE.Mesh(
          new THREE.PlaneGeometry(cfg.spotW, cfg.spotH),
          new THREE.MeshBasicMaterial({ color: STATUS_COLOR.free, transparent: true, opacity: 0.85 })
        )
        spot.rotation.x = -Math.PI / 2
        spot.position.set(x, 0.1, z)
        spot.userData.spotId = `${zone.id}-${String(i + 1).padStart(2, '0')}`
        this.parkingGroup.add(spot)
        this.parkingMeshes.set(spot.userData.spotId, spot)
      }
    }
  }

  /** 人流热力图: 每栋楼一个叠加色斑 */
  private buildHeatmap() {
    for (const b of buildings) {
      const [w, , d] = b.size
      const color = heatColorByIntensity(b.occupancyRate)
      const mat = new THREE.MeshBasicMaterial({
        map: createHeatTexture(color),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, d * 1.25), mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(b.position[0], 0.55, b.position[2])
      this.heatGroup.add(mesh)
      this.heatMeshes.push({ mesh, phase: Math.random() * Math.PI * 2 })
    }
  }

  /** 车流动画: 粒子沿道路曲线匀速移动 */
  private buildTraffic() {
    for (const road of roads) {
      const pts = road.points.map(([x, z]) => new THREE.Vector3(x, 0.16, z))
      const curve = new THREE.CatmullRomCurve3(pts)
      const n = road.name.includes('横') || road.name.includes('纵') ? 5 : 3
      for (let i = 0; i < n; i++) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 })
        )
        this.trafficGroup.add(mesh)
        this.traffic.push({
          mesh,
          curve,
          t: Math.random(),
          speed: 0.03 + Math.random() * 0.04
        })
      }
    }
  }

  /** 告警点位: 地面光柱 + 脉冲核心 + 旋转光环 */
  private buildAlerts() {
    const levelColor: Record<string, string> = {
      critical: '#ef4444',
      warning: '#f59e0b',
      info: '#38bdf8'
    }
    for (const alert of initialAlerts) {
      if (!alert.position) continue
      const [x, , z] = alert.position
      const color = levelColor[alert.level]
      const group = new THREE.Group()
      group.position.set(x, 0, z)

      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true), beamMat)
      beam.position.y = 13
      group.add(beam)

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      )
      core.position.y = 0.9
      core.userData.alertId = alert.id
      beam.userData.alertId = alert.id
      group.add(core)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.7, 2.3, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 1.3
      ring.userData.alertId = alert.id
      group.add(ring)

      this.alertGroup.add(group)
      this.alertAnims.push({ beam, ring, phase: Math.random() * Math.PI * 2 })
    }
  }

  /** 夜空星星(夜晚可见) */
  private buildStars() {
    const n = 900
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 0.99) // 只在上半球
      const r = 900
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) + 40
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
    const stars = new THREE.Points(geo, this.starsMat)
    this.scene.add(stars)
  }

  /* ========================== 楼层内部 3D 视角 ========================== */

  /** 房间类型 -> 内部地板/隔断配色 */
  private static ROOM_COLOR: Record<string, number> = {
    office: 0x155e75,
    meeting: 0x5b21b6,
    restroom: 0x3f3f46,
    device: 0x713f12,
    hall: 0x101a2e
  }

  /**
   * 按需构建某栋楼全部楼层的内部结构(楼板/房间色块/半高隔断/家具/灯带)
   * 内部结构放在以楼体西南角为原点的局部坐标系(局部 0..w x 0..d 与外壳完全对齐)
   */
  private buildBuildingInterior(b: Building): { group: THREE.Group; floorGroups: Map<number, THREE.Group> } {
    const [w, , d] = b.size
    /* 内部结构以楼体西南角(b.position - size/2)为局部原点, 与外壳(b.position ± size/2)对齐 */
    const group = new THREE.Group()
    group.position.set(b.position[0] - w / 2, 0, b.position[2] - d / 2)
    const floorGroups = new Map<number, THREE.Group>()
    const cellW = w / 6 // 房间网格 6 列
    const cellD = d / 5 // 5 行

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x39496b, roughness: 0.85 })

    for (let floor = 1; floor <= b.floors; floor++) {
      const fg = new THREE.Group()
      /* 楼层内部元素分两组: 结构(楼板/吊顶/立柱/核心筒)全层可见作隔断, 内容(色块/灯带/家具/隔断墙)仅当前层 */
      const content = new THREE.Group()
      fg.add(content)
      fg.userData.contentGroup = content
      const slabY = (floor - 1) * b.floorHeight

      /* 楼板 */
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.22, d),
        new THREE.MeshStandardMaterial({ color: 0x141d30, roughness: 0.9 })
      )
      slab.position.set(w / 2, slabY + 0.11, d / 2)
      slab.receiveShadow = true
      fg.userData.slab = slab
      fg.add(slab)

      const rooms = getFloorPlan(b, floor)

      /* 统计内部隔断边: 网格内被两个房间共享的边需要立墙 */
      const edgeCount = new Map<string, number>()
      const edgeRooms = new Map<string, Set<string>>()
      const roomEdges: { key: string; pts: [[number, number], [number, number]] }[] = []
      for (const room of rooms) {
        const edges: [[number, number], [number, number]][] = [
          [[room.x, room.y], [room.x + room.w, room.y]],
          [[room.x + room.w, room.y], [room.x + room.w, room.y + room.h]],
          [[room.x + room.w, room.y + room.h], [room.x, room.y + room.h]],
          [[room.x, room.y + room.h], [room.x, room.y]]
        ]
        for (const pts of edges) {
          const key = segKey(pts[0], pts[1])
          edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
          let set = edgeRooms.get(key)
          if (!set) {
            set = new Set()
            edgeRooms.set(key, set)
          }
          set.add(room.id)
          roomEdges.push({ key, pts })
        }
      }

      /* 房间色块 + 天花板灯带 + 家具 */
      const rnd = mulberry32(b.seed * 10000 + floor * 131)
      const slabTop = slabY + 0.22 // 楼板顶面, 所有内部元素以此为基准, 避免穿模
      rooms.forEach((room) => {
        const rx = room.x * cellW
        const rz = room.y * cellD
        const rw = room.w * cellW
        const rd = room.h * cellD

        /* 房间地面色块(贴楼板顶面之上, 避免与楼板深度冲突; 俯视户型图的主要视觉元素) */
        const tint = new THREE.Mesh(
          new THREE.PlaneGeometry(rw, rd),
          new THREE.MeshBasicMaterial({
            color: ParkEngine.ROOM_COLOR[room.type],
            transparent: true,
            opacity: room.type === 'hall' ? 0.3 : 0.5,
            depthWrite: false
          })
        )
        tint.rotation.x = -Math.PI / 2
        tint.position.set(rx + rw / 2, slabTop + 0.02, rz + rd / 2)
        tint.userData.roomId = room.id
        content.add(tint)
        this.roomTints.set(room.id, tint)

        /* 天花板 LED 灯带(悬吊于天花板之下) */
        const stripLen = room.type === 'hall' ? rw * 0.55 : Math.max(1.2, rw - 0.8)
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(stripLen, 0.06, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x67e8f9, emissiveIntensity: 1.6 })
        )
        strip.position.set(rx + rw / 2, slabY + b.floorHeight - 0.34, rz + rd / 2)
        content.add(strip)

        /* 家具(底部均落在楼板顶面, 尺寸内缩于房间内, 不穿墙) */
        if (room.type === 'office') {
          const n = Math.min(6, Math.max(1, Math.round(room.w * room.h - 2)))
          const cols = Math.min(2, n)
          const rows = Math.ceil(n / cols)
          const margin = 0.85 // 桌宽 1.5, 半宽 0.75, 边距留 0.1 余量, 抖动受限不穿墙
          const dW = 1.5
          const dD = 0.85
          const spanX = rw - 2 * margin - dW
          const spanZ = rd - 2 * margin - dD
          for (let k = 0; k < n; k++) {
            const col = k % cols
            const row = Math.floor(k / cols)
            const cx = rx + margin + (cols === 1 ? spanX / 2 : (col * spanX) / (cols - 1)) + (rnd() - 0.5) * 0.12
            const cz = rz + margin + (rows === 1 ? spanZ / 2 : (row * spanZ) / (rows - 1)) + (rnd() - 0.5) * 0.12
            /* 桌体 + 浅色台板 */
            const desk = new THREE.Mesh(
              new THREE.BoxGeometry(dW, 0.5, dD),
              new THREE.MeshStandardMaterial({ color: 0x31405c, roughness: 0.7 })
            )
            desk.position.set(cx, slabTop + 0.25, cz)
            desk.userData.roomId = room.id
            content.add(desk)
            const deskTop = new THREE.Mesh(
              new THREE.BoxGeometry(dW, 0.05, dD),
              new THREE.MeshStandardMaterial({ color: 0x3d5378, roughness: 0.5 })
            )
            deskTop.position.set(cx, slabTop + 0.505, cz)
            content.add(deskTop)
          }
          /* 文件柜(靠墙) */
          const side = Math.floor(rnd() * 2)
          const cabinet = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 1.5, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x2a3a58, roughness: 0.6 })
          )
          cabinet.position.set(rx + (side === 0 ? 0.78 : rw - 0.78), slabTop + 0.75, rz + rd * (0.35 + rnd() * 0.3))
          cabinet.userData.roomId = room.id
          content.add(cabinet)
          /* 角落绿植 */
          const plant = this.createPlant(slabTop, 0.95)
          plant.position.set(rx + 0.55 + rnd() * 0.3, 0, rz + 0.55 + rnd() * 0.3)
          plant.userData.roomId = room.id
          content.add(plant)
        } else if (room.type === 'meeting') {
          const tableW = Math.min(3, rw - 0.8)
          const table = new THREE.Mesh(
            new THREE.BoxGeometry(tableW, 0.45, 1.3),
            new THREE.MeshStandardMaterial({ color: 0x31405c, roughness: 0.6 })
          )
          table.position.set(rx + rw / 2, slabTop + 0.225, rz + rd / 2)
          table.userData.roomId = room.id
          content.add(table)
          const tableTop = new THREE.Mesh(
            new THREE.BoxGeometry(tableW, 0.05, 1.3),
            new THREE.MeshStandardMaterial({ color: 0x3d5378, roughness: 0.5 })
          )
          tableTop.position.set(rx + rw / 2, slabTop + 0.475, rz + rd / 2)
          content.add(tableTop)
          const chair = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x1f2a44, roughness: 0.8 })
          )
          for (const [cx, cz] of [[0, 1.4], [0, -1.4], [1.65, 0.7], [1.65, -0.7], [-1.65, 0.7], [-1.65, -0.7]]) {
            const c = chair.clone()
            c.position.set(rx + rw / 2 + cx, slabTop + 0.25, rz + rd / 2 + cz)
            c.userData.roomId = room.id
            content.add(c)
          }
          /* 会议投屏(贴墙) */
          const screen = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.3, 0.06),
            new THREE.MeshStandardMaterial({
              color: 0x0f172a,
              emissive: 0x38bdf8,
              emissiveIntensity: 0.9,
              roughness: 0.4
            })
          )
          screen.position.set(rx + rw / 2, slabTop + 0.85, rz + 0.3)
          screen.userData.roomId = room.id
          content.add(screen)
        } else if (room.type === 'restroom') {
          /* 隔间 + 洗手台 */
          const stallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
          for (const [sx, sz] of [[0.6, 1.2], [1.7, 1.2]]) {
            const stall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.8), stallMat)
            stall.position.set(rx + sx, slabTop + 0.5, rz + sz)
            content.add(stall)
          }
          const sink = new THREE.Mesh(
            new THREE.BoxGeometry(2.2, 0.4, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 })
          )
          sink.position.set(rx + rw / 2, slabTop + 0.2, rz + rd - 0.5)
          content.add(sink)
        } else if (room.type === 'device') {
          /* 服务器机柜(带指示灯带) + 空调机组 */
          const rackMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
          for (const [rx2, rz2] of [[0.7, 0.8], [0.7, 2.1]]) {
            const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 1.1), rackMat)
            rack.position.set(rx + rx2, slabTop + 0.9, rz + rz2)
            rack.userData.roomId = room.id
            content.add(rack)
            const led = new THREE.Mesh(
              new THREE.BoxGeometry(0.7, 0.06, 0.03),
              new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.4 })
            )
            led.position.set(rx + rx2, slabTop + 1.5, rz + rz2 + 0.57)
            content.add(led)
          }
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.1, 0.7),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 })
          )
          ac.position.set(rx + rw - 0.8, slabTop + 0.55, rz + 0.9)
          content.add(ac)
        } else if (room.type === 'hall') {
          /* 走廊尽头绿植 */
          const plant = this.createPlant(slabTop, 0.8)
          plant.position.set(rx + rw * 0.8, 0, rz + rd - 0.8)
          content.add(plant)
        }
      })

      /* 结构立柱(房间网格交叉点) */
      const columnMat = new THREE.MeshStandardMaterial({ color: 0x2a3a58, roughness: 0.6 })
      for (let ci = 1; ci <= 5; ci++) {
        for (let cj = 1; cj <= 4; cj++) {
          const column = new THREE.Mesh(new THREE.BoxGeometry(0.26, b.floorHeight, 0.26), columnMat)
          column.position.set(ci * cellW, slabY + b.floorHeight / 2, cj * cellD)
          fg.add(column)
        }
      }

      /* 电梯/楼梯核心(走廊尽头) + 电梯门 */
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, b.floorHeight, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x22314d, roughness: 0.7 })
      )
      core.position.set(2.5 * cellW, slabY + b.floorHeight / 2, 4.5 * cellD)
      fg.add(core)
      const coreDoor = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.9, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 0.8 })
      )
      coreDoor.position.set(2.5 * cellW, slabTop + 0.95, 4.5 * cellD - 1.25)
      fg.add(coreDoor)

      /* 天花板(封闭楼层, 灯带悬挂其下), 顶面与上一层楼板底面齐平 */
      const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.12, d),
        new THREE.MeshStandardMaterial({ color: 0x0d1526, roughness: 0.95 })
      )
      ceiling.position.set(w / 2, slabY + b.floorHeight - 0.06, d / 2)
      fg.userData.ceiling = ceiling
      fg.add(ceiling)

      /* 隔断墙: 房间共享边为半高隔断; 楼体外圈边界(四面)为全高外墙, 内缩半墙厚避免伸出外壳 */
      const builtEdges = new Set<string>()
      for (const { key, pts } of roomEdges) {
        const count = edgeCount.get(key) ?? 0
        if (count !== 2 && count !== 1) continue
        if (builtEdges.has(key)) continue
        builtEdges.add(key)
        const [p1, p2] = pts
        /* 网格坐标(整数)判断边界: 列 0/6、行 0/5 为楼体外圈 */
        const horizontal = p1[1] === p2[1]
        const isPerimeter = count === 1 && (horizontal ? p1[1] === 0 || p1[1] === 5 : p1[0] === 0 || p1[0] === 6)
        if (count === 1 && !isPerimeter) continue // 走廊等内部单边不加墙, 保持开放
        const x1 = p1[0] * cellW
        const z1 = p1[1] * cellD
        const x2 = p2[0] * cellW
        const z2 = p2[1] * cellD
        const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1)
        const wallH = isPerimeter ? b.floorHeight : 1.25
        let wx = (x1 + x2) / 2
        let wz = (z1 + z2) / 2
        if (isPerimeter) {
          /* 外圈墙向内缩 0.08(半墙厚), 不外露于楼体外壳 */
          if (horizontal) wz += p1[1] === 0 ? 0.08 : -0.08
          else wx += p1[0] === 0 ? 0.08 : -0.08
        }
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, 0.16), wallMat)
        wall.position.set(wx, slabY + wallH / 2, wz)
        if (!horizontal) wall.rotation.y = Math.PI / 2
        const roomIds = edgeRooms.get(key)
        if (roomIds) {
          for (const rid of roomIds) {
            wall.userData.roomId = rid
            let list = this.roomMeshes.get(rid)
            if (!list) {
              list = []
              this.roomMeshes.set(rid, list)
            }
            list.push(wall)
          }
        }
        /* 外墙属于楼层结构(各层常显, 构成楼体外轮廓), 隔断属于当前层内容 */
        ;(isPerimeter ? fg : content).add(wall)
      }

      floorGroups.set(floor, fg)
      group.add(fg)
    }
    return { group, floorGroups }
  }

  /** 室内盆栽(绿植), baseY 为盆栽所在楼板顶面 */
  private createPlant(baseY: number, scale: number): THREE.Group {
    const plant = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4f2a, roughness: 1 })
    )
    trunk.position.y = baseY + 0.25
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.32 * scale, 0.6 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f8f5a, roughness: 1 })
    )
    crown.position.y = baseY + 0.5 + 0.3 * scale
    plant.add(trunk, crown)
    return plant
  }

  /** 进入楼层内部: 隐藏外壳 + 只显示该楼层 + 相机飞入(俯视切剖见 updateInteriorCutaway) */
  enterFloor(buildingId: string, floor: number) {
    const b = buildings.find((x) => x.id === buildingId)
    if (!b) return
    if (this.interiorBuildingId && this.interiorBuildingId !== buildingId) this.exitInterior()

    if (!this.interiorGroups.has(buildingId)) {
      const { group, floorGroups } = this.buildBuildingInterior(b)
      this.scene.add(group)
      this.interiorGroups.set(buildingId, group)
      this.interiorFloorGroups.set(buildingId, floorGroups)
    }
    const group = this.interiorGroups.get(buildingId)!
    group.visible = true
    const floorGroups = this.interiorFloorGroups.get(buildingId)!
    /* 每层结构(楼板/吊顶/立柱/核心筒)全部显示作层间隔断, 防止从楼外/层间透模; 房间内容仅显示当前层 */
    floorGroups.forEach((g, f) => {
      g.visible = true
      const content = g.userData.contentGroup as THREE.Group | undefined
      if (content) content.visible = f === floor
    })

    /* 楼体外壳隐藏, 显示内部结构(避免穿模) */
    const shellMesh = this.buildingGroup.children.find((m) => {
      const mesh = m as THREE.Mesh
      return mesh.userData?.buildingId === buildingId && mesh.userData?.isShell
    })
    if (shellMesh) shellMesh.visible = false

    this.interiorBuildingId = buildingId
    this.interiorFloor = floor
    this.highlightRoom(null)

    /* 相机从当前视角方向飞入楼内, 落在楼层走廊中央 — 旋转以楼层中心为轴, 不会转出楼外 */
    const [w, , d] = b.size
    const cellW = w / 6
    const cellD = d / 5
    const slabTop = (floor - 1) * b.floorHeight + 0.22
    const anchor = new THREE.Vector3(
      b.position[0] - w / 2 + 2.5 * cellW, // 走廊中心(6 列网格的第 3 列, 相对楼体中心)
      slabTop + 1.25,
      b.position[2] - d / 2 + 2.5 * cellD
    )
    const dir = anchor.clone().sub(this.camera.position)
    dir.y = 0
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
    dir.normalize()
    const pos = anchor.clone().add(dir.multiplyScalar(-3.2))
    this.startFlight(pos, anchor.clone(), 1.6)
    /* 楼层内漫游相机约束: 轨道半径限定在楼内, 相机不低于楼板 */
    this.controls.minDistance = 1.2
    this.controls.maxDistance = Math.min(w, d) * 0.35
    this.controls.maxPolarAngle = Math.PI * 0.46
  }

  /** 退出楼层内部, 恢复外壳与相机约束 */
  exitInterior(): boolean {
    if (!this.interiorBuildingId) return false
    /* 恢复外壳可见性 */
    const shellMesh = this.buildingGroup.children.find((m) => {
      const mesh = m as THREE.Mesh
      return mesh.userData?.buildingId === this.interiorBuildingId && mesh.userData?.isShell
    })
    if (shellMesh) shellMesh.visible = true
    const group = this.interiorGroups.get(this.interiorBuildingId)
    if (group) group.visible = false
    /* 恢复切剖中被隐藏的楼板/天花板 */
    const floorGroups = this.interiorFloorGroups.get(this.interiorBuildingId)
    if (floorGroups) {
      floorGroups.forEach((g) => {
        const slab = g.userData.slab as THREE.Mesh | undefined
        const ceiling = g.userData.ceiling as THREE.Mesh | undefined
        if (slab) slab.visible = true
        if (ceiling) ceiling.visible = true
      })
    }
    this.controls.minDistance = 18
    this.controls.maxDistance = 480
    this.controls.maxPolarAngle = Math.PI
    this.interiorBuildingId = null
    this.interiorFloor = null
    this.highlightedRoomId = null
    return true
  }

  /**
   * 俯视切剖: 相机高于当前层天花板时隐藏天花板, 高于更高楼层楼板时隐藏该楼板。
   * 向上旋转相机可俯视当前层户型图(房间色块/家具/隔断), 而不是被黑色楼板/吊顶挡住;
   * 相机回落时逐层恢复, 楼宇从楼外看仍保持完整的层间结构。
   */
  private updateInteriorCutaway() {
    if (this.interiorBuildingId == null || this.interiorFloor == null) return
    const b = buildings.find((x) => x.id === this.interiorBuildingId)
    if (!b) return
    const floorGroups = this.interiorFloorGroups.get(this.interiorBuildingId)
    if (!floorGroups) return
    const floor = this.interiorFloor
    const camY = this.camera.position.y
    floorGroups.forEach((fg, f) => {
      const slab = fg.userData.slab as THREE.Mesh | undefined
      const ceiling = fg.userData.ceiling as THREE.Mesh | undefined
      /* 当前层及以下楼板常显(当前层地面 + 楼体基座); 更高楼层的楼板在相机高于其底面时隐藏(避免相机穿过楼板带) */
      if (slab) slab.visible = f <= floor || camY <= (f - 1) * b.floorHeight
      /* 天花板在相机高于其底面时隐藏 */
      if (ceiling) ceiling.visible = camY <= f * b.floorHeight - 0.18
    })
  }

  /** 高亮房间(隔断发光 + 地面色块提亮), 传 null 清除 */
  highlightRoom(roomId: string | null) {
    if (this.highlightedRoomId && this.highlightedRoomId !== roomId) {
      const oldWalls = this.roomMeshes.get(this.highlightedRoomId) ?? []
      for (const m of oldWalls) (m.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      const oldTint = this.roomTints.get(this.highlightedRoomId)
      if (oldTint) (oldTint.material as THREE.MeshBasicMaterial).opacity = oldTint.userData.baseOpacity ?? 0.5
    }
    this.highlightedRoomId = roomId
    if (!roomId) return
    const walls = this.roomMeshes.get(roomId) ?? []
    for (const m of walls) (m.material as THREE.MeshStandardMaterial).emissive.setHex(0x22d3ee)
    const tint = this.roomTints.get(roomId)
    if (tint) {
      if (tint.userData.baseOpacity == null) tint.userData.baseOpacity = (tint.material as THREE.MeshBasicMaterial).opacity
      ;(tint.material as THREE.MeshBasicMaterial).opacity = 0.75
    }
  }

  /* ============================== 交互 ============================== */

  private bindEvents() {
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  /** 点击拾取: 楼宇 > 告警 > 停车场(拖动超过阈值不算点击) */
  private onPointerUp = (e: PointerEvent) => {
    const dx = e.clientX - this.pointerDownPos.x
    const dy = e.clientY - this.pointerDownPos.y
    if (dx * dx + dy * dy > 36) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)

    /* 楼层内部视角: 优先拾取房间隔断/家具 */
    if (this.interiorBuildingId) {
      const interior = this.interiorGroups.get(this.interiorBuildingId)
      if (interior) {
        const interiorHits = this.raycaster.intersectObjects(interior.children, true)
        const rhit = interiorHits.find((h) => h.object.userData.roomId)
        if (rhit) {
          this.cb.onObjectClick?.({ type: 'room', id: rhit.object.userData.roomId })
          return
        }
      }
    }

    const buildingHits = this.raycaster.intersectObjects(this.buildingGroup.children, false)
    const hit = buildingHits.find((h) => h.object.userData.buildingId)
    if (hit) {
      this.cb.onObjectClick?.({ type: 'building', id: hit.object.userData.buildingId })
      return
    }

    const alertHits = this.raycaster.intersectObjects(this.alertGroup.children, true)
    const ahit = alertHits.find((h) => h.object.userData.alertId)
    if (ahit) {
      this.cb.onObjectClick?.({ type: 'alert', id: ahit.object.userData.alertId })
      return
    }

    const parkingHits = this.raycaster.intersectObjects(this.parkingGroup.children, true)
    const phit = parkingHits.find((h) => h.object.userData.spotId)
    if (phit) {
      this.cb.onObjectClick?.({ type: 'parking', id: phit.object.userData.spotId })
    }
  }

  /* ============================== 对外接口 ============================== */

  /** 昼夜切换(内部平滑过渡) */
  setDayMode(isDay: boolean) {
    this.isDay = isDay
  }

  /** 图层开关 */
  setLayer(key: LayerKey, visible: boolean) {
    this.layerVisibility[key] = visible
    if (key === 'heatmap') this.heatGroup.visible = visible
    else if (key === 'traffic') this.trafficGroup.visible = visible
    else if (key === 'alert') this.alertGroup.visible = visible
    else if (key === 'greenery') this.treeGroup.visible = visible
  }

  /** 更新车位状态颜色 */
  setParkingSpots(spots: ParkingSpot[]) {
    for (const s of spots) {
      const mesh = this.parkingMeshes.get(s.id)
      if (mesh) {
        ;(mesh.material as THREE.MeshBasicMaterial).color.setHex(STATUS_COLOR[s.status] ?? STATUS_COLOR.free)
      }
    }
  }

  /** 相机飞行聚焦某栋楼 */
  flyToBuilding(buildingId: string) {
    const b = buildings.find((x) => x.id === buildingId)
    if (!b) return
    const [x, , z] = b.position
    const [w, h, d] = b.size
    const center = new THREE.Vector3(x, h * 0.35, z)
    const dir = this.camera.position.clone().sub(center)
    dir.y = 0
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
    dir.normalize()
    const dist = Math.max(w, d) * 1.7 + 24
    const target = center.clone().add(dir.multiplyScalar(dist))
    target.y = h * 0.55 + 18
    this.startFlight(target, center)
  }

  /** 相机回到园区总览视角 */
  resetView() {
    this.startFlight(new THREE.Vector3(150, 130, 150), new THREE.Vector3(0, 6, 0), 1.4)
  }

  private startFlight(to: THREE.Vector3, toTarget: THREE.Vector3, dur = 1.8) {
    this.flight = {
      from: this.camera.position.clone(),
      to: to.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
      t: 0,
      dur
    }
    this.controls.enabled = false
  }

  /* ============================== 主循环 ============================== */

  private animate = () => {
    if (this.disposed) return
    this.rafId = requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.getElapsedTime()

    this.updateDayNight(dt)
    this.updateTraffic(dt)
    this.updateHeat(t)
    this.updateAlerts(t)
    this.updateFlight(dt)
    this.updateInteriorCutaway()
    this.controls.update()

    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }

  /** 昼夜平滑过渡 */
  private updateDayNight(dt: number) {
    const target = this.isDay ? 1 : 0
    const k = 1 - Math.exp(-dt * 2.2)
    this.modeFactor += (target - this.modeFactor) * k
    const f = this.modeFactor

    // 天空与雾
    this.tmpColor.copy(NIGHT_BG).lerp(DAY_BG, f)
    this.scene.background = this.tmpColor.clone()
    if (this.scene.fog) this.scene.fog.color.copy(this.tmpColor)

    // 地面
    this.groundMat.color.copy(NIGHT_GROUND).lerp(DAY_GROUND, f)

    // 灯光
    this.ambientLight.intensity = 0.3 + f * 0.45
    this.hemiLight.intensity = 0.25 + f * 0.3
    this.sunLight.intensity = 0.35 + f * 0.85
    this.tmpColor.copy(NIGHT_MOON).lerp(DAY_SUN, f)
    this.sunLight.color.copy(this.tmpColor)

    // 楼宇窗格自发光: 夜晚更亮(楼层内部视角时减弱, 避免半透明外壳过于刺眼)
    const emissive = 0.26 + (1 - f) * 1.5
    const interiorId = this.interiorBuildingId
    for (const [id, mats] of this.buildingMats) {
      mats.sideMat.emissiveIntensity = emissive * (id === interiorId ? 0.1 : 1)
    }

    // 星星
    this.starsMat.opacity = 1 - f
  }

  /** 车流粒子沿曲线移动 */
  private updateTraffic(dt: number) {
    for (const p of this.traffic) {
      p.t += p.speed * dt
      if (p.t >= 1) p.t -= 1
      p.mesh.position.copy(p.curve.getPoint(p.t))
    }
  }

  /** 热力色斑脉冲 */
  private updateHeat(t: number) {
    for (const { mesh, phase } of this.heatMeshes) {
      ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.14 * Math.sin(t * 2 + phase)
    }
  }

  /** 告警光柱脉冲 + 光环旋转 */
  private updateAlerts(t: number) {
    for (const { beam, ring, phase } of this.alertAnims) {
      ;(beam.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3 + phase))
      ring.rotation.z += 0.016
    }
  }

  /** 相机飞行动画 */
  private updateFlight(dt: number) {
    const flight = this.flight
    if (!flight) return
    flight.t += dt / flight.dur
    const e = easeInOutCubic(Math.min(1, flight.t))
    this.camera.position.lerpVectors(flight.from, flight.to, e)
    this.controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e)
    if (flight.t >= 1) {
      this.flight = null
      this.controls.enabled = true
    }
  }

  private handleResize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.labelRenderer.setSize(w, h)
  }

  /** 释放资源 */
  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    this.resizeObs.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
    if (this.labelRenderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.labelRenderer.domElement)
    }
  }
}
