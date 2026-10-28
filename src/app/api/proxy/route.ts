import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'essential-space.nothingtech.link',
  'account-c2-api.nothingtech.link',
  'firebasestorage.googleapis.com',
  'identitytoolkit.googleapis.com',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, timestamp, auth, X-Trace-Id, X-Target-Url, Accept',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

async function handleRelay(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get('url') || req.headers.get('x-target-url');

    if (!targetUrl) {
      return NextResponse.json(
        { error: 'Missing target URL (?url= or X-Target-Url)' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid target URL' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: `Forbidden host: ${parsedUrl.hostname}` },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // Forward required headers
    const forwardHeaders: Record<string, string> = {};
    const allowedHeaders = [
      'authorization',
      'content-type',
      'timestamp',
      'auth',
      'x-trace-id',
      'accept',
    ];

    for (const header of allowedHeaders) {
      const val = req.headers.get(header);
      if (val) forwardHeaders[header] = val;
    }

    // Forward request body if applicable
    let body: BodyInit | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.arrayBuffer();
    }

    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    const responseBody = await upstreamResponse.arrayBuffer();

    const responseHeaders = new Headers(CORS_HEADERS);
    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);

    return new NextResponse(responseBody, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('Proxy relay error:', err);
    return NextResponse.json(
      { error: err?.message || 'Proxy relay failed' },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export const GET = handleRelay;
export const POST = handleRelay;
export const PUT = handleRelay;
export const DELETE = handleRelay;
export const PATCH = handleRelay;
