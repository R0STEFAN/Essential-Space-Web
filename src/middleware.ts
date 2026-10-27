import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET_KEY =
  process.env.SESSION_SECRET || 'nothing-essential-space-secret-key-32chars-minimum!';
const encodedKey = new TextEncoder().encode(SECRET_KEY);
const COOKIE_NAME = 'nothing_session';

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 1. Static files, assets, API auth endpoints, and Next.js internal paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') || // Allow all auth endpoints
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.startsWith('/apple-touch-icon') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css')
  ) {
    return NextResponse.next();
  }

  // 2. Read and verify session JWT from cookie
  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  let isAuthenticated = false;

  if (sessionCookie) {
    try {
      const { payload } = await jwtVerify(sessionCookie, encodedKey, {
        algorithms: ['HS256'],
      });
      if (payload && payload.uuid && payload.token) {
        isAuthenticated = true;
      }
    } catch {
      isAuthenticated = false;
    }
  }

  // 3. User is NOT authenticated
  if (!isAuthenticated) {
    // If requesting protected API routes, return 401 Unauthorized JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // If requesting any page other than /login, redirect to /login
    if (pathname !== '/login') {
      const loginUrl = new URL('/login', req.url);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // 4. User IS authenticated
  // If visiting /login (and NOT scanning a mobile QR code approval ?qr=...), redirect to dashboard
  if (pathname === '/login' && !searchParams.has('qr')) {
    const dashboardUrl = new URL('/', req.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
