'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderPlus,
  FolderMinus,
  Search,
  Check,
  Loader2,
  FolderOpen,
  Plus,
} from 'lucide-react';
import type { Collection } from '@/types';
import { useScrollLock } from '@/lib/useScrollLock';
import { createCloudCollection } from '@/lib/nothing-collections';

interface SelectCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  selectedCardCount: number;
  initialCollectionIds?: string[];
  token?: string;
  userId?: string;
  onAssign: (collectionIds: string[], collectionNames?: string[]) => Promise<void>;
  onOpenCreateCollection?: () => void;
  onCollectionCreated?: (collection: Collection) => void;
}

export default function SelectCollectionModal({
  isOpen,
  onClose,
  collections,
  selectedCardCount,
  initialCollectionIds = [],
  token,
  userId,
  onAssign,
  onOpenCreateCollection,
  onCollectionCreated,
}: SelectCollectionModalProps) {
  const [search, setSearch] = useState('');
  const [selectedColIds, setSelectedColIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline collection creation state
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isCreatingCol, setIsCreatingCol] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Lock background page scroll while modal is open
  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedColIds(initialCollectionIds || []);
      setIsSubmitting(false);
      setIsCreatingInline(false);
      setNewCollectionName('');
      setCreateError(null);
    }
  }, [isOpen, initialCollectionIds]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredCollections = collections.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const toggleCollection = (colId: string) => {
    setSelectedColIds(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const handleClearAll = () => {
    setSelectedColIds([]);
  };

  const handleInlineCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    if (!token || !userId) {
      // Fallback to external modal if token/userId not passed
      onClose();
      onOpenCreateCollection?.();
      return;
    }

    setIsCreatingCol(true);
    setCreateError(null);
    try {
      const res = await createCloudCollection(token, userId, trimmed);
      if (!res.success || !res.collection) {
        throw new Error(res.error || 'Failed to create collection');
      }
      onCollectionCreated?.(res.collection);
      // Auto-select the newly created collection
      setSelectedColIds(prev => [...prev, res.collection!.collectionId]);
      setNewCollectionName('');
      setIsCreatingInline(false);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create collection');
    } finally {
      setIsCreatingCol(false);
    }
  };

  const handleApply = async () => {
    setIsSubmitting(true);
    try {
      const selectedNames = collections
        .filter(c => selectedColIds.includes(c.collectionId))
        .map(c => c.name);
      await onAssign(selectedColIds, selectedNames);
      onClose();
    } catch (err) {
      console.error('Failed to assign collections:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-nothing-dark border border-nothing-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-nothing-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-nothing-red/15 text-nothing-red">
              <FolderOpen size={18} />
            </div>
            <div>
              <h3 className="font-dot text-base text-nothing-ink uppercase tracking-wider">
                COLLECTIONS
              </h3>
              <p className="text-xs font-mono text-nothing-gray mt-0.5">
                {selectedCardCount === 1 ? '1 note' : `${selectedCardCount} notes`} • Selected:{' '}
                <span className="text-nothing-ink font-medium">{selectedColIds.length}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-nothing-gray hover:text-nothing-ink hover:bg-nothing-ink/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & New Collection Input Bar */}
        <div className="p-3.5 border-b border-nothing-border/40 space-y-2.5">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nothing-gray"
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search collections..."
              className="w-full bg-nothing-input border border-nothing-border/80 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-nothing-ink placeholder-nothing-gray focus:outline-none focus:border-nothing-red transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-nothing-gray hover:text-nothing-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Inline Create Collection Input */}
          {isCreatingInline ? (
            <form onSubmit={handleInlineCreate} className="space-y-1.5 animate-fadeIn">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  required
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  placeholder="Collection name..."
                  className="flex-1 bg-nothing-input border border-nothing-border rounded-xl px-3 py-1.5 text-xs font-mono text-nothing-ink placeholder-nothing-gray focus:outline-none focus:border-nothing-ink transition-colors"
                />
                <button
                  type="submit"
                  disabled={isCreatingCol || !newCollectionName.trim()}
                  className="px-3 py-1.5 rounded-xl bg-nothing-red text-white hover:bg-nothing-ink hover:text-nothing-on-ink transition-colors text-xs font-dot uppercase tracking-wider flex items-center gap-1 disabled:opacity-50 shrink-0"
                >
                  {isCreatingCol ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  <span>Create</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingInline(false);
                    setNewCollectionName('');
                    setCreateError(null);
                  }}
                  className="p-1.5 rounded-lg text-nothing-gray hover:text-nothing-ink"
                >
                  <X size={14} />
                </button>
              </div>
              {createError && (
                <p className="text-[11px] font-mono text-nothing-red">{createError}</p>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreatingInline(true)}
              className="w-full py-1.5 px-3 rounded-xl border border-dashed border-nothing-border hover:border-nothing-ink/40 text-xs font-mono text-nothing-gray hover:text-nothing-ink flex items-center justify-center gap-1.5 transition-colors"
            >
              <FolderPlus size={13} className="text-nothing-red" />
              <span>Create new collection</span>
            </button>
          )}
        </div>

        {/* Collections List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
          {/* Option: Clear All Collections */}
          <button
            type="button"
            onClick={handleClearAll}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
              selectedColIds.length === 0
                ? 'bg-nothing-red/10 border-nothing-red/60 text-nothing-ink'
                : 'bg-nothing-subtle/70 border-nothing-border/50 text-nothing-light hover:bg-nothing-subtle hover:border-nothing-gray/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`p-2 rounded-lg ${
                  selectedColIds.length === 0
                    ? 'bg-nothing-red text-white'
                    : 'bg-nothing-ink/5 text-nothing-gray'
                }`}
              >
                <FolderMinus size={15} />
              </span>
              <div>
                <p className="text-xs font-mono font-medium">No Collection</p>
                <p className="text-[11px] font-mono text-nothing-gray">
                  Remove from all collections
                </p>
              </div>
            </div>
            {selectedColIds.length === 0 && <Check size={16} className="text-nothing-red shrink-0" />}
          </button>

          {/* User Collections with Checkbox Toggles */}
          {filteredCollections.map(col => {
            const isSelected = selectedColIds.includes(col.collectionId);
            return (
              <button
                key={col.collectionId}
                type="button"
                onClick={() => toggleCollection(col.collectionId)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-nothing-ink/[0.06] border-nothing-red/80 text-nothing-ink shadow-sm'
                    : 'bg-nothing-subtle/70 border-nothing-border/50 text-nothing-light hover:bg-nothing-subtle hover:border-nothing-gray/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-all shrink-0 ${
                      isSelected
                        ? 'bg-nothing-red border-nothing-red text-white'
                        : 'border-nothing-gray/60 bg-nothing-input text-transparent'
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <span
                    className={`p-2 rounded-lg shrink-0 ${
                      isSelected ? 'bg-nothing-red/15 text-nothing-red' : 'bg-nothing-ink/5 text-nothing-light'
                    }`}
                  >
                    <Folder size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-medium truncate">{col.name}</p>
                    <p className="text-[11px] font-mono text-nothing-gray">
                      {col.cardCount ?? 0} {col.cardCount === 1 ? 'note' : 'notes'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}

          {filteredCollections.length === 0 && search && (
            <div className="p-6 text-center text-xs font-mono text-nothing-gray">
              No collections found matching &ldquo;{search}&rdquo;
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-nothing-border/60 bg-nothing-subtle/80 flex items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-nothing-gray">
            {selectedColIds.length === 0 ? (
              <span>Will not belong to any collection</span>
            ) : (
              <span>
                Selected: <strong className="text-nothing-ink">{selectedColIds.length}</strong> {selectedColIds.length === 1 ? 'collection' : 'collections'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-mono text-nothing-gray hover:text-nothing-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-nothing-red text-white hover:bg-nothing-ink hover:text-nothing-on-ink transition-colors text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <span>Apply ({selectedColIds.length})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
