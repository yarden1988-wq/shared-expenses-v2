'use client'

import { useId, useRef, useState } from 'react'
import { CircleCheck, Download, FileText, LoaderCircle, Paperclip, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  RECEIPT_ACCEPT,
  RECEIPT_BUCKET,
  buildReceiptPath,
  receiptKindLabel,
  validateReceiptFile,
} from '@/lib/receipts/constants'

// What will be saved with the expense:
// - 'original': keep the receipt the expense already has (edit mode)
// - 'none':     no receipt (or remove the original on save)
// - 'new':      a file uploaded in this session, not yet saved
type Selection = { kind: 'original' } | { kind: 'none' } | { kind: 'new'; path: string; fileName: string }

// Upload happens straight from the browser under the user's own session
// (Storage RLS: participant + strict path + owner). The form only submits
// the resulting path; the server action saves it via the RPC and only
// THEN deletes a replaced/removed original — never before.
//
// A 'new' upload that gets superseded before saving (picked another file,
// removed it, or restored the original) is unreferenced, so deleting it
// right away is both allowed by the receipts_delete policy and safe.
export function ReceiptField({
  relationshipId,
  expenseId,
  originalPath,
  error,
  saving,
  onUploadingChange,
}: {
  relationshipId: string
  expenseId?: string
  originalPath: string | null
  error?: string
  // While the form is saving, the selection must not change: discarding an
  // unsaved upload mid-save would delete the object being attached.
  saving: boolean
  onUploadingChange: (uploading: boolean) => void
}) {
  const labelId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selection, setSelection] = useState<Selection>(originalPath ? { kind: 'original' } : { kind: 'none' })
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const pathToSave =
    selection.kind === 'new' ? selection.path : selection.kind === 'original' ? (originalPath ?? '') : ''

  function setBusy(value: boolean) {
    setUploading(value)
    onUploadingChange(value)
  }

  function discardUnsavedUpload(current: Selection) {
    if (current.kind !== 'new') return
    // Best effort: if this fails the object is just an orphan.
    void createClient().storage.from(RECEIPT_BUCKET).remove([current.path])
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-picking the same file after an error
    if (!file) return

    setLocalError(null)
    // Busy from the first await, so Save can't go out mid-validation.
    setBusy(true)
    const validationError = await validateReceiptFile(file)
    if (validationError) {
      setBusy(false)
      setLocalError(validationError)
      return
    }

    const path = buildReceiptPath(relationshipId, file.type)
    if (!path) {
      setBusy(false)
      setLocalError('ניתן לצרף רק קובץ JPG, PNG, WEBP או PDF.')
      return
    }

    const { error: uploadError } = await createClient()
      .storage.from(RECEIPT_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type })
    setBusy(false)

    if (uploadError) {
      setLocalError('העלאת הקבלה נכשלה. בדקו את החיבור ונסו שוב.')
      return
    }

    discardUnsavedUpload(selection)
    setSelection({ kind: 'new', path, fileName: file.name })
  }

  function handleRemove() {
    setLocalError(null)
    discardUnsavedUpload(selection)
    setSelection({ kind: 'none' })
  }

  function handleRestoreOriginal() {
    setLocalError(null)
    discardUnsavedUpload(selection)
    setSelection({ kind: 'original' })
  }

  function openPicker() {
    inputRef.current?.click()
  }

  const shownError = localError ?? error
  const locked = uploading || saving
  const hasOriginal = !!originalPath
  const willReplaceOriginal = hasOriginal && selection.kind === 'new'
  const willRemoveOriginal = hasOriginal && selection.kind === 'none'

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={shownError ? errorId : undefined}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="receiptStoragePath" value={pathToSave} />
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <span id={labelId} className="text-sm font-medium">
        קבלה (לא חובה)
      </span>

      <div
        className={`flex flex-col gap-3 rounded-2xl border p-4 ${
          selection.kind === 'none' && !uploading
            ? 'border-dashed border-border bg-surface-muted'
            : 'border-border bg-surface'
        }`}
      >
        <div aria-live="polite" className="flex items-start gap-3">
          {uploading ? (
            <>
              <LoaderCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">מעלה את הקבלה…</span>
                <span className="text-xs text-muted">אפשר להמשיך למלא את הטופס. השמירה תתאפשר בסיום ההעלאה.</span>
              </div>
            </>
          ) : selection.kind === 'new' ? (
            <>
              <CircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">הקבלה הועלתה ותישמר עם ההוצאה</span>
                <span dir="auto" className="truncate text-xs text-muted">
                  {selection.fileName}
                </span>
                {willReplaceOriginal && (
                  <span className="text-xs text-[var(--color-warning)]">
                    הקבלה הקודמת תוחלף בעת השמירה.
                  </span>
                )}
              </div>
            </>
          ) : selection.kind === 'original' && originalPath ? (
            <>
              <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">קבלה מצורפת ({receiptKindLabel(originalPath)})</span>
                {expenseId && (
                  // Plain <a>, not <Link>: a file download must never be prefetched.
                  <a
                    href={`/dashboard/relationships/${relationshipId}/expenses/${expenseId}/receipt`}
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    <Download aria-hidden="true" className="h-3.5 w-3.5" />
                    הורדת הקבלה
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              <Paperclip aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {willRemoveOriginal ? 'הקבלה תוסר בעת השמירה' : 'לא צורפה קבלה'}
                </span>
                <span className="text-xs text-muted">JPG, PNG, WEBP או PDF · עד 10MB</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {selection.kind === 'none' ? (
            <button
              type="button"
              onClick={openPicker}
              disabled={locked}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              <Paperclip aria-hidden="true" className="h-4 w-4" />
              צירוף קבלה
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={openPicker}
                disabled={locked}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                החלפת קבלה
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={locked}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-danger-border)] px-4 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-surface)] disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                הסרת קבלה
              </button>
            </>
          )}
          {hasOriginal && selection.kind !== 'original' && (
            <button
              type="button"
              onClick={handleRestoreOriginal}
              disabled={locked}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
            >
              <Undo2 aria-hidden="true" className="h-4 w-4" />
              ביטול ושמירת הקבלה הקודמת
            </button>
          )}
        </div>
      </div>

      {shownError && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {shownError}
        </p>
      )}
    </div>
  )
}
