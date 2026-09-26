import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RECEIPT_BUCKET, isValidReceiptPath, receiptContentType, receiptExtension } from '@/lib/receipts/constants'

// Receipt download, proxied through the app under the user's own session
// (no service_role, no public or signed URL handed to the browser).
//
// Access is resolved from the EXPENSE, never from a client-supplied path:
// expenses RLS decides whether this user may see this expense at all
// (drafts are creator-only), and then the storage.objects SELECT policy
// independently decides whether the object may be read.
//
// The bytes are user-uploaded and untrusted (Storage only checks the
// declared MIME type), so they are always served as an attachment, with a
// Content-Type derived from our own extension allowlist, nosniff, and a
// sandboxing CSP in case a browser renders them anyway.
export async function GET(request: NextRequest, ctx: RouteContext<'/dashboard/relationships/[id]/expenses/[expenseId]/receipt'>) {
  const { id, expenseId } = await ctx.params
  const supabase = await createClient()

  // A download link is a top-level navigation, so a bare error body would
  // replace the app. Send the user back to the expense page instead, which
  // shows a Hebrew notice (or its own 404 if the expense isn't visible to
  // them — no more information than visiting that page directly).
  const backToExpense = () =>
    NextResponse.redirect(
      new URL(
        `/dashboard/relationships/${encodeURIComponent(id)}/expenses/${encodeURIComponent(expenseId)}?receipt=unavailable`,
        request.url
      ),
      303
    )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), 303)
  }

  const { data: expense } = await supabase
    .from('expenses')
    .select('id, relationship_id, receipt_storage_path')
    .eq('id', expenseId)
    .maybeSingle()

  const path = expense?.receipt_storage_path as string | null | undefined
  if (!expense || expense.relationship_id !== id || !path || !isValidReceiptPath(path, id)) {
    return backToExpense()
  }

  const { data: blob, error } = await supabase.storage.from(RECEIPT_BUCKET).download(path)
  if (error || !blob) {
    return backToExpense()
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': receiptContentType(path) ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="receipt-${expense.id}.${receiptExtension(path)}"`,
      'Content-Length': String(blob.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
