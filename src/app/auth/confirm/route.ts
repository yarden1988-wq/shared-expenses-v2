import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This project's Supabase client is configured with flowType: "pkce"
// (verified in the installed @supabase/ssr source, not assumed). Under
// PKCE, resetPasswordForEmail() stores a code verifier and appends an
// `sb_flow_id` param to the redirect; GoTrue's own hosted verify step then
// sends the browser back here with `?code=...&sb_flow_id=...`. This route's
// only job is to exchange that code for a session and hand off to
// /reset-password — that page independently verifies session validity
// before allowing any password change, so this route doesn't need to (and,
// per the public SDK types, cannot cleanly) distinguish a recovery code
// from any other PKCE code here.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const flowId = request.nextUrl.searchParams.get('sb_flow_id') ?? undefined
    await supabase.auth.exchangeCodeForSession(code, { flowId })
  }

  // Always land on /reset-password: on success a session now exists and the
  // page renders the form; on failure (missing/invalid/expired code) no
  // session exists and the page shows the Hebrew invalid-link message.
  return NextResponse.redirect(new URL('/reset-password', request.url))
}
