'use client'

import { useEffect } from 'react'

// Shown once after a failed receipt download (the download route redirects
// here with ?receipt=unavailable). The flag is stripped from the URL right
// away so a refresh, bookmark or shared link doesn't keep showing it.
export function ReceiptUnavailableNotice() {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('receipt')) {
      url.searchParams.delete('receipt')
      window.history.replaceState(window.history.state, '', url)
    }
  }, [])

  return (
    <p
      role="alert"
      className="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-surface)] p-3 text-sm text-[var(--color-warning)]"
    >
      לא ניתן היה להוריד את הקבלה. ייתכן שהיא הוסרה או שאין לך הרשאה לצפות בה.
    </p>
  )
}
