import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * Hook: listens for USB barcode scanner input (keyboard wedge mode)
 * Barcode scanners send characters rapidly followed by Enter key.
 * This hook captures fast sequential keystrokes and treats them as barcode input.
 */
export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input field (except barcode-dedicated ones)
    const target = e.target as HTMLElement
    const isSearchInput = target.tagName === 'INPUT' && target.getAttribute('data-barcode') === 'true'
    const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    // If typing in a non-barcode input, skip
    if (isInputField && !isSearchInput) return

    // Clear previous timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    if (e.key === 'Enter') {
      // Submit barcode if buffer has content (minimum 3 chars to avoid accidental Enter)
      if (bufferRef.current.length >= 3) {
        const barcode = bufferRef.current.trim()
        setLastScanned(barcode)
        onScan(barcode)
        e.preventDefault()
      }
      bufferRef.current = ''
      return
    }

    // Only accept printable characters
    if (e.key.length === 1) {
      bufferRef.current += e.key

      // Reset buffer if no keystroke within 50ms (scanner sends chars very fast)
      timeoutRef.current = setTimeout(() => {
        bufferRef.current = ''
      }, 100)
    }
  }, [onScan])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [handleKeyDown])

  return { lastScanned }
}
