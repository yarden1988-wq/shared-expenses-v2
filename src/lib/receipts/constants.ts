// Shared (client + server) receipt rules. These mirror, and must stay in
// sync with, the storage.objects policies in
// supabase/migrations/20260925120000_add_receipt_storage.sql (bucket
// config + path regex) and 20260926000000_validate_receipt_storage_path.sql.
// Client-side checks are UX only — Storage RLS and the DB are the real
// enforcement.

export const RECEIPT_BUCKET = 'receipts'

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB, = bucket file_size_limit

// Declared MIME type -> the extension we store under. The extension is
// derived from the validated type, never from the user's filename.
const MIME_TO_EXT: Record<string, 'jpg' | 'png' | 'webp' | 'pdf'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

export const RECEIPT_ACCEPT = Object.keys(MIME_TO_EXT).join(',')

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const RECEIPT_PATH_REGEX = new RegExp(`^relationships/(${UUID})/${UUID}\\.(jpg|jpeg|png|webp|pdf)$`)

export function buildReceiptPath(relationshipId: string, mimeType: string): string | null {
  const ext = MIME_TO_EXT[mimeType]
  if (!ext) return null
  return `relationships/${relationshipId.toLowerCase()}/${crypto.randomUUID()}.${ext}`
}

export function isValidReceiptPath(path: string, relationshipId: string): boolean {
  const match = RECEIPT_PATH_REGEX.exec(path)
  return !!match && match[1] === relationshipId.toLowerCase()
}

export function receiptExtension(path: string): string | null {
  return RECEIPT_PATH_REGEX.exec(path)?.[2] ?? null
}

export function receiptContentType(path: string): string | null {
  const ext = receiptExtension(path)
  return ext ? EXT_TO_MIME[ext] : null
}

export function receiptKindLabel(path: string): string {
  return receiptExtension(path) === 'pdf' ? 'PDF' : 'תמונה'
}

// Leading-bytes signatures per allowed type. A mismatch with the declared
// type is rejected before upload. Not a security boundary (a client can
// skip it) — the download route's forced attachment + nosniff is — but it
// stops honest mistakes like a renamed .heic.
async function hasMatchingSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)

  switch (file.type) {
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)
    case 'application/pdf':
      return startsWith([0x25, 0x50, 0x44, 0x46]) // %PDF
    default:
      return false
  }
}

export async function validateReceiptFile(file: File): Promise<string | null> {
  if (!MIME_TO_EXT[file.type]) {
    return 'ניתן לצרף רק קובץ JPG, PNG, WEBP או PDF.'
  }
  if (file.size === 0) {
    return 'הקובץ ריק.'
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return 'הקובץ גדול מדי. הגודל המרבי הוא 10MB.'
  }
  if (!(await hasMatchingSignature(file))) {
    return 'תוכן הקובץ אינו תואם את סוג הקובץ.'
  }
  return null
}
