'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, X, KeyRound } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FilterBar, { type TagCount } from '@/components/FilterBar';
import CardGrid from '@/components/CardGrid';
import type { Card, Collection } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [activeType, setActiveType] = useState('');
  const [activeCollection, setActiveCollection] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTrash, setIsTrash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeType) params.set('type', activeType);
      if (activeCollection) params.set('collectionId', activeCollection);
      if (activeTag) params.set('tag', activeTag);
      if (searchQuery) params.set('query', searchQuery);
      if (isTrash) params.set('trash', 'true');

      const res = await fetch(`/api/cards?${params.toString()}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
        setCollections(data.collections);
        setTags(data.tags || []);
        setUserEmail(data.user?.email || 'user@nothing.tech');
      }
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeType, activeCollection, activeTag, searchQuery, isTrash, router]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleSync = useCallback(
    async (silent = false) => {
      setIsSyncing(true);
      if (!silent) {
        setSyncError(null);
        setSyncSuccess(null);
      }
      try {
        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401 || data.authExpired) {
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          router.push('/login?expired=1');
          router.refresh();
          return;
        }

        if (res.ok && data.success) {
          await fetchCards();
          if (!silent) {
            setSyncSuccess(`Synced ${data.cardsCount} notes from Nothing Cloud`);
            setTimeout(() => setSyncSuccess(null), 4000);
          }
        } else if (!silent) {
          setSyncError(
            data.error ||
              'Cloud sync failed. Your Nothing Account session token may need to be refreshed.'
          );
        }
      } catch (err: any) {
        console.error('Sync failed:', err);
        if (!silent) {
          setSyncError(err?.message || 'Network error while syncing with Nothing Cloud');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [fetchCards, router]
  );

  // Validate active Nothing token & auto-sync on initial dashboard mount
  useEffect(() => {
    handleSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleTodo = async (cardId: string, eventId: string) => {
    // Optimistic update
    setCards(prev =>
      prev.map(c => {
        if (c.cardId === cardId && c.events) {
          return {
            ...c,
            events: c.events.map(e =>
              e.eventId === eventId ? { ...e, check: e.check === 1 ? 0 : 1 } : e
            ),
          };
        }
        return c;
      })
    );

    try {
      await fetch(`/api/cards/${cardId}/toggle-todo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
    } catch (err) {
      console.error('Failed to toggle todo:', err);
      fetchCards();
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar
        userEmail={userEmail}
        isSyncing={isSyncing}
        activeType={activeType}
        isTrash={isTrash}
        onSync={() => handleSync(false)}
        onSelectType={type => {
          setActiveType(type);
          setActiveCollection('');
        }}
        onToggleTrash={() => setIsTrash(!isTrash)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Sync Status Banners */}
        {syncError && (
          <div className="mb-5 p-3.5 rounded-2xl bg-nothing-red/10 border border-nothing-red/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs font-mono text-nothing-red">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{syncError}</span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="px-3 py-1.5 rounded-lg bg-nothing-red text-white text-xs font-dot uppercase tracking-wider hover:bg-white hover:text-black transition-colors flex items-center gap-1.5"
              >
                <KeyRound size={12} />
                <span>Update Token / Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => setSyncError(null)}
                className="p-1 text-nothing-gray hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {syncSuccess && (
          <div className="mb-5 p-3 rounded-2xl bg-green-950/30 border border-green-500/40 flex items-center justify-between text-xs font-mono text-green-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} />
              <span>{syncSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncSuccess(null)}
              className="p-1 text-green-400/70 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          collections={collections}
          activeCollection={activeCollection}
          onSelectCollection={setActiveCollection}
          tags={tags}
          activeTag={activeTag}
          onSelectTag={setActiveTag}
        />

        <div className="mb-4 flex items-center justify-between text-xs font-mono text-nothing-gray">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-dot">
              {isTrash ? 'BIN / TRASH' : activeType ? `${activeType} CARDS` : 'ALL NOTES'}
            </span>
            {activeTag && (
              <>
                <span className="text-nothing-border">•</span>
                <span className="px-2 py-0.5 rounded-full bg-nothing-red/20 border border-nothing-red/40 text-nothing-red inline-flex items-center gap-1">
                  #{activeTag}
                  <button
                    type="button"
                    onClick={() => setActiveTag('')}
                    className="hover:text-white ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              </>
            )}
            <span className="text-nothing-border">•</span>
            <span>{cards.length} items</span>
          </div>

          {cards.length > 0 && (
            <span className="text-[11px] text-nothing-gray/70 hidden sm:inline">
              Sorted by date (latest first)
            </span>
          )}
        </div>

        <CardGrid
          cards={cards}
          isLoading={isLoading}
          onToggleTodo={handleToggleTodo}
          activeTag={activeTag}
          onSelectTag={setActiveTag}
        />
      </main>
    </div>
  );
}
