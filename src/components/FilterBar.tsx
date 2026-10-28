'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X, Tag, ChevronDown, Check, FolderPlus, Settings2 } from 'lucide-react';
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
  onOpenCreateCollection?: () => void;
  onOpenEditCollection?: (col: Collection) => void;
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
  onOpenCreateCollection,
  onOpenEditCollection,
}: FilterBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCol = collections.find(c => c.collectionId === activeCollection);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on ESC
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

        {/* Collections filter: All Collections button + Wide Dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 1. All Collections Button */}
          <button
            type="button"
            onClick={() => {
              onSelectCollection('');
              setIsDropdownOpen(false);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono transition-all flex items-center gap-1.5 flex-shrink-0 select-none ${
              activeCollection === ''
                ? 'bg-white text-black font-semibold shadow-sm border border-white'
                : 'bg-nothing-card/90 text-nothing-gray hover:text-white border border-nothing-border hover:border-white/30'
            }`}
          >
            <span>All Collections</span>
          </button>

          {/* 2. Wide Collection Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(prev => !prev)}
              className={`w-52 sm:w-64 px-3.5 py-2 rounded-xl text-xs font-mono transition-all flex items-center justify-between gap-2 border select-none ${
                activeCollection !== ''
                  ? 'bg-nothing-card border-white/60 text-white font-medium shadow-sm'
                  : 'bg-nothing-card/90 border-nothing-border text-nothing-gray hover:text-white hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {selectedCol ? (
                  <>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: selectedCol.color || '#D71921' }}
                    />
                    <span className="truncate text-white font-medium">{selectedCol.name}</span>
                    {selectedCol.cardCount !== undefined && selectedCol.cardCount > 0 && (
                      <span className="text-[10px] text-nothing-gray font-mono flex-shrink-0">
                        ({selectedCol.cardCount})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-nothing-gray truncate">Select Collection</span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`text-nothing-gray transition-transform duration-200 flex-shrink-0 ${
                  isDropdownOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 sm:w-72 max-h-72 overflow-y-auto rounded-xl bg-nothing-card/95 border border-white/20 shadow-2xl p-1.5 z-50 backdrop-blur-xl scrollbar-thin">
                {/* Create New Collection button at top */}
                {onOpenCreateCollection && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenCreateCollection();
                    }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono text-nothing-red hover:bg-nothing-red/10 transition-all flex items-center gap-2 border-b border-nothing-border/40 mb-1"
                  >
                    <FolderPlus size={13} />
                    <span>+ New Collection</span>
                  </button>
                )}

                {collections.length === 0 ? (
                  <div className="p-3 text-center text-xs font-mono text-nothing-gray">
                    No collections found
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {collections.map(col => {
                      const isSelected = activeCollection === col.collectionId;
                      return (
                        <div
                          key={col.collectionId}
                          onClick={() => {
                            onSelectCollection(col.collectionId);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between gap-2 text-left cursor-pointer group ${
                            isSelected
                              ? 'bg-white/15 text-white font-medium'
                              : 'text-nothing-gray hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: col.color || '#D71921' }}
                            />
                            <span className="truncate">{col.name}</span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {col.cardCount !== undefined && col.cardCount > 0 && (
                              <span className="text-[10px] text-nothing-gray">
                                {col.cardCount}
                              </span>
                            )}
                            {isSelected && <Check size={13} className="text-nothing-red flex-shrink-0" />}

                            {onOpenEditCollection && (
                              <button
                                type="button"
                                title="Edit Collection"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsDropdownOpen(false);
                                  onOpenEditCollection(col);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/20 text-nothing-gray hover:text-white transition-opacity ml-1"
                              >
                                <Settings2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
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