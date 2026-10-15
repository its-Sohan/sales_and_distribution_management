import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { type Line } from './model'

/** Animate small feedback elements; React always renders the exact amounts immediately. */
export function useLedgerMotion({ lines, total, receipts, ready, toast }: {
  lines: Line[]; total: number; receipts: number; ready: boolean; toast: object | null
}) {
  const root = useRef<HTMLDivElement>(null)
  const previous = useRef({ lines, total, receipts, ready: false })
  const running = useRef(new Set<Animation>())
  const perElement = useRef(new WeakMap<Element, Animation>())
  const motionPreference = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])

  const animate = (element: Element | null | undefined, frames: Keyframe[], duration: number) => {
    if (!element || typeof element.animate !== 'function' || motionPreference.matches) return
    perElement.current.get(element)?.cancel()
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.2,.75,.3,1)' })
    perElement.current.set(element, animation)
    running.current.add(animation)
    const release = () => {
      running.current.delete(animation)
      if (perElement.current.get(element) === animation) perElement.current.delete(element)
    }
    animation.onfinish = release
    animation.oncancel = release
  }

  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { lines, total, receipts, ready }
    if (!ready || !before.ready || !root.current || motionPreference.matches) return

    const previousQuantities = new Map(before.lines.map(line => [line.productId, line.quantity]))
    const changedLines = lines.filter(line => previousQuantities.get(line.productId) !== line.quantity)
    if (changedLines.length) {
      const rows = new Map([...root.current.querySelectorAll<HTMLElement>('.bill-row')]
        .map(row => [row.dataset.productId, row]))
      for (const line of changedLines) {
        const row = rows.get(line.productId)
        if (!row) continue
        animate(row.querySelector('.bill-row-feedback'), [{ opacity: 1 }, { opacity: 0 }], 300)
        animate(row.querySelector('.bill-qty'), [{ opacity: .7 }, { opacity: 1 }], 140)
      }
    }
    if (before.total !== total) {
      animate(root.current.querySelector('.total-row>strong'), [{ opacity: .75 }, { opacity: 1 }], 150)
    }
    if (receipts > before.receipts) {
      animate(root.current.querySelector('.today-summary>strong'), [{ opacity: .7 }, { opacity: 1 }], 150)
    }
  }, [lines, total, receipts, ready, motionPreference])

  useLayoutEffect(() => {
    if (!toast) return
    animate(root.current?.querySelector('.toast'), [{ translate: '0 4px', opacity: 0 }, { translate: '0 0', opacity: 1 }], 150)
  }, [toast])

  useEffect(() => {
    const cancelAnimations = () => {
      running.current.forEach(animation => animation.cancel())
      running.current.clear()
    }
    const onPreferenceChange = () => { if (motionPreference.matches) cancelAnimations() }
    motionPreference.addEventListener('change', onPreferenceChange)
    return () => {
      motionPreference.removeEventListener('change', onPreferenceChange)
      cancelAnimations()
    }
  }, [motionPreference])

  return root
}
