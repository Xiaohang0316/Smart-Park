/**
 * 模拟实时数据流: 用 setInterval 模拟 IoT 设备推送
 * 后续接入真实后端时, 替换为 WebSocket/SSE 订阅即可
 */
import { useAppStore } from '../store/useAppStore'

let started = false

export function startMockStream(): () => void {
  if (started) return () => {}
  started = true

  const timers = [
    window.setInterval(() => useAppStore.getState().tickParking(), 3000),
    window.setInterval(() => useAppStore.getState().tickPeopleFlow(), 2000),
    window.setInterval(() => useAppStore.getState().maybePushAlert(), 6000)
  ]

  return () => {
    timers.forEach(clearInterval)
    started = false
  }
}
