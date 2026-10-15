import { forwardRef, useEffect, useLayoutEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icons'

export type ModalHandle = { exit: () => void; cancelExit: () => void }

export const Modal = forwardRef<ModalHandle, { children: ReactNode; title: string; closeLabel: string; onClose: () => void; onExited: () => void; className?: string; canClose?: boolean }>(function Modal({ children, title, closeLabel, onClose, onExited, className = '', canClose = true }, handle) {
  const ref = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backdropPointer = useRef(false)
  const [exiting, setExiting] = useState(false)
  useImperativeHandle(handle, () => ({ exit: () => setExiting(true), cancelExit: () => setExiting(false) }), [])
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited
  const titleId = useId()
  useEffect(() => {
    if (!exiting) return
    // Animation events can be skipped when a tab is hidden or styles change.
    const fallback = window.setTimeout(() => onExitedRef.current(), 180)
    return () => window.clearTimeout(fallback)
  }, [exiting])
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current!
    dialog.showModal()
    const node = ref.current!
    const focusable = () => [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
    const input = focusable().find(element => element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'radio')
    const target = focusable().find(element => element.hasAttribute('data-initial-focus')) ?? input ?? focusable()[0]
    target?.focus()
    if (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio') target.select()
    return () => {
      dialog.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    // A report's item history can open a receipt inside the same modal shell.
    // Move focus into the new content while keeping the original return target.
    const node = ref.current
    const visible = [...(node?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), a[href], summary') ?? [])].filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
    const target = visible.find(element => element.hasAttribute('data-initial-focus'))
      ?? visible.find(element => element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'radio')
      ?? visible[0]
    target?.focus()
    if (target instanceof HTMLInputElement) target.select()
  }, [className])
  return <dialog ref={dialogRef} aria-labelledby={titleId} className={`modal-backdrop${exiting ? ' modal-backdrop--exiting' : ''}`}
    onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); if (canClose && !exiting) onCloseRef.current() }}
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }}
    onPointerDown={event => { backdropPointer.current = event.target === event.currentTarget }}
    onClick={event => { if (backdropPointer.current && event.target === event.currentTarget && canClose && !exiting) onCloseRef.current(); backdropPointer.current = false }}>
    <div ref={ref} className={`modal ${className}`} inert={exiting} onAnimationEnd={e => { if (exiting && e.target === e.currentTarget && e.animationName === 'modal-exit') onExitedRef.current() }}>
      <h2 id={titleId} className="sr-only">{title}</h2>
      <button className="modal-close icon-button" aria-label={closeLabel} onClick={onClose} disabled={!canClose || exiting}><Icon name="close"/></button>
      <div inert={!canClose || exiting}>{children}</div>
    </div>
  </dialog>
})

