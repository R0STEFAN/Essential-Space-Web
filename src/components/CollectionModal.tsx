'use client';

import { useState, useEffect } from 'react';
import { X, FolderPlus, Trash2, Check, Loader2 } from 'lucide-react';
import type { Collection } from '@/types';
import {
  createCloudCollection,
  updateCloudCollection,
  deleteCloudCollection,
} from '@/lib/nothing-collections';
import { useScrollLock } from '@/lib/useScrollLock';

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'CREATE' | 'EDIT';
  collection?: Collection | null;
  token: string;
  userId: string;
  onCollectionSaved: (collection: Collection) => void;
  onCollectionDeleted?: (collectionId: string) => void;
}

export default function CollectionModal({
  isOpen,
  onClose,
  mode,
  collection,
  token,
  userId,
  onCollectionSaved,
  onCollectionDeleted,
}: CollectionModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock background page scroll while modal is open
  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'EDIT' && collection) {
        setName(collection.name);
      } else {
        setName('');
      }
      setError(null);
    }
  }, [isOpen, mode, collection]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Collection name cannot be empty');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'CREATE') {
        const res = await createCloudCollection(token, userId, name.trim());
        if (!res.success || !res.collection) {
          throw new Error(res.error || 'Failed to create collection');
        }
        onCollectionSaved(res.collection);
      } else if (mode === 'EDIT' && collection) {
        const res = await updateCloudCollection(token, collection.collectionId, name.trim());
        if (!res.success) {
          throw new Error(res.error || 'Failed to update collection');
        }
        onCollectionSaved({
          ...collection,
          name: name.trim(),
          updateTime: Date.now(),
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!collection) return;
    if (!confirm(`Are you sure you want to delete collection "${collection.name}"?`)) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await deleteCloudCollection(token, collection.collectionId);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete collection');
      }
      onCollectionDeleted?.(collection.collectionId);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md rounded-2xl bg-nothing-card border border-nothing-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nothing-border/60">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-nothing-red" />
            <h3 className="font-dot text-sm text-white uppercase tracking-wider font-semibold">
              {mode === 'CREATE' ? 'NEW COLLECTION' : 'EDIT COLLECTION'}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-nothing-red/15 border border-nothing-red/30 text-xs font-mono text-nothing-red">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-nothing-gray uppercase mb-1.5">
              Collection Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Work, Ideas, Travel, Shopping"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-nothing-border text-xs text-white placeholder:text-nothing-gray/50 focus:outline-none focus:border-white transition-colors font-mono"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-nothing-border/60 flex items-center justify-between">
            {mode === 'EDIT' ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="px-3 py-2 rounded-xl text-xs font-mono text-nothing-red hover:bg-nothing-red/10 border border-nothing-red/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-mono text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-dot tracking-wider font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>SAVING...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} strokeWidth={3} />
                    <span>{mode === 'CREATE' ? 'CREATE' : 'SAVE CHANGES'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
