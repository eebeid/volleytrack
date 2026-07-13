import { NextResponse } from 'next/server';

export default function middleware(req) {
  const { pathname } = req.nextUrl;

  // Enforce HTTPS in production
  const proto = req.headers.get('x-forwarded-proto');
  if (process.env.NODE_ENV === 'production' && proto === 'http') {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url);
  }

  // Allow anyone to view the homepage and fetch bracket data (GET)
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/auth/') ||
    (req.method === 'GET' && (pathname === '/api/teams' || pathname === '/api/tournament'));

  if (!isPublic) {
    const sessionCookie =
      req.cookies.get('__Secure-next-auth.session-token') ||
      req.cookies.get('next-auth.session-token');

    if (!sessionCookie?.value) {
      // If it is an API route, return 401 instead of redirecting to signin page
      if (pathname.startsWith('/api/')) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      const signInUrl = req.nextUrl.clone();
      signInUrl.pathname = '/auth/signin';
      signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
