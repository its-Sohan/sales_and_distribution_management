import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

/**
 * Plays one short refresh cue when the report period changes.
 *
 * React renders the exact new figures first; this only animates opacity and
 * transform so the metric cards and stat panels settle in instead of popping.
 * Skipped entirely when the visitor prefers reduced motion, and any in-flight
 * cue is cancelled before the next one starts.
 */
export function useReportMotion(root: RefObject<HTMLElement | null>, periodKey: string) {
  const previous = useRef(periodKey)
  const running = useRef(new Set<Animation>())
  const perElement = useRef(new WeakMap<Element, Animation>())
  const motionPreference = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])

  useLayoutEffect(() => {
    const changed = previous.current !== periodKey
    previous.current = periodKey
    if (!changed || motionPreference.matches || !root.current) return

    const container = root.current
    const targets = [
      ...container.querySelectorAll<HTMLElement>('.report-metrics .metric-card'),
      ...container.querySelectorAll<HTMLElement>('.report-results'),
      ...container.querySelectorAll<HTMLElement>('.report-overview-grid .report-panel'),
    ]
    targets.forEach((element, index) => {
      if (typeof element.animate !== 'function') return
      perElement.current.get(element)?.cancel()
      const animation = element.animate(
        [{ opacity: .35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 160, delay: Math.min(index, 6) * 16, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
      )
      perElement.current.set(element, animation)
      running.current.add(animation)
      const release = () => {
        running.current.delete(animation)
        if (perElement.current.get(element) === animation) perElement.current.delete(element)
      }
      animation.onfinish = release
      animation.oncancel = release
    })

    return () => {
      running.current.forEach(animation => animation.cancel())
      running.current.clear()
    }
  }, [periodKey, root, motionPreference])

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
}
