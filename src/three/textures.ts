/**
 * Canvas 生成的程序化纹理(无需任何外部图片资源)
 */
import * as THREE from 'three'
import { mulberry32 } from '../data/mockData'

/** 楼宇立面窗格纹理(白天/夜晚均可, 夜晚由 emissiveMap 点亮) */
export function createWindowTexture(seed: number, litRatio = 0.35): THREE.CanvasTexture {
  const w = 128
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const rnd = mulberry32(seed)

  // 墙体底色(轻微纵向渐变)
  const wall = g.createLinearGradient(0, 0, 0, h)
  wall.addColorStop(0, '#24365c')
  wall.addColorStop(0.5, '#1b2740')
  wall.addColorStop(1, '#162038')
  g.fillStyle = wall
  g.fillRect(0, 0, w, h)

  // 窗格 4 列 x 18 行
  const cols = 4
  const rows = 18
  const cellW = w / cols
  const cellH = h / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rnd() < litRatio
      g.fillStyle = lit ? '#ffe8b0' : '#0d1626'
      const mx = 5
      const my = 4
      g.fillRect(c * cellW + mx, r * cellH + my, cellW - mx * 2, cellH - my * 2)
      if (lit) {
        // 亮窗微光晕
        g.fillStyle = 'rgba(255, 232, 176, 0.18)'
        g.fillRect(c * cellW + mx, r * cellH + my, cellW - mx * 2, 2)
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 人流热力强度 -> 颜色 */
export function heatColorByIntensity(v: number): string {
  if (v < 0.35) return '#3b82f6'
  if (v < 0.65) return '#22d3ee'
  if (v < 0.85) return '#f59e0b'
  return '#ef4444'
}

/** 径向渐变热力点纹理(中心不透明, 边缘透明, 用于叠加混合) */
export function createHeatTexture(color: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!

  // 逐像素生成径向渐变: 颜色 -> 透明
  const img = g.createImageData(size, size)
  const r = parseInt(color.slice(1, 3), 16)
  const gr = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2
      const dy = y - size / 2
      const d = Math.sqrt(dx * dx + dy * dy) / (size / 2)
      const a = Math.max(0, 1 - d * d) // 平滑衰减
      const idx = (y * size + x) * 4
      img.data[idx] = r
      img.data[idx + 1] = gr
      img.data[idx + 2] = b
      img.data[idx + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
