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
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.16,1,.3,1)' })
    perElement.current.set(element, animation)
    running.current.add(animation)
    const release = () => {
      running.current.delete(animation)
      if (perElement.current.get(element) === animation) perElement.current.delete(element)
    }
    animation.onfinish = release
    animation.oncancel = release
  }

  /** Restart a one-shot CSS feedback animation (row-flash / value-bump) on an element. */
  const feedback = (element: Element | null | undefined, className: 'is-flashing' | 'is-bumping') => {
    if (!element || motionPreference.matches) return
    element.classList.remove(className)
    void element.getBoundingClientRect() // restart cleanly when the value changes again mid-flight
    element.classList.add(className)
    // animationend bubbles, so wait for this element's own event before clearing the class.
    const settle = (event: Event) => {
      if (event.target !== element) return
      element.classList.remove(className)
      element.removeEventListener('animationend', settle)
    }
    element.addEventListener('animationend', settle)
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
        feedback(row, 'is-flashing')
        feedback(row.querySelector('.bill-qty'), 'is-bumping')
        feedback(row.querySelector('.bill-amount'), 'is-bumping')
      }
    }
    if (before.total !== total) feedback(root.current.querySelector('.total-row>strong'), 'is-bumping')
    if (receipts > before.receipts) feedback(root.current.querySelector('.today-summary>strong'), 'is-bumping')
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
    const onPreferenceChange = () => {
      if (!motionPreference.matches) return
      cancelAnimations()
      document.querySelectorAll('.is-flashing, .is-bumping')
        .forEach(element => element.classList.remove('is-flashing', 'is-bumping'))
    }
    motionPreference.addEventListener('change', onPreferenceChange)
    return () => {
      motionPreference.removeEventListener('change', onPreferenceChange)
      cancelAnimations()
    }
  }, [motionPreference])

  return root
}
