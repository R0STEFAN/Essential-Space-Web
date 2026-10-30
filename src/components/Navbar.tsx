'use client';

import { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  LogOut,
  Sparkles,
  Layers,
  Plus,
  Globe,
  ChevronDown,
  Search,
  X,
  Check,
  User as UserIcon,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  getLanguageOption,
  type LanguageOption,
} from '@/lib/languages';

interface NavbarProps {
  userEmail: string;
  isSyncing: boolean;
  activeTab: 'foryou' | 'library';
  onSelectTab: (tab: 'foryou' | 'library') => void;
  onSync: () => void;
  onLogout: () => void;
  onOpenCreateNote?: () => void;
  currentLanguage?: string;
  onSelectLanguage?: (langCode: string) => void;
}

export default function Navbar({
  userEmail,
  isSyncing,
  activeTab,
  onSelectTab,
  onSync,
  onLogout,
  onOpenCreateNote,
  currentLanguage = 'uk',
  onSelectLanguage,
}: NavbarProps) {
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const selectedLang = getLanguageOption(currentLanguage);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsLangOpen(false);
        setIsAccountOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter languages for search
  const filteredLanguages = SUPPORTED_LANGUAGES.filter(lang => {
    if (!langSearch.trim()) return true;
    const q = langSearch.toLowerCase().trim();
    return (
      lang.name.toLowerCase().includes(q) ||
      lang.nativeName.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q)
    );
  });

  const userInitial = userEmail ? userEmail.trim()[0]?.toUpperCase() : 'U';

  return (
    <header className="border-b border-nothing-border bg-black/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Essential Space Icon" className="w-7 h-7" />
          <div className="flex flex-col">
            <span className="font-dot text-sm tracking-wider font-semibold text-white">
              ESSENTIAL SPACE // WEB
            </span>
            <span className="text-[10px] font-mono text-nothing-gray hidden sm:inline">
              NOTHING OS SYNC SERVICE
            </span>
          </div>
        </div>

        {/* Tab Switcher: For You / Library */}
        <nav className="flex items-center gap-1 bg-nothing-card/90 p-1 rounded-full border border-nothing-border shadow-inner">
          <button
            onClick={() => onSelectTab('foryou')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-dot tracking-wider transition-all duration-200 select-none ${
              activeTab === 'foryou'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white hover:bg-nothing-hover/30'
            }`}
          >
            <Sparkles size={13} className={activeTab === 'foryou' ? 'text-nothing-red' : ''} />
            <span>FOR YOU</span>
          </button>

          <button
            onClick={() => onSelectTab('library')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-dot tracking-wider transition-all duration-200 select-none ${
              activeTab === 'library'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white hover:bg-nothing-hover/30'
            }`}
          >
            <Layers size={13} />
            <span>LIBRARY</span>
          </button>
        </nav>

        {/* Right Section: Language Dropdown, Capture, Sync, Account Avatar */}
        <div className="flex items-center gap-2 sm:gap-2.5 font-mono text-xs">
          {/* Language Dropdown with Search (Replaces former session timer) */}
          <div className="relative" ref={langRef}>
            <button
              type="button"
              onClick={() => {
                setIsLangOpen(prev => !prev);
                setIsAccountOpen(false);
              }}
              title="Default AI Summary & Transcription Language"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all select-none ${
                isLangOpen
                  ? 'bg-white text-black border-white font-semibold'
                  : 'bg-nothing-card hover:bg-nothing-hover border-nothing-border text-nothing-light hover:text-white hover:border-white/30'
              }`}
            >
              <Globe size={13} className={isLangOpen ? 'text-nothing-red' : 'text-nothing-red'} />
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                {selectedLang.code === 'auto' ? 'AUTO' : selectedLang.code.toUpperCase()}
              </span>
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 opacity-60 ${
                  isLangOpen ? 'rotate-180 opacity-100' : ''
                }`}
              />
            </button>

            {/* Language Popover Menu */}
            {isLangOpen && (
              <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-[#141414]/95 border border-white/20 shadow-2xl p-2.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 pt-1 pb-2 border-b border-nothing-border/50">
                  <span className="font-dot text-[10px] text-nothing-gray uppercase tracking-wider block">
                    AI SUMMARY & TRANSCRIPT LANGUAGE
                  </span>
                  <span className="text-[11px] font-mono text-nothing-light">
                    Default language for all AI insights
                  </span>
                </div>

                {/* Search Input */}
                <div className="relative my-2 px-1">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nothing-gray" />
                  <input
                    type="text"
                    autoFocus
                    value={langSearch}
                    onChange={e => setLangSearch(e.target.value)}
                    placeholder="Search language..."
                    className="w-full bg-black/80 border border-nothing-border rounded-xl pl-8 pr-7 py-1.5 text-xs font-mono text-white placeholder-nothing-gray focus:outline-none focus:border-white/40 transition-colors"
                  />
                  {langSearch && (
                    <button
                      type="button"
                      onClick={() => setLangSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-nothing-gray hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Languages List */}
                <div className="max-h-60 overflow-y-auto scrollbar-thin space-y-0.5 pr-0.5">
                  {filteredLanguages.map(item => {
                    const isSelected = item.code.toLowerCase() === currentLanguage.toLowerCase();
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          onSelectLanguage?.(item.code);
                          setIsLangOpen(false);
                          setLangSearch('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-all text-left group ${
                          isSelected
                            ? 'bg-white text-black font-semibold shadow-sm'
                            : 'text-nothing-light hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">
                            {item.nativeName}
                            {item.nativeName !== item.name && (
                              <span
                                className={`text-[11px] ml-1.5 ${
                                  isSelected ? 'text-black/60 font-normal' : 'text-nothing-gray'
                                }`}
                              >
                                ({item.name})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                              isSelected
                                ? 'bg-black/10 text-black font-bold'
                                : 'bg-black/50 text-nothing-gray border border-nothing-border/60'
                            }`}
                          >
                            {item.code}
                          </span>
                          {isSelected && <Check size={13} strokeWidth={2.5} className="text-nothing-red shrink-0" />}
                        </div>
                      </button>
                    );
                  })}

                  {filteredLanguages.length === 0 && (
                    <div className="p-4 text-center text-xs font-mono text-nothing-gray">
                      No language found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Create Capture Button */}
          {onOpenCreateNote && (
            <button
              onClick={onOpenCreateNote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nothing-red hover:bg-nothing-red/80 text-white font-dot text-xs tracking-wider transition-all shadow-md shadow-nothing-red/20 active:scale-95"
            >
              <Plus size={13} strokeWidth={3} />
              <span className="hidden sm:inline">CAPTURE</span>
            </button>
          )}

          {/* Sync Button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nothing-card hover:bg-nothing-hover border border-nothing-border text-nothing-light transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin text-nothing-red' : ''} />
            <span className="font-dot text-[11px] hidden sm:inline">
              {isSyncing ? 'SYNCING...' : 'SYNC'}
            </span>
          </button>

          {/* Abstract Circular Account Avatar & Profile Popup */}
          <div className="relative pl-1 border-l border-nothing-border" ref={accountRef}>
            <button
              type="button"
              onClick={() => {
                setIsAccountOpen(prev => !prev);
                setIsLangOpen(false);
              }}
              title={userEmail ? `Account: ${userEmail}` : 'Account Settings'}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all relative select-none shadow-sm ${
                isAccountOpen
                  ? 'bg-white text-black border-white shadow-md scale-105'
                  : 'bg-nothing-card hover:bg-white/10 border-nothing-border/80 hover:border-white/40 text-white'
              }`}
            >
              {userEmail ? (
                <span className="font-dot text-xs font-bold leading-none">{userInitial}</span>
              ) : (
                <UserIcon size={14} />
              )}
              {/* Online indicator dot */}
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-black" />
            </button>

            {/* Account Popup */}
            {isAccountOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-[#141414]/95 border border-white/20 shadow-2xl p-4 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                {/* Large Abstract Account Avatar */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-[#1A1A1A] border border-white/25 text-white font-dot text-2xl flex items-center justify-center shadow-inner mb-2.5">
                    {userInitial}
                  </div>

                  <span className="font-dot text-[10px] text-nothing-red uppercase tracking-widest font-semibold">
                    NOTHING ACCOUNT
                  </span>

                  <p className="font-mono text-xs text-white break-all max-w-full px-2 mt-1 select-all font-medium">
                    {userEmail || 'Active User'}
                  </p>

                  <div className="flex items-center gap-1.5 mt-2 text-[11px] font-mono text-nothing-gray">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Connected to Nothing Cloud</span>
                  </div>
                </div>

                <div className="h-[1px] bg-nothing-border/60 my-3.5" />

                {/* Log Out Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountOpen(false);
                    onLogout();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-nothing-red/10 hover:bg-nothing-red text-nothing-red hover:text-white border border-nothing-red/30 hover:border-nothing-red transition-all font-mono text-xs flex items-center justify-center gap-2 group cursor-pointer shadow-sm font-medium"
                >
                  <LogOut size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  <span>Sign Out / Вийти</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
