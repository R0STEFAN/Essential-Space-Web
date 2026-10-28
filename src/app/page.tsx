'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, X, KeyRound, CheckSquare } from 'lucide-react';
import Navbar from '@/components/Navbar';
import FilterBar, { type TagCount } from '@/components/FilterBar';
import CardGrid from '@/components/CardGrid';
import FloatingFilterDock from '@/components/FloatingFilterDock';
import ForYouTab from '@/components/ForYouTab';
import CardDetailModal from '@/components/CardDetailModal';
import CreateNoteModal from '@/components/CreateNoteModal';
import CollectionModal from '@/components/CollectionModal';
import BulkActionBar from '@/components/BulkActionBar';
import SelectCollectionModal from '@/components/SelectCollectionModal';
import { saveDbCards, saveDbCollections, saveDbAuth, getDbCards, getDbCollections, getDbAuth } from '@/lib/db';
import type { Card, Collection } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'foryou' | 'library'>('foryou');
  const [cards, setCards] = useState<Card[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [userToken, setUserToken] = useState('');
  const [userId, setUserId] = useState('');
  const [activeType, setActiveType] = useState('');
  const [activeCollection, setActiveCollection] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTrash, setIsTrash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<Card | null>(null);

  // Modal states for Capture & Collection CRUD
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [collectionModalState, setCollectionModalState] = useState<{
    isOpen: boolean;
    mode: 'CREATE' | 'EDIT';
    collection?: Collection | null;
  }>({ isOpen: false, mode: 'CREATE' });

  // Multi-select & Bulk actions state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isSelectCollectionModalOpen, setIsSelectCollectionModalOpen] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Initial Local-First load from IndexedDB
  useEffect(() => {
    async function loadLocalData() {
      try {
        const localAuth = await getDbAuth();
        if (localAuth) {
          setUserEmail(localAuth.email);
          if (localAuth.token) setUserToken(localAuth.token);
          if (localAuth.uuid) setUserId(localAuth.uuid);
        }

        const localCards = await getDbCards();
        const localCollections = await getDbCollections();
        if (localCards.length > 0) {
          setCards(localCards);
          setCollections(localCollections);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Local IndexedDB load notice:', err);
      }
    }
    loadLocalData();
  }, []);

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
        window.location.href = '/login';
        return;
      }

      const data = await res.json();
      if (data.success) {
        setCards(data.cards);
        setCollections(data.collections);
        setTags(data.tags || []);
        setUserEmail(data.user?.email || 'user@nothing.tech');
        if (data.user?.token) setUserToken(data.user.token);
        if (data.user?.uuid) setUserId(data.user.uuid);

        // Sync into local-first IndexedDB
        saveDbCards(data.cards);
        saveDbCollections(data.collections);
        if (data.user) saveDbAuth(data.user);
      }
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeType, activeCollection, activeTag, searchQuery, isTrash]);

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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch('/api/sync', { 
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await res.json().catch(() => ({}));

        if (res.status === 401 || data.authExpired) {
          try {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          } finally {
            window.location.href = '/login?expired=1';
          }
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
        clearTimeout(timeoutId);
        console.error('Sync failed:', err);
        if (!silent) {
          if (err?.name === 'AbortError') {
            setSyncError('Синхронізація зайняла більше 30 секунд. Відображаються локальні дані.');
          } else {
            setSyncError(err?.message || 'Network error while syncing with Nothing Cloud');
          }
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [fetchCards]
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

  const handleToggleSelect = (cardId: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      if (next.size > 0 && !isSelectMode) {
        setIsSelectMode(true);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCardIds.size === cards.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(cards.map(c => c.cardId)));
    }
  };

  const handleClearSelection = () => {
    setSelectedCardIds(new Set());
    setIsSelectMode(false);
  };

  const handleBulkDelete = async () => {
    if (selectedCardIds.size === 0) return;
    const ids = Array.from(selectedCardIds);
    if (isTrash) {
      if (
        !window.confirm(
          `Permanently delete ${ids.length} ${
            ids.length === 1 ? 'note' : 'notes'
          }? This action cannot be undone.`
        )
      ) {
        return;
      }
    }
    setIsBulkProcessing(true);
    try {
      // Optimistic local update
      setCards(prev => prev.filter(c => !selectedCardIds.has(c.cardId)));
      const action = isTrash ? 'PERMANENT_DELETE' : 'DELETE';
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, cardIds: ids }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSuccess(
          isTrash
            ? `Permanently deleted: ${ids.length}`
            : `Moved to trash: ${ids.length}`
        );
        setTimeout(() => setSyncSuccess(null), 3000);
      }
      handleClearSelection();
      fetchCards();
    } catch (err) {
      console.error('Failed bulk delete:', err);
      fetchCards();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedCardIds.size === 0) return;
    const ids = Array.from(selectedCardIds);
    setIsBulkProcessing(true);
    try {
      setCards(prev => prev.filter(c => !selectedCardIds.has(c.cardId)));
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESTORE', cardIds: ids }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSuccess(`Restored from trash: ${ids.length}`);
        setTimeout(() => setSyncSuccess(null), 3000);
      }
      handleClearSelection();
      fetchCards();
    } catch (err) {
      console.error('Failed bulk restore:', err);
      fetchCards();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkAssignCollection = async (
    collectionId: string | null,
    collectionName?: string
  ) => {
    if (selectedCardIds.size === 0) return;
    const ids = Array.from(selectedCardIds);
    setIsBulkProcessing(true);
    try {
      setCards(prev =>
        prev.map(c => {
          if (selectedCardIds.has(c.cardId)) {
            return {
              ...c,
              collectionId: collectionId || undefined,
              collectionName: collectionId ? collectionName : undefined,
            };
          }
          return c;
        })
      );
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ASSIGN_COLLECTION',
          cardIds: ids,
          collectionId,
          collectionName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSuccess(
          collectionId
            ? `Added to "${collectionName}": ${ids.length}`
            : `Removed from collection: ${ids.length}`
        );
        setTimeout(() => setSyncSuccess(null), 3000);
      }
      handleClearSelection();
      fetchCards();
    } catch (err) {
      console.error('Failed bulk assign collection:', err);
      fetchCards();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar
        userEmail={userEmail}
        isSyncing={isSyncing}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSync={() => handleSync(false)}
        onLogout={handleLogout}
        onOpenCreateNote={() => setIsCreateNoteOpen(true)}
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

        {/* Conditional Tab Rendering */}
        {activeTab === 'foryou' ? (
          <ForYouTab
            cards={cards}
            collections={collections}
            onToggleTodo={handleToggleTodo}
            onRefreshData={fetchCards}
            onOpenCardDetail={card => setModalCard(card)}
            onNavigateToCollection={collId => {
              setActiveCollection(collId);
              setActiveTab('library');
            }}
          />
        ) : (
          <div>
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              collections={collections}
              activeCollection={activeCollection}
              onSelectCollection={setActiveCollection}
              tags={tags}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              onOpenCreateCollection={() =>
                setCollectionModalState({ isOpen: true, mode: 'CREATE' })
              }
              onOpenEditCollection={col =>
                setCollectionModalState({ isOpen: true, mode: 'EDIT', collection: col })
              }
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

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isSelectMode) {
                      handleClearSelection();
                    } else {
                      setIsSelectMode(true);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl border font-mono text-xs flex items-center gap-1.5 transition-all ${
                    isSelectMode
                      ? 'bg-nothing-red text-white border-nothing-red shadow-sm'
                      : 'bg-[#181818] border-nothing-border text-nothing-light hover:text-white hover:border-nothing-gray/60'
                  }`}
                >
                  <CheckSquare size={13} />
                  <span>{isSelectMode ? 'Cancel' : 'Select'}</span>
                </button>

                {cards.length > 0 && (
                  <span className="text-[11px] text-nothing-gray/70 hidden sm:inline">
                    Sorted by date (latest first)
                  </span>
                )}
              </div>
            </div>

            <CardGrid
              cards={cards}
              isLoading={isLoading}
              onToggleTodo={handleToggleTodo}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              isSelectMode={isSelectMode}
              selectedCardIds={selectedCardIds}
              onToggleSelect={handleToggleSelect}
            />

            {/* Bulk Actions Floating Dock */}
            <BulkActionBar
              selectedCount={selectedCardIds.size}
              totalCount={cards.length}
              isAllSelected={cards.length > 0 && selectedCardIds.size === cards.length}
              isTrash={isTrash}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onOpenAssignCollection={() => setIsSelectCollectionModalOpen(true)}
              onDeleteSelected={handleBulkDelete}
              onRestoreSelected={isTrash ? handleBulkRestore : undefined}
              isProcessing={isBulkProcessing}
            />

            {/* Modal for selecting collection for bulk action */}
            <SelectCollectionModal
              isOpen={isSelectCollectionModalOpen}
              onClose={() => setIsSelectCollectionModalOpen(false)}
              collections={collections}
              selectedCardCount={selectedCardIds.size}
              onAssign={handleBulkAssignCollection}
              onOpenCreateCollection={() => {
                setCollectionModalState({ isOpen: true, mode: 'CREATE' });
              }}
            />

            {/* Floating Bottom Filter Dock - ONLY visible on Library tab when not in select mode */}
            {!isSelectMode && (
              <FloatingFilterDock
                activeType={activeType}
                isTrash={isTrash}
                onSelectType={type => {
                  setActiveType(type);
                  setActiveCollection('');
                }}
                onToggleTrash={() => setIsTrash(!isTrash)}
              />
            )}
          </div>
        )}

        {/* Modal for card detail if clicked from For You */}
        {modalCard && (
          <CardDetailModal
            card={modalCard}
            onClose={() => setModalCard(null)}
            onToggleTodo={handleToggleTodo}
          />
        )}

        {/* Modal for creating a new Note / Link / Photo / Voice memo */}
        <CreateNoteModal
          isOpen={isCreateNoteOpen}
          onClose={() => setIsCreateNoteOpen(false)}
          collections={collections}
          activeCollectionId={activeCollection}
          token={userToken}
          userId={userId}
          onCardCreated={newCard => {
            setCards(prev => [newCard, ...prev]);
            fetchCards();
          }}
        />

        {/* Modal for creating / editing collections */}
        <CollectionModal
          isOpen={collectionModalState.isOpen}
          onClose={() => setCollectionModalState({ isOpen: false, mode: 'CREATE' })}
          mode={collectionModalState.mode}
          collection={collectionModalState.collection}
          token={userToken}
          userId={userId}
          onCollectionSaved={savedCol => {
            setCollections(prev => {
              const idx = prev.findIndex(c => c.collectionId === savedCol.collectionId);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], ...savedCol };
                return updated;
              }
              return [...prev, savedCol];
            });
            fetchCards();
          }}
          onCollectionDeleted={deletedId => {
            setCollections(prev => prev.filter(c => c.collectionId !== deletedId));
            if (activeCollection === deletedId) setActiveCollection('');
            fetchCards();
          }}
        />
      </main>
    </div>
  );
}
