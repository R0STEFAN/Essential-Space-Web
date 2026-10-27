'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, LogOut, Trash2, Layers, Mic, CheckSquare, Bookmark, FileText, Image as ImageIcon } from 'lucide-react';

interface NavbarProps {
  userEmail: string;
  isSyncing: boolean;
  activeType: string;
  isTrash: boolean;
  onSync: () => void;
  onSelectType: (type: string) => void;
  onToggleTrash: () => void;
  onLogout: () => void;
}

export default function Navbar({
  userEmail,
  isSyncing,
  activeType,
  isTrash,
  onSync,
  onSelectType,
  onToggleTrash,
  onLogout,
}: NavbarProps) {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: '', label: 'ALL', icon: Layers },
    { id: 'IMAGE', label: 'CAPTURES', icon: ImageIcon },
    { id: 'AUDIO', label: 'VOICE', icon: Mic },
    { id: 'TODO', label: 'TASKS', icon: CheckSquare },
    { id: 'LINK', label: 'LINKS', icon: Bookmark },
    { id: 'TEXT', label: 'NOTES', icon: FileText },
  ];

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

        {/* Navigation Categories */}
        <nav className="hidden md:flex items-center gap-1 bg-nothing-card p-1 rounded-full border border-nothing-border">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = !isTrash && activeType === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isTrash) onToggleTrash();
                  onSelectType(item.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-dot transition-all ${
                  isActive
                    ? 'bg-white text-black font-medium shadow-sm'
                    : 'text-nothing-gray hover:text-white'
                }`}
              >
                <Icon size={12} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="w-[1px] h-4 bg-nothing-border mx-1" />

          {/* Trash Toggle */}
          <button
            onClick={onToggleTrash}
            title="Bin / Trash"
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-dot transition-all ${
              isTrash
                ? 'bg-nothing-red text-white'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <Trash2 size={12} />
            <span>BIN</span>
          </button>
        </nav>

        {/* Right Section: Clock, Sync & User */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Digital Clock */}
          {time && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-nothing-card border border-nothing-border text-nothing-light font-mono text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-nothing-red" />
              <span>{time}</span>
            </div>
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

          {/* User Profile & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-nothing-border">
            <span className="text-nothing-gray text-xs truncate max-w-[120px] sm:max-w-[180px] hidden sm:inline">
              {userEmail}
            </span>
            <button
              onClick={onLogout}
              title="Logout"
              className="p-1.5 rounded-lg text-nothing-gray hover:text-nothing-red hover:bg-nothing-hover transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
