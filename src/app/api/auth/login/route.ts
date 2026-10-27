import { NextRequest, NextResponse } from 'next/server';
import { authenticateNothingUser, syncUserData } from '@/lib/nothing-api';
import {
  approveQrSession,
  pollNothingOAuthLogin,
  resendNothingEmailOtp,
  startNothingEmailLogin,
  startNothingOAuthLogin,
  verifyNothingEmailOtp,
} from '@/lib/nothing-auth';
import { createSession } from '@/lib/session';
import { getLatestAuthorizedUser } from '@/lib/storage';

export async function GET() {
  const savedUser = await getLatestAuthorizedUser();
  return NextResponse.json({
    hasSavedSession: Boolean(savedUser?.token),
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
    const { action, provider, email, password, token, refreshToken, sessionId, code, qrId } = body;

    // 0. Instant resume from saved server session (bypasses account.nothing.tech rate limit)
    if (action === 'resume_saved') {
      const savedUser = await getLatestAuthorizedUser();
      if (!savedUser || !savedUser.token) {
        return NextResponse.json(
          { success: false, error: 'Saved session not found' },
          { status: 400 }
        );
      }
      if (qrId) approveQrSession(qrId, savedUser);
      await createSession(savedUser);
      await syncUserData(savedUser);
      return NextResponse.json({
        success: true,
        user: {
          uuid: savedUser.uuid,
          email: savedUser.email,
          userName: savedUser.userName,
        },
      });
    }

    // 1. Start Google / Apple OAuth flow
    if (action === 'oauth_start') {
      const oauthInit = await startNothingOAuthLogin(provider === 'apple' ? 'apple' : 'google');
      return NextResponse.json({
        success: true,
        sessionId: oauthInit.sessionId,
        authorizationUrl: oauthInit.authorizationUrl,
      });
    }

    // 2. Poll Google / Apple OAuth completion
    if (action === 'oauth_poll') {
      if (!sessionId) {
        return NextResponse.json({ success: false, error: 'Missing sessionId' }, { status: 400 });
      }
      const pollResult = await pollNothingOAuthLogin(sessionId);
      if (pollResult.status === 'PENDING') {
        return NextResponse.json({ success: true, status: 'PENDING' });
      }
      if (pollResult.status === 'OTP_REQUIRED') {
        return NextResponse.json({
          success: true,
          status: 'OTP_REQUIRED',
          otpRequired: true,
          sessionId: pollResult.sessionId,
          maskedEmail: pollResult.maskedEmail,
          cooldownAt: pollResult.cooldownAt,
        });
      }

      const user = pollResult.user;
      if (qrId) approveQrSession(qrId, user);
      await createSession(user);
      await syncUserData(user);

      return NextResponse.json({
        success: true,
        status: 'SUCCESS',
        user: {
          uuid: user.uuid,
          email: user.email,
          userName: user.userName,
        },
      });
    }

    // 3. Verify 6-digit Email OTP code
    if (action === 'verify_otp') {
      if (!sessionId || !code) {
        return NextResponse.json(
          { success: false, error: 'Please enter the 6-digit verification code' },
          { status: 400 }
        );
      }
      const user = await verifyNothingEmailOtp(sessionId, code);
      if (qrId) approveQrSession(qrId, user);
      await createSession(user);
      await syncUserData(user);

      return NextResponse.json({
        success: true,
        user: {
          uuid: user.uuid,
          email: user.email,
          userName: user.userName,
        },
      });
    }

    // 4. Resend 6-digit Email OTP code
    if (action === 'resend_otp') {
      if (!sessionId) {
        return NextResponse.json(
          { success: false, error: 'Session not found' },
          { status: 400 }
        );
      }
      const res = await resendNothingEmailOtp(sessionId);
      return NextResponse.json({
        success: true,
        cooldownAt: res.cooldownAt,
      });
    }

    // 5. Direct Email + Password login via Nothing Authflow v2
    if (email && password && !token) {
      const result = await startNothingEmailLogin(email, password);
      if (result.status === 'OTP_REQUIRED') {
        return NextResponse.json({
          success: true,
          otpRequired: true,
          sessionId: result.sessionId,
          maskedEmail: result.maskedEmail,
          cooldownAt: result.cooldownAt,
        });
      }

      const user = result.user;
      if (qrId) approveQrSession(qrId, user);
      await createSession(user);
      await syncUserData(user);

      return NextResponse.json({
        success: true,
        user: {
          uuid: user.uuid,
          email: user.email,
          userName: user.userName,
        },
      });
    }

    // 6. Direct Token login (fallback)
    const user = await authenticateNothingUser({ email, password, token, refreshToken });
    if (qrId) approveQrSession(qrId, user);
    await createSession(user);
    await syncUserData(user);

    return NextResponse.json({
      success: true,
      user: {
        uuid: user.uuid,
        email: user.email,
        userName: user.userName,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Authentication failed' },
      { status: 400 }
    );
  }
}
