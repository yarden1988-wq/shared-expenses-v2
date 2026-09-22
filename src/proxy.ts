import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PROTECTED_ROUTES = ['/dashboard']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Proxy runs in the Edge/Node request context, not a Server Component, so
  // it can't use next/headers cookies() (see src/lib/supabase/server.ts).
  // It needs its own client bound to the request/response cookie jar.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Optimistic check only: validates/refreshes the session cookie. Real
  // authorization for the dashboard's own data happens in the page itself
  // (src/lib/auth/dal.ts), not here.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
