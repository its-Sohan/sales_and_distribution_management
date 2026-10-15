import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Lang, ReportWindow } from './model'
import { reportRange, reportWindowMode, dhakaDateKey, moveDate, moveMonth } from './model'
import { reportsTranslator } from './reportsCopy'
import { translator } from './i18n'
import { Icon } from './Icons'
import { formatUiDate } from './dateFormat'

export { moveDate, moveMonth }

export interface ReportWindowControlProps {
  window: ReportWindow
  onWindow: (window: ReportWindow) => void
  now: Date
  lang: Lang
  idPrefix?: string
}

export function ReportWindowControl({
  window,
  onWindow,
  now,
  lang,
  idPrefix = 'report',
}: ReportWindowControlProps) {
  const t = translator(lang), rt = reportsTranslator(lang)
  const range = reportRange(window, now)
  const mode = reportWindowMode(window)
  const from = dhakaDateKey(new Date(range.start))
  const to = dhakaDateKey(new Date(range.end - 1))
  const month = from.slice(0, 7)
  const formatter = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    month: 'long', year: 'numeric',
  })
  const summary = mode === 'range'
    ? `${formatUiDate(range.start)} – ${formatUiDate(range.end - 1)}`
    : mode === 'month' ? formatter.format(new Date(range.start)) : formatUiDate(range.start)
  const editorId = `${idPrefix}-period-editor-${useId()}`
  const [editorOpen, setEditorOpen] = useState(false)
  const editorRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const backdropPointer = useRef(false)

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editorOpen || !editor) return
    editor.showModal()

    const positionEditor = () => {
      // The dialog's top layer avoids clipping in scrolling reports and tables.
      if (globalThis.window.matchMedia('(max-width: 680px)').matches) {
        editor.style.removeProperty('left')
        editor.style.removeProperty('top')
        return
      }
      const anchor = triggerRef.current?.getBoundingClientRect()
      if (!anchor) return
      const { width, height } = editor.getBoundingClientRect()
      const viewport = globalThis.window
      const left = Math.max(12, Math.min(anchor.right - width, viewport.innerWidth - width - 12))
      const top = anchor.bottom + height + 8 <= viewport.innerHeight - 12
        ? anchor.bottom + 8 : Math.max(12, anchor.top - height - 8)
      editor.style.left = `${left}px`
      editor.style.top = `${top}px`
    }
    positionEditor()
    globalThis.window.addEventListener('resize', positionEditor)
    globalThis.window.addEventListener('scroll', positionEditor, true)
    return () => {
      globalThis.window.removeEventListener('resize', positionEditor)
      globalThis.window.removeEventListener('scroll', positionEditor, true)
      editor.close()
    }
  }, [editorOpen])

  const closeEditor = () => editorRef.current?.close()

  const changePeriodMode = (next: 'day' | 'month' | 'range') => {
    if (next === mode) return
    const today = dhakaDateKey(now)
    if (next === 'day') onWindow({ mode: 'day', date: today })
    else if (next === 'month') onWindow({ mode: 'month', month: today.slice(0, 7) })
    else onWindow({ mode: 'range', from: `${today.slice(0, 7)}-01`, to: today })
  }

  const movePeriod = (direction: number) => {
    const currentMode = reportWindowMode(window)
    if (currentMode === 'day') {
      onWindow({ mode: 'day', date: moveDate(from, direction) })
    } else if (currentMode === 'month') {
      onWindow({ mode: 'month', month: moveMonth(month, direction) })
    } else {
      onWindow({ mode: 'range', from: moveDate(from, direction * range.days), to: moveDate(to, direction * range.days) })
    }
  }

  return (
    <div
      className={`report-window-container ${mode === 'range' ? 'is-range' : ''}`}
      role="group"
      aria-label={t('reportWindow')}
    >
      <div className="report-window-head">
        <span className="report-window-label" title={t('reportWindow')} aria-hidden="true">
          <Icon name="clock" size={13} />
        </span>
        <div className="report-period-mode" role="group" aria-label={t('reportWindow')}>
          {(['day', 'month', 'range'] as const).map(item => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              className={mode === item ? 'active' : ''}
              onClick={() => changePeriodMode(item)}
            >
              {rt(item)}
            </button>
          ))}
        </div>
      </div>
      <div className="report-period-picker">
        <button
          className="report-period-step report-period-previous"
          type="button"
          onClick={() => movePeriod(-1)}
          aria-label={rt('previousPeriod')}
          title={rt('previousPeriod')}
        >
          <Icon name="chevron" size={13} />
        </button>
        <button
          ref={triggerRef}
          className="report-period-summary"
          type="button"
          aria-label={`${rt('editPeriod')}: ${summary}`}
          aria-haspopup="dialog"
          aria-expanded={editorOpen}
          aria-controls={editorId}
          title={summary}
          onClick={() => setEditorOpen(true)}
        >
          <span>{summary}</span><Icon name="down" size={12} />
        </button>
        <button
          className="report-period-step report-period-next"
          type="button"
          onClick={() => movePeriod(1)}
          aria-label={rt('nextPeriod')}
          title={rt('nextPeriod')}
        >
          <Icon name="chevron" size={13} />
        </button>
      </div>
      <dialog
        ref={editorRef}
        id={editorId}
        className="report-period-editor"
        aria-labelledby={`${editorId}-title`}
        onClose={() => { setEditorOpen(false); triggerRef.current?.focus() }}
        onKeyDown={event => event.stopPropagation()}
        onPointerDown={event => { backdropPointer.current = event.target === event.currentTarget }}
        onClick={event => { if (backdropPointer.current && event.target === event.currentTarget) closeEditor() }}
      >
        <div className="report-period-editor-content">
          <div className="report-period-editor-heading">
            <h3 id={`${editorId}-title`}>{t('reportWindow')} · {rt(mode)}</h3>
            <button type="button" className="report-period-editor-close" aria-label={t('close')} onClick={closeEditor}><Icon name="close" size={16} /></button>
          </div>
          <div className="report-period-editor-fields">
            {mode === 'day' && (
              <label className="report-period-editor-field">
                <span>{rt('calendarDate')}</span>
                <input
                  id={`${idPrefix}-date`}
                  type="date"
                  lang="en-GB"
                  autoFocus
                  aria-label={rt('selectDate')}
                  value={from}
                  onChange={event => event.target.value && onWindow({ mode: 'day', date: event.target.value })}
                />
              </label>
            )}
            {mode === 'month' && (
              <label className="report-period-editor-field">
                <span>{rt('month')}</span>
                <input
                  id={`${idPrefix}-month`}
                  type="month"
                  autoFocus
                  aria-label={rt('selectMonth')}
                  value={month}
                  onChange={event => event.target.value && onWindow({ mode: 'month', month: event.target.value })}
                />
              </label>
            )}
            {mode === 'range' && (
              <>
                <label className="report-period-editor-field">
                  <span>{rt('from')}</span>
                  <input
                    id={`${idPrefix}-range-from`}
                    type="date"
                    lang="en-GB"
                    autoFocus
                    aria-label={rt('rangeFrom')}
                    value={from}
                    onChange={event => {
                      if (!event.target.value) return
                      onWindow({
                        mode: 'range',
                        from: event.target.value,
                        to: to < event.target.value ? event.target.value : to,
                      })
                    }}
                  />
                </label>
                <label className="report-period-editor-field">
                  <span>{rt('to')}</span>
                  <input
                    id={`${idPrefix}-range-to`}
                    type="date"
                    lang="en-GB"
                    aria-label={rt('rangeTo')}
                    value={to}
                    onChange={event => {
                      if (!event.target.value) return
                      onWindow({
                        mode: 'range',
                        from: from > event.target.value ? event.target.value : from,
                        to: event.target.value,
                      })
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <div className="report-period-editor-actions"><button type="button" onClick={closeEditor}>{rt('done')}</button></div>
        </div>
      </dialog>
    </div>
  )
}

