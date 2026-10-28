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
} from 'lucide-react';
import type { Collection } from '@/types';
import { useScrollLock } from '@/lib/useScrollLock';

interface SelectCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  selectedCardCount: number;
  onAssign: (collectionId: string | null, collectionName?: string) => Promise<void>;
  onOpenCreateCollection?: () => void;
}

export default function SelectCollectionModal({
  isOpen,
  onClose,
  collections,
  selectedCardCount,
  onAssign,
  onOpenCreateCollection,
}: SelectCollectionModalProps) {
  const [search, setSearch] = useState('');
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lock background page scroll while modal is open
  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedColId(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

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

  const handleApply = async () => {
    setIsSubmitting(true);
    try {
      const selectedCol = collections.find(c => c.collectionId === selectedColId);
      await onAssign(selectedColId, selectedCol?.name);
      onClose();
    } catch (err) {
      console.error('Failed to assign collection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#141414] border border-nothing-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-nothing-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-nothing-red/20 text-nothing-red">
              <FolderOpen size={18} />
            </div>
            <div>
              <h3 className="font-dot text-base text-white uppercase tracking-wider">
                ADD TO COLLECTION
              </h3>
              <p className="text-xs font-mono text-nothing-gray mt-0.5">
                Selected notes: <span className="text-white">{selectedCardCount}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-nothing-border/40">
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
              className="w-full bg-[#1A1A1A] border border-nothing-border/60 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-nothing-gray focus:outline-none focus:border-nothing-red transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-nothing-gray hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Collections List */}
        <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
          {/* Option: Remove from collection */}
          <button
            type="button"
            onClick={() => setSelectedColId(null)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
              selectedColId === null
                ? 'bg-nothing-red/15 border-nothing-red/60 text-white'
                : 'bg-[#1A1A1A]/60 border-nothing-border/40 text-nothing-light hover:bg-[#1A1A1A] hover:border-nothing-gray/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`p-2 rounded-lg ${
                  selectedColId === null
                    ? 'bg-nothing-red text-white'
                    : 'bg-white/5 text-nothing-gray'
                }`}
              >
                <FolderMinus size={15} />
              </span>
              <div>
                <p className="text-xs font-mono font-medium">No Collection</p>
                <p className="text-[11px] font-mono text-nothing-gray">
                  Remove selected notes from any collection
                </p>
              </div>
            </div>
            {selectedColId === null && <Check size={16} className="text-nothing-red shrink-0" />}
          </button>

          {/* User Collections */}
          {filteredCollections.map(col => {
            const isSelected = selectedColId === col.collectionId;
            return (
              <button
                key={col.collectionId}
                type="button"
                onClick={() => setSelectedColId(col.collectionId)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-nothing-red/15 border-nothing-red/60 text-white'
                    : 'bg-[#1A1A1A]/60 border-nothing-border/40 text-nothing-light hover:bg-[#1A1A1A] hover:border-nothing-gray/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`p-2 rounded-lg shrink-0 ${
                      isSelected ? 'bg-nothing-red text-white' : 'bg-white/5 text-nothing-light'
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
                {isSelected && <Check size={16} className="text-nothing-red shrink-0" />}
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
        <div className="p-4 border-t border-nothing-border/60 bg-[#161616] flex items-center justify-between gap-3">
          {onOpenCreateCollection ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreateCollection();
              }}
              className="px-3 py-2 rounded-xl text-xs font-mono text-nothing-gray hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <FolderPlus size={14} />
              <span>+ New Collection</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-mono text-nothing-gray hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-nothing-red text-white hover:bg-white hover:text-black transition-colors text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <span>Apply</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
