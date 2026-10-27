import os from 'os';
import { NextRequest, NextResponse } from 'next/server';
import { approveQrSession, createQrSession, getQrSession } from '@/lib/nothing-auth';
import { createSession, getSession } from '@/lib/session';
import { getLatestAuthorizedUser } from '@/lib/storage';
import { syncUserData } from '@/lib/nothing-api';

function getLanOrigin(req: NextRequest): string {
  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';

  if (!hostHeader.startsWith('localhost') && !hostHeader.startsWith('127.0.0.1')) {
    return `${proto}://${hostHeader}`;
  }

  const port = hostHeader.split(':')[1] || '3000';
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          net.address.startsWith('172.')
        ) {
          return `http://${net.address}:${port}`;
        }
      }
    }
  }

  return `${proto}://${hostHeader}`;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const qrSession = getQrSession(id);
  const currentSession = await getSession();
  const savedUser = currentSession || (await getLatestAuthorizedUser());

  if (!qrSession) {
    return NextResponse.json({ status: 'EXPIRED' });
  }

  return NextResponse.json({
    id: qrSession.id,
    status: qrSession.status,
    savedAccount: savedUser
      ? {
          email: savedUser.email,
          userName: savedUser.userName,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, qrId } = body;

    if (action === 'create') {
      const session = createQrSession();
      const baseOrigin = getLanOrigin(req);
      const mobileUrl = `${baseOrigin}/login?qr=${encodeURIComponent(session.id)}`;

      return NextResponse.json({
        success: true,
        qrId: session.id,
        mobileUrl,
      });
    }

    if (action === 'approve') {
      if (!qrId) {
        return NextResponse.json({ success: false, error: 'Missing qrId' }, { status: 400 });
      }
      const activeUser = (await getSession()) || (await getLatestAuthorizedUser());
      if (!activeUser) {
        return NextResponse.json(
          {
            success: false,
            error: 'Not signed in on mobile yet. Please sign in with your email and password below.',
          },
          { status: 400 }
        );
      }

      const ok = approveQrSession(qrId, activeUser);
      if (!ok) {
        return NextResponse.json(
          { success: false, error: 'QR code has expired. Please refresh it on your desktop.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        email: activeUser.email,
      });
    }

    if (action === 'claim') {
      if (!qrId) {
        return NextResponse.json({ success: false, error: 'Missing qrId' }, { status: 400 });
      }
      const qrSession = getQrSession(qrId);
      if (!qrSession || qrSession.status !== 'APPROVED' || !qrSession.user) {
        return NextResponse.json(
          { success: false, error: 'QR session has not been approved yet' },
          { status: 400 }
        );
      }

      await createSession(qrSession.user);
      await syncUserData(qrSession.user);

      return NextResponse.json({
        success: true,
        user: {
          uuid: qrSession.user.uuid,
          email: qrSession.user.email,
          userName: qrSession.user.userName,
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'QR error' },
      { status: 500 }
    );
  }
}
