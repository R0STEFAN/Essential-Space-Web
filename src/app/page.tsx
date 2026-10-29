'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, X, KeyRound, CheckSquare, RotateCcw, Trash2 } from 'lucide-react';
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
import {
  saveDbCards,
  saveDbCollections,
  saveDbAuth,
  getDbCards,
  getDbCollections,
  getDbAuth,
  clearDbAuth,
  updateDbCard,
  deleteDbCard,
} from '@/lib/db';
import { syncNothingCloud } from '@/lib/sync-engine';
import {
  updateCloudCard,
  bulkDeleteCloudCards,
  bulkRestoreCloudCards,
  bulkHardDeleteCloudCards,
  bulkAssignCollectionCloudCards,
} from '@/lib/nothing-cards';
import type { Card, Collection } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'foryou' | 'library'>('foryou');
  const [allDbCards, setAllDbCards] = useState<Card[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
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

  // Load local data from IndexedDB
  const loadLocalData = useCallback(async () => {
    try {
      const localAuth = await getDbAuth();
      if (!localAuth || !localAuth.token) {
        router.push('/login');
        return;
      }
      setUserEmail(localAuth.email || 'user@nothing.tech');
      setUserToken(localAuth.token);
      setUserId(localAuth.uuid);

      const dbCards = await getDbCards();
      const dbCollections = await getDbCollections();
      setAllDbCards(dbCards);
      setCollections(dbCollections);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load local IndexedDB data:', err);
    }
  }, [router]);

  // Card-Collection matcher
  const cardMatchesCollection = useCallback((card: Card, col: Collection) => {
    if (card.collectionIds && card.collectionIds.includes(col.collectionId)) return true;
    if (card.collectionId && card.collectionId === col.collectionId) return true;
    if (col.name && Array.isArray(card.tags)) {
      const colNameLower = col.name.trim().toLowerCase();
      return card.tags.some(t => String(t).trim().toLowerCase() === colNameLower);
    }
    return false;
  }, []);

  // Filtered cards according to active filters
  const filteredCards = useMemo(() => {
    let result = allDbCards.filter(c => (isTrash ? c.targetState === 1 : c.targetState === 0));

    // Attach collectionName and collectionNames
    if (collections.length > 0) {
      const collMap = new Map(collections.map(col => [col.collectionId, col.name]));
      result = result.map(c => {
        const colNames = c.collectionIds
          ? c.collectionIds.map(id => collMap.get(id)).filter((n): n is string => Boolean(n))
          : [];
        return {
          ...c,
          collectionNames: colNames.length > 0 ? colNames : (c.collectionNames || []),
          collectionName:
            colNames.length > 0
              ? colNames.join(', ')
              : (c.collectionId ? collMap.get(c.collectionId) : c.collectionName),
        };
      });
    }

    if (activeCollection) {
      const selectedCol = collections.find(col => col.collectionId === activeCollection);
      result = result.filter(c =>
        selectedCol ? cardMatchesCollection(c, selectedCol) : c.collectionId === activeCollection
      );
    }

    if (activeType) {
      const upper = activeType.toUpperCase();
      if (upper === 'AUDIO') {
        result = result.filter(c => c.type === 'AUDIO' || Boolean(c.audio?.audioUri));
      } else if (upper === 'TODO') {
        result = result.filter(c => c.type === 'TODO' || Boolean(c.events && c.events.length > 0));
      } else {
        result = result.filter(c => c.type === upper);
      }
    }

    if (activeTag) {
      const tagLower = activeTag.toLowerCase();
      result = result.filter(c => c.tags?.some(t => String(t).trim().toLowerCase() === tagLower));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        const titleMatch = c.title?.toLowerCase().includes(q);
        const summaryMatch = c.summary?.toLowerCase().includes(q);
        const contentMatch = c.content?.toLowerCase().includes(q);
        const tagMatch = c.tags?.some(t => t.toLowerCase().includes(q));
        const eventMatch = c.events?.some(e => e.title?.toLowerCase().includes(q));
        return titleMatch || summaryMatch || contentMatch || tagMatch || eventMatch;
      });
    }

    // Sort by createTime descending (latest first)
    return result.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  }, [allDbCards, isTrash, collections, activeCollection, activeType, activeTag, searchQuery, cardMatchesCollection]);

  // Compute collections with dynamic cardCount
  const collectionsWithCounts = useMemo(() => {
    const activeCards = allDbCards.filter(c => c.targetState === 0);
    return collections.map(col => ({
      ...col,
      cardCount: activeCards.filter(c => cardMatchesCollection(c, col)).length,
    }));
  }, [allDbCards, collections, cardMatchesCollection]);

  // Compute tags dynamically across current active/trash view
  const computedTags = useMemo<TagCount[]>(() => {
    const pool = allDbCards.filter(c => (isTrash ? c.targetState === 1 : c.targetState === 0));
    const tagCountMap = new Map<string, { name: string; count: number }>();
    for (const c of pool) {
      if (Array.isArray(c.tags)) {
        const seenOnCard = new Set<string>();
        for (const rawTag of c.tags) {
          const clean = String(rawTag).trim();
          if (!clean) continue;
          const key = clean.toLowerCase();
          if (seenOnCard.has(key)) continue;
          seenOnCard.add(key);
          const existing = tagCountMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            tagCountMap.set(key, { name: clean, count: 1 });
          }
        }
      }
    }
    return Array.from(tagCountMap.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [allDbCards, isTrash]);

  const handleSync = useCallback(
    async (silent = false) => {
      setIsSyncing(true);
      if (!silent) {
        setSyncError(null);
        setSyncSuccess(null);
      }
      try {
        const localAuth = await getDbAuth();
        if (!localAuth || !localAuth.token) {
          router.push('/login');
          return;
        }

        const syncResult = await syncNothingCloud(localAuth);
        await loadLocalData();

        if (!silent) {
          setSyncSuccess(`Synced ${syncResult.cardsCount} notes from Nothing Cloud`);
          setTimeout(() => setSyncSuccess(null), 4000);
        }
      } catch (err: any) {
        console.error('Sync failed:', err);
        const errMsg = err?.message || String(err);
        if (errMsg.includes('AUTH_EXPIRED') || errMsg.includes('NO_TOKEN')) {
          await clearDbAuth();
          router.push('/login?expired=1');
          return;
        }
        if (!silent) {
          setSyncError(errMsg || 'Network error while syncing with Nothing Cloud');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [loadLocalData, router]
  );

  // Initial mount: load IndexedDB data then auto-sync silently
  useEffect(() => {
    async function init() {
      await loadLocalData();
      handleSync(true);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleTodo = async (cardId: string, eventId: string) => {
    // 1. Optimistic local update in allDbCards state
    setAllDbCards(prev =>
      prev.map(c => {
        if (c.cardId === cardId && c.events) {
          return {
            ...c,
            events: c.events.map(e =>
              e.eventId === eventId ? { ...e, check: e.check === 1 ? 0 : 1, isPotentialReminder: false } : e
            ),
          };
        }
        return c;
      })
    );

    // 2. Also update modalCard if currently viewing this card
    setModalCard(prev => {
      if (prev && prev.cardId === cardId && prev.events) {
        return {
          ...prev,
          events: prev.events.map(e =>
            e.eventId === eventId ? { ...e, check: e.check === 1 ? 0 : 1, isPotentialReminder: false } : e
          ),
        };
      }
      return prev;
    });

    // 3. Persist to IndexedDB & sync to Nothing Cloud
    const targetCard = allDbCards.find(c => c.cardId === cardId);
    if (targetCard && targetCard.events) {
      const updatedEvents = targetCard.events.map(e =>
        e.eventId === eventId ? { ...e, check: e.check === 1 ? 0 : 1, isPotentialReminder: false } : e
      );
      await updateDbCard(cardId, { events: updatedEvents });

      if (userToken) {
        const updatedCard = { ...targetCard, events: updatedEvents };
        updateCloudCard(userToken, updatedCard).catch(err =>
          console.warn('Background Nothing Cloud todo toggle sync failed:', err)
        );
      }
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
    if (selectedCardIds.size === filteredCards.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(filteredCards.map(c => c.cardId)));
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
      if (isTrash) {
        // Hard delete in cloud first if online
        if (userToken) {
          const res = await bulkHardDeleteCloudCards(userToken, ids);
          if (!res.success) {
            throw new Error(res.error || 'Failed to permanently delete notes from cloud');
          }
        }
        setAllDbCards(prev => prev.filter(c => !selectedCardIds.has(c.cardId)));
        for (const id of ids) {
          await deleteDbCard(id);
        }
        setSyncSuccess(`Permanently deleted: ${ids.length}`);
      } else {
        // Move to trash
        if (userToken) {
          const res = await bulkDeleteCloudCards(userToken, ids);
          if (!res.success) {
            throw new Error(res.error || 'Failed to move notes to trash in cloud');
          }
        }
        setAllDbCards(prev =>
          prev.map(c => (selectedCardIds.has(c.cardId) ? { ...c, targetState: 1 } : c))
        );
        for (const id of ids) {
          await updateDbCard(id, { targetState: 1 });
        }
        setSyncSuccess(`Moved to trash: ${ids.length}`);
      }
      setTimeout(() => setSyncSuccess(null), 3000);
      handleClearSelection();
    } catch (err: any) {
      console.error('Failed bulk delete:', err);
      setSyncError(err?.message || 'Failed to delete notes');
      setTimeout(() => setSyncError(null), 4000);
      loadLocalData();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedCardIds.size === 0) return;
    const ids = Array.from(selectedCardIds);
    setIsBulkProcessing(true);
    try {
      if (userToken) {
        const res = await bulkRestoreCloudCards(userToken, ids);
        if (!res.success) {
          throw new Error(res.error || 'Failed to restore notes from cloud');
        }
      }
      setAllDbCards(prev =>
        prev.map(c => (selectedCardIds.has(c.cardId) ? { ...c, targetState: 0 } : c))
      );
      for (const id of ids) {
        await updateDbCard(id, { targetState: 0 });
      }
      setSyncSuccess(`Restored from trash: ${ids.length}`);
      setTimeout(() => setSyncSuccess(null), 3000);
      handleClearSelection();
    } catch (err: any) {
      console.error('Failed bulk restore:', err);
      setSyncError(err?.message || 'Failed to restore notes');
      setTimeout(() => setSyncError(null), 4000);
      loadLocalData();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleSingleRestore = async (cardId: string) => {
    setIsBulkProcessing(true);
    try {
      if (userToken) {
        const res = await bulkRestoreCloudCards(userToken, [cardId]);
        if (!res.success) {
          throw new Error(res.error || 'Failed to restore note from cloud');
        }
      }
      setAllDbCards(prev =>
        prev.map(c => (c.cardId === cardId ? { ...c, targetState: 0 } : c))
      );
      await updateDbCard(cardId, { targetState: 0 });
      setSyncSuccess('Restored 1 note from trash');
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to restore note:', err);
      setSyncError(err?.message || 'Failed to restore note');
      setTimeout(() => setSyncError(null), 4000);
      loadLocalData();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleSingleHardDelete = async (cardId: string) => {
    if (!window.confirm('Permanently delete this note? This action cannot be undone.')) {
      return;
    }
    setIsBulkProcessing(true);
    try {
      if (userToken) {
        const res = await bulkHardDeleteCloudCards(userToken, [cardId]);
        if (!res.success) {
          throw new Error(res.error || 'Failed to permanently delete note from cloud');
        }
      }
      setAllDbCards(prev => prev.filter(c => c.cardId !== cardId));
      await deleteDbCard(cardId);
      setSyncSuccess('Permanently deleted 1 note');
      setTimeout(() => setSyncSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to delete note:', err);
      setSyncError(err?.message || 'Failed to delete note');
      setTimeout(() => setSyncError(null), 4000);
      loadLocalData();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkAssignCollection = async (
    collectionIds: string[],
    collectionNames?: string[]
  ) => {
    if (selectedCardIds.size === 0) return;
    const ids = Array.from(selectedCardIds);
    setIsBulkProcessing(true);
    try {
      const joinedNames =
        collectionNames && collectionNames.length > 0 ? collectionNames.join(', ') : undefined;
      setAllDbCards(prev =>
        prev.map(c => {
          if (selectedCardIds.has(c.cardId)) {
            return {
              ...c,
              collectionIds,
              collectionId: collectionIds[0] || undefined,
              collectionNames,
              collectionName: joinedNames,
            };
          }
          return c;
        })
      );
      for (const id of ids) {
        await updateDbCard(id, {
          collectionIds,
          collectionId: collectionIds[0] || undefined,
          collectionNames,
          collectionName: joinedNames,
        });
      }
      if (userToken) {
        const targetCards = allDbCards.filter(c => selectedCardIds.has(c.cardId));
        await bulkAssignCollectionCloudCards(userToken, targetCards, collectionIds);
      }
      setSyncSuccess(
        collectionIds.length > 0
          ? `Updated collections for ${ids.length} notes (${joinedNames || ''})`
          : `Removed from collections: ${ids.length}`
      );
      setTimeout(() => setSyncSuccess(null), 3000);
      handleClearSelection();
    } catch (err) {
      console.error('Failed bulk assign collection:', err);
      loadLocalData();
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await clearDbAuth();
    } finally {
      router.push('/login');
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
            cards={allDbCards}
            collections={collections}
            onToggleTodo={handleToggleTodo}
            onRefreshData={loadLocalData}
            onOpenCardDetail={card => setModalCard(card)}
            onNavigateToCollection={collId => {
              setActiveCollection(collId);
              setActiveTab('library');
            }}
            token={userToken}
            userId={userId}
          />
        ) : (
          <div>
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              collections={collectionsWithCounts}
              activeCollection={activeCollection}
              onSelectCollection={setActiveCollection}
              tags={computedTags}
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
                <span>{filteredCards.length} items</span>
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

                {filteredCards.length > 0 && (
                  <span className="text-[11px] text-nothing-gray/70 hidden sm:inline">
                    Sorted by date (latest first)
                  </span>
                )}
              </div>
            </div>

            {/* Trash Helper Banner */}
            {isTrash && filteredCards.length > 0 && !isSelectMode && (
              <div className="mb-4 p-3.5 rounded-2xl bg-red-950/20 border border-red-900/30 flex items-center justify-between gap-3 text-xs font-mono text-red-200 flex-wrap">
                <div className="flex items-center gap-2">
                  <Trash2 size={15} className="text-nothing-red shrink-0" />
                  <span>Notes in trash will stay here until restored or permanently deleted.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectMode(true);
                    handleSelectAll();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-black border border-white/20 transition-all font-dot uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw size={12} />
                  <span>Select All to Restore</span>
                </button>
              </div>
            )}

            <CardGrid
              cards={filteredCards}
              isLoading={isLoading}
              onToggleTodo={handleToggleTodo}
              activeTag={activeTag}
              onSelectTag={setActiveTag}
              isSelectMode={isSelectMode}
              selectedCardIds={selectedCardIds}
              onToggleSelect={handleToggleSelect}
              onRestoreCard={handleSingleRestore}
              onDeleteCard={handleSingleHardDelete}
              collections={collections}
              token={userToken}
              userId={userId}
              onCardUpdated={updatedCard => {
                setAllDbCards(prev =>
                  prev.map(c => (c.cardId === updatedCard.cardId ? updatedCard : c))
                );
                loadLocalData();
              }}
              onOpenCreateCollection={() => {
                setCollectionModalState({ isOpen: true, mode: 'CREATE' });
              }}
              onCollectionCreated={savedCol => {
                setCollections(prev => [...prev, savedCol]);
                loadLocalData();
              }}
            />

            {/* Bulk Actions Floating Dock */}
            <BulkActionBar
              selectedCount={selectedCardIds.size}
              totalCount={filteredCards.length}
              isAllSelected={filteredCards.length > 0 && selectedCardIds.size === filteredCards.length}
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
              token={userToken}
              userId={userId}
              onAssign={handleBulkAssignCollection}
              onOpenCreateCollection={() => {
                setCollectionModalState({ isOpen: true, mode: 'CREATE' });
              }}
              onCollectionCreated={savedCol => {
                setCollections(prev => [...prev, savedCol]);
                loadLocalData();
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
            collections={collections}
            token={userToken}
            userId={userId}
            onCardUpdated={updatedCard => {
              setModalCard(updatedCard);
              setAllDbCards(prev =>
                prev.map(c => (c.cardId === updatedCard.cardId ? updatedCard : c))
              );
              loadLocalData();
            }}
            onOpenCreateCollection={() => {
              setCollectionModalState({ isOpen: true, mode: 'CREATE' });
            }}
            onCollectionCreated={savedCol => {
              setCollections(prev => [...prev, savedCol]);
              loadLocalData();
            }}
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
            setAllDbCards(prev => [newCard, ...prev]);
            loadLocalData();
          }}
          onCollectionCreated={savedCol => {
            setCollections(prev => [...prev, savedCol]);
            loadLocalData();
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
            loadLocalData();
          }}
          onCollectionDeleted={deletedId => {
            setCollections(prev => prev.filter(c => c.collectionId !== deletedId));
            if (activeCollection === deletedId) setActiveCollection('');
            loadLocalData();
          }}
        />
      </main>
    </div>
  );
}
