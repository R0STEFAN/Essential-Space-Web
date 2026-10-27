'use client';

import { Search, X, Tag } from 'lucide-react';
import type { Collection } from '@/types';

export interface TagCount {
  name: string;
  count: number;
}

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  collections: Collection[];
  activeCollection: string;
  onSelectCollection: (colId: string) => void;
  tags: TagCount[];
  activeTag: string;
  onSelectTag: (tag: string) => void;
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
  collections = [],
  activeCollection = '',
  onSelectCollection,
  tags = [],
  activeTag = '',
  onSelectTag,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nothing-gray" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search notes, audio transcripts, tags, tasks..."
            className="w-full bg-nothing-card border border-nothing-border rounded-xl pl-10 pr-9 py-2 text-xs text-white placeholder:text-nothing-gray/60 focus:outline-none focus:border-nothing-red/80 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nothing-gray hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Collections filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => onSelectCollection('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 flex-shrink-0 ${
              activeCollection === ''
                ? 'bg-nothing-border text-white font-medium border border-nothing-gray/40'
                : 'bg-nothing-card/80 text-nothing-gray hover:text-white border border-nothing-border/60'
            }`}
          >
            <span>All Collections</span>
          </button>

          {collections.map(col => {
            const isSelected = activeCollection === col.collectionId;
            return (
              <button
                key={col.collectionId}
                onClick={() => onSelectCollection(col.collectionId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 flex-shrink-0 ${
                  isSelected
                    ? 'bg-nothing-border text-white font-medium border border-nothing-gray/40'
                    : 'bg-nothing-card/80 text-nothing-gray hover:text-white border border-nothing-border/60'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: col.color || '#D71921' }}
                />
                <span>{col.name}</span>
                {col.cardCount !== undefined && col.cardCount > 0 && (
                  <span className="text-[10px] text-nothing-gray font-mono">
                    ({col.cardCount})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags Filter Bar */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          <button
            type="button"
            onClick={() => onSelectTag('')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all flex-shrink-0 border ${
              activeTag === ''
                ? 'bg-white text-black border-white font-medium'
                : 'bg-nothing-card/80 text-nothing-gray hover:text-white border-nothing-border/70'
            }`}
          >
            <Tag size={10} />
            <span>All Tags</span>
          </button>

          {tags.map(t => {
            const isSelected = activeTag.toLowerCase() === t.name.toLowerCase();
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => onSelectTag(isSelected ? '' : t.name)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-all flex-shrink-0 border ${
                  isSelected
                    ? 'bg-nothing-red text-white border-nothing-red shadow-sm shadow-nothing-red/30'
                    : 'bg-nothing-hover/70 text-nothing-gray hover:text-white hover:border-nothing-gray/50 border-nothing-border/60'
                }`}
              >
                <Tag size={10} />
                <span>{t.name}</span>
                <span
                  className={`text-[9px] ${
                    isSelected ? 'text-white/80' : 'text-nothing-gray/60'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
