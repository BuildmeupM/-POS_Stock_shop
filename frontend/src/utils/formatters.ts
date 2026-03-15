/**
 * Shared formatting utilities for the POS Bookdee frontend.
 * Centralizes number and date formatting that was previously duplicated across pages.
 */

/** Format number with 2 decimal places, Thai locale (e.g. 1,234.56) */
export const fmt = (n: number): string =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)

/** Short date format: "15 มี.ค. 69" */
export const fmtDate = (d: string): string => {
  if (!d) return '-'
  const dt = new Date(d)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

/** Short date + time: "15 มี.ค. 69 12:30" */
export const fmtDateTime = (d: string): string => {
  if (!d) return '-'
  const dt = new Date(d)
  return (
    dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' +
    dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  )
}

/** Long date format: "15 มีนาคม 2569" */
export const fmtDateFull = (d: string): string => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/** Full date + time for display: "15 มีนาคม 2569 12:30" */
export const fmtDateTimeFull = (d: string): string => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Convert ISO date string to input[type=date] value "YYYY-MM-DD" */
export const toInputDate = (d: string): string =>
  d ? new Date(d).toISOString().slice(0, 10) : ''
