'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Key,
  ArrowRight,
  ShieldCheck,
  Loader2,
  QrCode,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Terminal,
  Bookmark,
  ChevronLeft,
} from 'lucide-react';

type LoginTab = 'email' | 'token' | 'qr' | 'bridge';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LoginTab>('email');

  // Email & Password + 2FA OTP state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // Direct Token state
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // QR Code state (Desktop polling & Mobile approval)
  const [qrId, setQrId] = useState('');
  const [qrMobileUrl, setQrMobileUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  // Mobile QR Scanner view (?qr=...)
  const [scannedQrId, setScannedQrId] = useState<string | null>(null);
  const [savedAccount, setSavedAccount] = useState<{ email: string; userName?: string } | null>(
    null
  );
  const [qrApprovedSuccess, setQrApprovedSuccess] = useState(false);

  // Shared UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cooldown countdown timer for OTP resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Robust clipboard copy with fallback to document.execCommand
  const copyToClipboard = async (text: string) => {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        ok = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 3000);
    }
  };

  const getBridgeSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `location.href='${origin}/login?token='+encodeURIComponent(localStorage.getItem('nothingAuth_account-app-web_accessToken')||sessionStorage.getItem('nothingAuth_account-app-web_accessToken')||'')+'&refresh='+encodeURIComponent(localStorage.getItem('nothingAuth_account-app-web_refreshToken')||'');`;
  };

  // Check URL params (?qr=... or ?token=...&refresh=...) and saved server session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrParam = params.get('qr');
    const urlToken = params.get('token');
    const urlRefresh = params.get('refresh');
    if (params.get('expired') === '1') {
      setError('Your Nothing Account session expired or was invalidated. Please sign in again.');
      window.history.replaceState({}, '', '/login');
    }

    fetch('/api/auth/login')
      .then(r => r.json())
      .then(data => {
        if (data?.savedAccount) {
          setSavedAccount(data.savedAccount);
        }
      })
      .catch(() => {});

    if (qrParam) {
      setScannedQrId(qrParam);
      fetch(`/api/auth/qr?id=${encodeURIComponent(qrParam)}`)
        .then(r => r.json())
        .then(data => {
          if (data?.savedAccount) {
            setSavedAccount(data.savedAccount);
          }
        })
        .catch(() => {});
    }

    if (urlToken || urlRefresh) {
      window.history.replaceState({}, '', '/login');
      if (urlToken) setToken(urlToken);
      setLoading(true);
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: urlToken || undefined,
          refreshToken: urlRefresh || undefined,
          qrId: qrParam || undefined,
        }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            window.location.href = '/';
          } else {
            setError(data.error || 'Token authentication failed');
            setLoading(false);
          }
        })
        .catch(() => {
          setError('Connection error while communicating with server');
          setLoading(false);
        });
    }
  }, [router]);

  // Generate QR code when switching to 'qr' tab
  const generateNewQr = async () => {
    setQrLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const data = await res.json();
      if (data.success) {
        setQrId(data.qrId);
        setQrMobileUrl(data.mobileUrl);
      }
    } catch {
      setError('Failed to generate QR code');
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'qr' && !qrId && !scannedQrId) {
      generateNewQr();
    }
  }, [activeTab, qrId, scannedQrId]);

  // Poll QR status when on 'qr' tab
  useEffect(() => {
    if (activeTab !== 'qr' || !qrId || scannedQrId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/qr?id=${encodeURIComponent(qrId)}`);
        const data = await res.json();
        if (data.status === 'APPROVED') {
          clearInterval(interval);
          setLoading(true);
          const claimRes = await fetch('/api/auth/qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claim', qrId }),
          });
          const claimData = await claimRes.json();
          if (claimData.success) {
            window.location.href = '/';
          }
        } else if (data.status === 'EXPIRED') {
          clearInterval(interval);
          setQrId('');
        }
      } catch {
        // ignore transient network errors during poll
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeTab, qrId, scannedQrId, router]);

  // Step 1: Submit Email (with optional Password or direct OTP)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your Nothing Account email');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          qrId: scannedQrId || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Check if 2FA code is needed
      if (data.otpRequired) {
        setIsOtpStep(true);
        setOtpSessionId(data.sessionId);
        setMaskedEmail(data.maskedEmail || email.trim());
        if (data.cooldownAt) {
          const secs = Math.max(0, Math.ceil((Number(data.cooldownAt) - Date.now()) / 1000));
          setCooldown(secs || 60);
        } else {
          setCooldown(60);
        }
        return;
      }

      // Direct success
      if (scannedQrId) {
        setQrApprovedSuccess(true);
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify 6-digit Code from Email
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit code received on your email');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          sessionId: otpSessionId,
          code: otpCode.trim(),
          qrId: scannedQrId || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid verification code');
      }

      if (scannedQrId) {
        setQrApprovedSuccess(true);
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP code
  const handleResendOtp = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend_otp',
          sessionId: otpSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resend code');
      }
      setCooldown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  // Paste from clipboard helper
  const pasteFromClipboard = async (setter: (val: string) => void) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setter(text.trim());
          setError(null);
        }
      }
    } catch {
      // ignore clipboard permission prompt rejection
    }
  };

  // Submit Direct Token
  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = token.trim();
    const cleanRefresh = refreshToken.trim();

    if (!cleanToken && !cleanRefresh) {
      setError('Please paste your Nothing Account access token or refresh token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cleanToken || undefined,
          refreshToken: cleanRefresh || undefined,
          qrId: scannedQrId || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid access token');
      }

      if (scannedQrId) {
        setQrApprovedSuccess(true);
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Approve QR code on mobile with 1 tap (when phone already has active account)
  const handleMobileApproveQr = async () => {
    if (!scannedQrId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', qrId: scannedQrId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve QR sign-in');
      }
      setQrApprovedSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-black text-white">
      {/* Decorative Background Elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-nothing-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-nothing-dark border border-nothing-border rounded-3xl p-8 relative z-10 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 mb-3 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="Essential Space Logo" className="w-14 h-14" />
          </div>
          <h1 className="font-dot text-2xl tracking-wider uppercase text-white mb-1">
            ESSENTIAL SPACE
          </h1>
          <p className="text-xs font-mono text-nothing-gray tracking-widest uppercase">
            NOTHING OS CLOUD SYNC
          </p>
        </div>

        {/* If opened via QR scan on Phone (?qr=...) */}
        {scannedQrId ? (
          <div className="space-y-5">
            {qrApprovedSuccess ? (
              <div className="p-6 bg-green-950/30 border border-green-500/40 rounded-2xl text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
                <h2 className="font-dot text-lg text-white uppercase tracking-wider">
                  SIGN-IN APPROVED!
                </h2>
                <p className="text-xs text-nothing-gray leading-relaxed">
                  Your desktop browser is now signed into your Nothing Account. You can close this tab or open the dashboard below.
                </p>
                <button
                  onClick={() => (window.location.href = '/')}
                  className="w-full bg-white text-black font-dot uppercase tracking-wider py-3 rounded-xl text-xs hover:bg-nothing-red hover:text-white transition-all"
                >
                  OPEN DASHBOARD ON PHONE
                </button>
              </div>
            ) : savedAccount ? (
              <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-3">
                <div className="flex items-center gap-2.5 text-nothing-red text-xs font-mono uppercase tracking-wider">
                  <Smartphone className="w-4 h-4" />
                  <span>MOBILE SIGN-IN APPROVAL</span>
                </div>
                <p className="text-xs text-nothing-gray leading-relaxed">
                  You scanned a QR code to authorize Essential Space Web on your desktop computer.
                </p>

                <div className="pt-2 space-y-3">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                    <div className="truncate">
                      <div className="text-[11px] font-mono text-nothing-gray uppercase">
                        Account to Authorize:
                      </div>
                      <div className="text-sm font-medium text-white truncate">
                        {savedAccount.email}
                      </div>
                    </div>
                    <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
                  </div>
                  <button
                    type="button"
                    onClick={handleMobileApproveQr}
                    disabled={loading}
                    className="w-full bg-nothing-red text-white font-dot uppercase tracking-wider py-3.5 rounded-xl hover:bg-white hover:text-black transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-nothing-red/25"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>APPROVE DESKTOP SIGN-IN</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Regular Login View (or mobile sign-in if no saved account yet) */}
        {!scannedQrId || (!savedAccount && !qrApprovedSuccess) ? (
          <>
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/60 border border-nothing-border rounded-xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('email');
                  setError(null);
                }}
                className={`py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'email'
                    ? 'bg-nothing-red text-white shadow'
                    : 'text-nothing-gray hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>EMAIL</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('token');
                  setError(null);
                }}
                className={`py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'token'
                    ? 'bg-nothing-red text-white shadow'
                    : 'text-nothing-gray hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5 shrink-0" />
                <span>TOKEN</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('qr');
                  setError(null);
                }}
                className={`py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'qr'
                    ? 'bg-nothing-red text-white shadow'
                    : 'text-nothing-gray hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span>QR CODE</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('bridge');
                  setError(null);
                }}
                className={`py-2 px-1 rounded-lg text-[10px] sm:text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'bridge'
                    ? 'bg-nothing-red text-white shadow'
                    : 'text-nothing-gray hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>SYNC</span>
              </button>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-nothing-red/10 border border-nothing-red/30 text-nothing-red text-xs font-mono">
                [ERROR]: {error}
              </div>
            )}

            {/* TAB 1: EMAIL & PASSWORD + 2FA VERIFICATION CODE */}
            {activeTab === 'email' && (
              <div>
                {!isOtpStep ? (
                  /* Step 1: Email and Password Form */
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase text-nothing-gray mb-1.5">
                        NOTHING ACCOUNT EMAIL
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-nothing-gray absolute left-3.5 top-3.5 pointer-events-none" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full bg-black border border-nothing-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-mono uppercase text-nothing-gray">
                          PASSWORD (OPTIONAL)
                        </label>
                        <span className="text-[10px] font-mono text-nothing-gray/60">
                          Empty = Send code to email (OTP)
                        </span>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-nothing-gray absolute left-3.5 top-3.5 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="•••••••••••• (leave blank for email code)"
                          className="w-full bg-black border border-nothing-border rounded-xl py-2.5 pl-10 pr-10 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3 text-nothing-gray hover:text-white transition-colors"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-white text-black font-dot uppercase tracking-wider py-3.5 rounded-xl hover:bg-nothing-red hover:text-white transition-all duration-200 flex items-center justify-center gap-2 font-medium disabled:opacity-50 mt-2 shadow-lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>CONNECTING TO NOTHING...</span>
                        </>
                      ) : (
                        <>
                          <span>SIGN IN WITH NOTHING ACCOUNT</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <p className="text-[11px] font-mono text-nothing-gray text-center pt-1 leading-relaxed">
                      If 2FA is active, Nothing will send a 6-digit verification code to your email.
                    </p>
                  </form>
                ) : (
                  /* Step 2: 6-Digit Email Verification Code */
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="p-4 bg-black/60 border border-nothing-border rounded-2xl text-center space-y-2">
                      <div className="text-xs font-mono text-nothing-red uppercase tracking-wider">
                        SECURITY VERIFICATION (2FA)
                      </div>
                      <p className="text-xs text-nothing-gray leading-relaxed">
                        Nothing sent a 6-digit confirmation code to:
                        <br />
                        <span className="text-white font-mono font-medium">{maskedEmail}</span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase text-nothing-gray mb-1.5 text-center">
                        ENTER 6-DIGIT CODE
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="000000"
                        className="w-full bg-black border-2 border-nothing-border focus:border-nothing-red rounded-xl py-3 text-center text-2xl tracking-[0.5em] text-white placeholder:text-nothing-gray/30 focus:outline-none transition-colors font-mono font-bold"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading || otpCode.trim().length !== 6}
                      className="w-full bg-nothing-red text-white font-dot uppercase tracking-wider py-3.5 rounded-xl hover:bg-white hover:text-black transition-all duration-200 flex items-center justify-center gap-2 font-medium disabled:opacity-50 shadow-lg shadow-nothing-red/20"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>VERIFYING CODE...</span>
                        </>
                      ) : (
                        <>
                          <span>VERIFY &amp; SIGN IN</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between pt-1 text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOtpStep(false);
                          setError(null);
                        }}
                        className="text-nothing-gray hover:text-white flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Change Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={cooldown > 0 || resending}
                        className="text-nothing-red hover:underline disabled:text-nothing-gray disabled:no-underline flex items-center gap-1"
                      >
                        {resending && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* TAB 2: DIRECT TOKEN */}
            {activeTab === 'token' && (
              <form onSubmit={handleTokenLogin} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-mono uppercase text-nothing-gray">
                      ACCESS TOKEN (OR REFRESH TOKEN)
                    </label>
                    <button
                      type="button"
                      onClick={() => pasteFromClipboard(setToken)}
                      className="text-[10px] font-mono text-nothing-gray hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>PASTE CLIPBOARD</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Key className="w-4 h-4 text-nothing-gray absolute left-3.5 top-3.5 pointer-events-none" />
                    <textarea
                      rows={4}
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9... or OOz1rwIW..."
                      required
                      className="w-full bg-black border border-nothing-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono break-all"
                    />
                  </div>
                </div>

                {/* Optional Refresh Token Field */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedToken(!showAdvancedToken)}
                    className="text-[11px] font-mono text-nothing-gray hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <span>{showAdvancedToken ? '▾ Hide Refresh Token field' : '▸ + Add Refresh Token (recommended for 30-day session)'}</span>
                  </button>

                  {showAdvancedToken && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-mono uppercase text-nothing-gray">
                          REFRESH TOKEN (OPTIONAL)
                        </label>
                        <button
                          type="button"
                          onClick={() => pasteFromClipboard(setRefreshToken)}
                          className="text-[10px] font-mono text-nothing-gray hover:text-white transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>PASTE CLIPBOARD</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={refreshToken}
                        onChange={e => setRefreshToken(e.target.value)}
                        placeholder="OOz1rwIWlHuIkM6oL_..."
                        className="w-full bg-black border border-nothing-border rounded-xl py-2 px-3 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono"
                      />
                    </div>
                  )}
                </div>

                <div className="p-3 bg-black/50 border border-nothing-border rounded-xl space-y-1.5 text-[11px] font-mono text-nothing-gray">
                  <div className="text-white font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-nothing-red" />
                    <span>How to get your token from account.nothing.tech:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[10px] text-nothing-gray/80 pl-1 leading-relaxed">
                    <li>Sign in at <span className="text-white">account.nothing.tech</span> in your browser.</li>
                    <li>Press <span className="text-white">F12</span> → <span className="text-white">Application</span> → <span className="text-white">Local Storage</span>.</li>
                    <li>Copy <code className="text-white">nothingAuth_account-app-web_accessToken</code> (and optionally <code className="text-white">nothingAuth_account-app-web_refreshToken</code>).</li>
                  </ol>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black font-dot uppercase tracking-wider py-3.5 rounded-xl hover:bg-nothing-red hover:text-white transition-all duration-200 flex items-center justify-center gap-2 font-medium disabled:opacity-50 mt-2 shadow-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>VERIFYING TOKEN &amp; SYNCING...</span>
                    </>
                  ) : (
                    <>
                      <span>SIGN IN WITH TOKEN</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 3: QR CODE */}
            {activeTab === 'qr' && (
              <div className="space-y-4 text-center">
                <div className="p-5 bg-black/50 border border-nothing-border rounded-2xl flex flex-col items-center">
                  {qrLoading || !qrMobileUrl ? (
                    <div className="w-52 h-52 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-nothing-red" />
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-2xl shadow-lg">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(
                          qrMobileUrl
                        )}`}
                        alt="QR Code Login"
                        className="w-48 h-48 rounded-lg"
                      />
                    </div>
                  )}

                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-center gap-2 text-xs font-dot uppercase tracking-wider text-white">
                      <Smartphone className="w-4 h-4 text-nothing-red" />
                      <span>SCAN WITH YOUR PHONE CAMERA</span>
                    </div>
                    <p className="text-[11px] text-nothing-gray leading-relaxed max-w-xs">
                      Scan this QR code with your Nothing Phone camera. If you are already logged in on your phone, tap{' '}
                      <span className="text-white">&quot;Approve&quot;</span> to log into desktop instantly!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={generateNewQr}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-nothing-gray hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh QR code</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: BROWSER SYNC / TOKEN */}
            {activeTab === 'bridge' && (
              <div className="space-y-4">
                {/* Step 1: Open account.nothing.tech */}
                <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-nothing-red tracking-wider">
                      STEP 1 • SIGN IN ON OFFICIAL NOTHING SITE
                    </span>
                    <span className="text-[10px] font-mono text-nothing-gray">Web Portal</span>
                  </div>
                  <p className="text-xs text-nothing-gray leading-relaxed">
                    Open the official Nothing login in a new tab:
                  </p>
                  <a
                    href="https://account.nothing.tech/v2/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white hover:text-black text-white font-dot uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <span>OPEN ACCOUNT.NOTHING.TECH</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Step 2: 1-Click Console Snippet */}
                <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono uppercase text-green-400 tracking-wider">
                      STEP 2 • SYNC SESSION COMMAND
                    </span>
                  </div>

                  <p className="text-xs text-nothing-gray leading-relaxed">
                    On <code className="text-white">account.nothing.tech</code>, press{' '}
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] font-mono">F12</kbd> → Console, paste this command, and press Enter:
                  </p>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getBridgeSnippet())}
                      className="w-full py-3 px-3 rounded-xl bg-nothing-red hover:bg-white hover:text-black text-white font-dot uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-nothing-red/20 font-medium"
                    >
                      {copiedSnippet ? (
                        <>
                          <Check className="w-4 h-4 text-green-300" />
                          <span>COPIED! PASTE IN NOTHING F12 CONSOLE</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>COPY 1-LINE SYNC COMMAND</span>
                        </>
                      )}
                    </button>

                    {/* Visible code block for manual copy */}
                    <div className="relative">
                      <textarea
                        readOnly
                        rows={3}
                        value={getBridgeSnippet()}
                        onClick={e => (e.target as HTMLTextAreaElement).select()}
                        className="w-full bg-black/80 border border-nothing-border rounded-xl p-2.5 text-[10px] font-mono text-nothing-gray hover:text-white select-all focus:outline-none focus:border-nothing-red"
                      />
                    </div>
                  </div>

                  {/* Bookmarklet option */}
                  <div className="pt-2 border-t border-nothing-border/50">
                    <div className="text-[10px] font-mono text-nothing-gray uppercase mb-1.5">
                      Or drag this to your Bookmarks Bar:
                    </div>
                    <a
                      href={getBridgeSnippet()}
                      title="Drag to your Bookmarks Bar, then click while on account.nothing.tech"
                      className="w-full py-2.5 px-4 rounded-xl bg-nothing-card hover:bg-nothing-hover border border-dashed border-nothing-gray/50 text-xs font-mono text-white flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-nothing-red" />
                      <span>⚡ Sync Nothing Space (Drag to Bookmarks)</span>
                    </a>
                  </div>

                  {/* Direct Token Tab Shortcut */}
                  <div className="pt-2 border-t border-nothing-border/50 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('token');
                        setError(null);
                      }}
                      className="text-[11px] font-mono text-nothing-gray hover:text-white inline-flex items-center gap-1.5 transition-colors py-1"
                    >
                      <Key className="w-3.5 h-3.5 text-nothing-red" />
                      <span>Prefer entering token directly? Switch to the TOKEN tab →</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Footer Info */}
        <div className="mt-6 pt-5 border-t border-nothing-border flex items-start gap-2.5 text-xs text-nothing-gray">
          <ShieldCheck className="w-4 h-4 text-nothing-red shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            Your session is securely signed and stored inside your self-hosted instance. It communicates directly with Nothing Cloud to fetch notes, voice audio, and tasks.
          </p>
        </div>
      </div>
    </div>
  );
}
