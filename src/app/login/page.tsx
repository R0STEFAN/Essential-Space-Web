'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Key,
  ArrowRight,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Terminal,
  Bookmark,
  UserCheck,
} from 'lucide-react';
import { parseNothingJwt } from '@/lib/crypto';
import { saveDbAuth, getDbAuth, clearDbAuth } from '@/lib/db';
import { syncNothingCloud } from '@/lib/sync-engine';
import type { NothingUser } from '@/types';

type LoginTab = 'token' | 'bridge';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LoginTab>('token');

  // Direct Token state
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Saved local session
  const [savedAccount, setSavedAccount] = useState<{ email: string; userName?: string } | null>(
    null
  );

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Robust clipboard copy
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

  const handleTokenSubmit = async (tokenStr: string, refreshStr?: string) => {
    let cleanToken = tokenStr.trim().replace(/^["']|["']$/g, '');
    if (cleanToken.toLowerCase().startsWith('bearer ')) {
      cleanToken = cleanToken.slice(7).trim();
    }
    let cleanRefresh = (refreshStr || '').trim().replace(/^["']|["']$/g, '');

    // Support JSON format e.g. {"accessToken": "...", "refreshToken": "..."}
    if (cleanToken.startsWith('{') && cleanToken.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanToken);
        if (parsed.token || parsed.accessToken) cleanToken = (parsed.token || parsed.accessToken).trim();
        if (parsed.refreshToken) cleanRefresh = parsed.refreshToken.trim();
      } catch {}
    }

    if (!cleanToken) {
      setError('Please provide a Nothing Account access token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profile = parseNothingJwt(cleanToken);
      const user: NothingUser = {
        uuid: profile?.uuid || `nt_user_${Date.now()}`,
        email: profile?.email || 'user@nothing.tech',
        userName: profile?.userName || 'Nothing User',
        token: cleanToken,
        refreshToken: cleanRefresh || undefined,
      };

      // Perform real sync to verify token validity against Nothing Cloud
      await syncNothingCloud(user);
      await saveDbAuth(user);

      // Redirect to dashboard
      window.location.href = '/';
    } catch (err: any) {
      console.error('Authentication or sync failed:', err);
      const msg = err?.message || String(err);
      if (msg.includes('AUTH_EXPIRED') || msg.includes('401') || msg.includes('403')) {
        setError('Token is invalid or expired. Please refresh your token at account.nothing.tech.');
      } else {
        setError(`Unable to connect: ${msg}`);
      }
      setLoading(false);
    }
  };

  // Check saved session & URL params on mount
  useEffect(() => {
    async function checkSaved() {
      const saved = await getDbAuth();
      if (saved && saved.token) {
        setSavedAccount({
          email: saved.email,
          userName: saved.userName,
        });
      }
    }
    checkSaved();

    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlRefresh = params.get('refresh');
    if (params.get('expired') === '1') {
      setError('Your Nothing Account session expired or was invalidated. Please sign in again.');
      window.history.replaceState({}, '', '/login');
    } else if (urlToken) {
      window.history.replaceState({}, '', '/login');
      handleTokenSubmit(urlToken, urlRefresh || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleTokenSubmit(token, refreshToken);
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
            LOCAL-FIRST CLOUD SYNC
          </p>
        </div>

        {/* Existing Active Session Banner */}
        {savedAccount && (
          <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-green-400 uppercase tracking-wider">
                <UserCheck className="w-4 h-4" />
                <span>SAVED SESSION</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await clearDbAuth();
                  setSavedAccount(null);
                }}
                className="text-[10px] font-mono text-nothing-gray hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
            <div className="text-sm font-medium text-white truncate">
              {savedAccount.email}
            </div>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full bg-white text-black font-dot uppercase tracking-wider py-2.5 rounded-xl text-xs hover:bg-nothing-red hover:text-white transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span>CONTINUE TO DASHBOARD</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-black/60 border border-nothing-border rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('token');
              setError(null);
            }}
            className={`py-2 px-1 rounded-lg text-xs font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
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
              setActiveTab('bridge');
              setError(null);
            }}
            className={`py-2 px-1 rounded-lg text-xs font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'bridge'
                ? 'bg-nothing-red text-white shadow'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span>1-CLICK SYNC</span>
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-nothing-red/10 border border-nothing-red/30 text-nothing-red text-xs font-mono">
            [ERROR]: {error}
          </div>
        )}

        {/* TAB 1: DIRECT TOKEN */}
        {activeTab === 'token' && (
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono uppercase text-nothing-gray">
                  ACCESS TOKEN (JWT)
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
                  placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
                  required
                  className="w-full bg-black border border-nothing-border rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-nothing-gray/40 focus:outline-none focus:border-white transition-colors font-mono break-all"
                />
              </div>
            </div>

            {/* Optional Refresh Token */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedToken(!showAdvancedToken)}
                className="text-[11px] font-mono text-nothing-gray hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <span>{showAdvancedToken ? '▾ Hide Refresh Token' : '▸ + Add Refresh Token (optional)'}</span>
              </button>

              {showAdvancedToken && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono uppercase text-nothing-gray">
                      REFRESH TOKEN
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
                <span>How to get your token:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[10px] text-nothing-gray/80 pl-1 leading-relaxed">
                <li>Sign in at <span className="text-white">account.nothing.tech</span>.</li>
                <li>Press <span className="text-white">F12</span> → <span className="text-white">Application</span> → <span className="text-white">Local Storage</span>.</li>
                <li>Copy <code className="text-white">nothingAuth_account-app-web_accessToken</code>.</li>
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
                  <span>VERIFYING &amp; SYNCING...</span>
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

        {/* TAB 2: 1-CLICK BROWSER SYNC */}
        {activeTab === 'bridge' && (
          <div className="space-y-4">
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
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-6 pt-5 border-t border-nothing-border flex items-start gap-2.5 text-xs text-nothing-gray">
          <ShieldCheck className="w-4 h-4 text-nothing-red shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            100% Client-Side Local-First. Your authentication token is saved exclusively in your browser&apos;s IndexedDB. Nothing is ever sent to third-party databases.
          </p>
        </div>
      </div>
    </div>
  );
}
