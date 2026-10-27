'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
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
} from 'lucide-react';

type LoginTab = 'connect' | 'qr' | 'token';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LoginTab>('connect');

  // Direct Token / Refresh Token state
  const [token, setToken] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement | null>(null);

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

  // Set bookmarklet href dynamically using raw DOM attribute (avoids React javascript: warning)
  useEffect(() => {
    if (bookmarkletRef.current && typeof window !== 'undefined') {
      const origin = window.location.origin;
      const jsCode = `javascript:(function(){var t=localStorage.getItem('nothingAuth_account-app-web_accessToken')||sessionStorage.getItem('nothingAuth_account-app-web_accessToken')||'';var r=localStorage.getItem('nothingAuth_account-app-web_refreshToken')||'';if(!t&&!r){alert('Please sign in on account.nothing.tech first, then click this bookmark!');return;}location.href='${origin}/login?token='+encodeURIComponent(t)+'&refresh='+encodeURIComponent(r);})();`;
      bookmarkletRef.current.setAttribute('href', jsCode);
    }
  }, [activeTab]);

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
            router.push('/');
            router.refresh();
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

  // Initialize QR code when switching to 'qr' tab
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
            router.push('/');
            router.refresh();
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

  // Submit Direct Token (or Refresh Token)
  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
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

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Approve QR code on mobile with 1 tap
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

  const copyQuickBridgeSnippet = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const snippet = `location.href='${origin}/login?token='+encodeURIComponent(localStorage.getItem('nothingAuth_account-app-web_accessToken')||sessionStorage.getItem('nothingAuth_account-app-web_accessToken')||'')+'&refresh='+encodeURIComponent(localStorage.getItem('nothingAuth_account-app-web_refreshToken')||'');`;
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-nothing-red/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-nothing-dark border border-nothing-border rounded-3xl p-8 relative z-10 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-nothing-red flex items-center justify-center mb-4 shadow-lg shadow-nothing-red/20">
            <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
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
                  Your desktop browser is now signed into your Nothing Account. You can close this tab or open your dashboard below.
                </p>
                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-white text-black font-dot uppercase tracking-wider py-3 rounded-xl text-xs hover:bg-nothing-red hover:text-white transition-all"
                >
                  OPEN DASHBOARD ON PHONE
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-3">
                  <div className="flex items-center gap-2.5 text-nothing-red text-xs font-mono uppercase tracking-wider">
                    <Smartphone className="w-4 h-4" />
                    <span>MOBILE SIGN-IN APPROVAL</span>
                  </div>
                  <p className="text-xs text-nothing-gray leading-relaxed">
                    You scanned a QR code to authorize Essential Space Web on another device.
                  </p>

                  {savedAccount && (
                    <div className="pt-2 space-y-3">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                        <div className="truncate">
                          <div className="text-[11px] font-mono text-nothing-gray uppercase">
                            Active Account:
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
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          /* Mode Switcher Tabs */
          <div className="grid grid-cols-3 gap-1 p-1 bg-black/60 border border-nothing-border rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('connect');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'connect'
                  ? 'bg-nothing-red text-white shadow'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>CONNECT</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('qr');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'qr'
                  ? 'bg-nothing-red text-white shadow'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR CODE</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('token');
                setError(null);
              }}
              className={`py-2 px-2 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'token'
                  ? 'bg-nothing-red text-white shadow'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>TOKEN</span>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-nothing-red/10 border border-nothing-red/30 text-nothing-red text-xs font-mono">
            [ERROR]: {error}
          </div>
        )}

        {/* TAB 1: OFFICIAL NOTHING ACCOUNT CONNECT (BYPASSES CLOUDFLARE BOT_CHECK_MISSING) */}
        {!scannedQrId && activeTab === 'connect' && (
          <div className="space-y-4">
            {/* Step 1: Official Sign-In */}
            <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-nothing-red tracking-wider">
                  STEP 1 • SIGN IN ON OFFICIAL PORTAL
                </span>
                <span className="text-[10px] font-mono text-nothing-gray">Cloudflare + 2FA</span>
              </div>
              <p className="text-xs text-nothing-gray leading-relaxed">
                Sign in with your Email, Password &amp; 2FA code (or Google) on the official Nothing portal:
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

            {/* Step 2: 1-Click Sync Bridge */}
            <div className="p-4 bg-black/50 border border-nothing-border rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase text-green-400 tracking-wider">
                  STEP 2 • SYNC SESSION IN 1 CLICK
                </span>
              </div>

              <p className="text-xs text-nothing-gray leading-relaxed">
                Once signed in on <code className="text-white">account.nothing.tech</code>, transfer your active session here using either method below:
              </p>

              {/* Option A: Copy 1-Line Console Command */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-nothing-gray uppercase">
                  Option A — Paste 1 line in Console (F12 → Console) on account.nothing.tech:
                </div>
                <button
                  type="button"
                  onClick={copyQuickBridgeSnippet}
                  className="w-full py-3 px-3 rounded-xl bg-nothing-red hover:bg-white hover:text-black text-white font-dot uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-nothing-red/20"
                >
                  {copiedSnippet ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>COPIED! PASTE IN NOTHING.TECH CONSOLE (F12)</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4" />
                      <span>COPY 1-CLICK CONSOLE SYNC COMMAND</span>
                    </>
                  )}
                </button>
              </div>

              {/* Option B: Drag Bookmarklet */}
              <div className="pt-2 border-t border-nothing-border/50 space-y-1.5">
                <div className="text-[10px] font-mono text-nothing-gray uppercase">
                  Option B — Or drag this button to your Bookmarks Bar &amp; click it on account.nothing.tech:
                </div>
                <div className="flex justify-center pt-1">
                  <a
                    ref={bookmarkletRef}
                    onClick={e => {
                      e.preventDefault();
                      copyQuickBridgeSnippet();
                    }}
                    title="Drag me to your Bookmarks Bar, then click me while on account.nothing.tech"
                    className="w-full py-2.5 px-4 rounded-xl bg-nothing-card hover:bg-nothing-hover border border-dashed border-nothing-gray/50 text-xs font-mono text-white flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-nothing-red" />
                    <span>⚡ Sync Nothing Space (Drag to Bookmarks)</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QR CODE MOBILE HANDOFF */}
        {!scannedQrId && activeTab === 'qr' && (
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
                  Point your Nothing Phone camera at this QR code and tap{' '}
                  <span className="text-white">&quot;Approve Desktop Sign-In&quot;</span>.
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

        {/* TAB 3: DIRECT ACCESS TOKEN / REFRESH TOKEN */}
        {(scannedQrId && !savedAccount && !qrApprovedSuccess) ||
        (!scannedQrId && activeTab === 'token') ? (
          <form onSubmit={handleTokenLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-nothing-gray mb-1.5">
                PASTE ACCESS TOKEN OR REFRESH TOKEN
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-nothing-gray absolute left-3.5 top-3.5 pointer-events-none" />
                <textarea
                  rows={4}
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
                  required
                  className="w-full bg-black border border-nothing-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono break-all"
                />
              </div>
              <p className="text-[10px] font-mono text-nothing-gray mt-1.5 leading-relaxed">
                From <code className="text-white">account.nothing.tech</code> DevTools → Application → Local Storage, copy <code className="text-white">nothingAuth_account-app-web_accessToken</code> (or <code className="text-white">nothingAuth_account-app-web_refreshToken</code>).
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-dot uppercase tracking-wider py-3.5 rounded-xl hover:bg-nothing-red hover:text-white transition-all duration-200 flex items-center justify-center gap-2 font-medium disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>VERIFYING TOKEN &amp; SYNCING...</span>
                </>
              ) : (
                <>
                  <span>SYNC WITH TOKEN</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : null}

        {/* Footer Info */}
        <div className="mt-6 pt-5 border-t border-nothing-border flex items-start gap-2.5 text-xs text-nothing-gray">
          <ShieldCheck className="w-4 h-4 text-nothing-red shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            Because <span className="text-white">account.nothing.tech</span> enforces domain-locked Cloudflare Turnstile (<code className="text-white">bot_check_missing</code>), signing in on the official portal and linking via Step 2 keeps your session &amp; <span className="text-white">refreshToken</span> active for 30 days.
          </p>
        </div>
      </div>
    </div>
  );
}
