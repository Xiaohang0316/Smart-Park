/**
 * 数字滚动动画: value 变化时从旧值缓动到新值
 */
import { useEffect, useRef, useState } from 'react'

export function useCountUp(value: number, duration = 700): number {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        prevRef.current = to
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return display
}
