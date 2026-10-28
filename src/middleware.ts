import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

function getSecretKey(): string {
  return (
    process.env.SESSION_SECRET ||
    'nothing-essential-space-secret-key-32chars-minimum!'
  );
}

const COOKIE_NAME = 'nothing_session';

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 1. Static files, assets, API auth endpoints, and Next.js internal paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') || // Allow all auth endpoints
    pathname.startsWith('/api/proxy') || // Allow stateless CORS proxy
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
      const encodedKey = new TextEncoder().encode(getSecretKey());
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

    // If requesting any page other than /login, redirect to /login using req.nextUrl to preserve proxy domain/port
    if (pathname !== '/login') {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // 4. User IS authenticated
  // If user visits /login with ?expired=1, delete the invalidated cookie and stay on /login
  if (pathname === '/login' && searchParams.has('expired')) {
    const res = NextResponse.next();
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  // If user visits /login WITH query params (?token=..., ?refresh=..., ?qr=..., ?switch=1),
  // DO NOT force-redirect to dashboard — let the login page process the incoming token or QR handoff
  if (
    pathname === '/login' &&
    (searchParams.has('token') ||
      searchParams.has('refresh') ||
      searchParams.has('qr') ||
      searchParams.has('switch') ||
      searchParams.has('force'))
  ) {
    return NextResponse.next();
  }

  // If user is authenticated and visits clean /login without parameters, redirect to dashboard
  if (pathname === '/login') {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = '/';
    dashboardUrl.search = '';
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
