'use client';

import { useState } from 'react';
import { FileText, Copy, Check, Scissors, Tag, Maximize2, Square } from 'lucide-react';
import type { Card } from '@/types';

export default function TextCard({
  card,
  activeTag,
  onSelectTag,
  onOpenDetail,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: {
  card: Card;
  activeTag?: string;
  onSelectTag?: (tag: string) => void;
  onOpenDetail?: (card: Card) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (cardId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isClipped = card.type === 'CLIPPED_TEXT';

  const copyContent = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card.content) return;
    navigator.clipboard.writeText(card.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={() => {
        if (isSelectMode) {
          onToggleSelect?.(card.cardId);
        } else {
          onOpenDetail?.(card);
        }
      }}
      className={`nothing-card p-5 flex flex-col justify-between group cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-nothing-red border-nothing-red bg-nothing-red/[0.04]'
          : 'hover:border-nothing-red/50'
      }`}
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between text-xs text-nothing-gray font-mono mb-2">
          <div className="flex items-center gap-2">
            {isSelectMode ? (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onToggleSelect?.(card.cardId);
                }}
                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-nothing-red border-nothing-red text-white'
                    : 'border-nothing-gray/60 hover:border-white bg-black/40'
                }`}
              >
                {isSelected && <Check size={11} strokeWidth={3} />}
              </button>
            ) : (
              <span className="p-1 rounded bg-nothing-red/20 text-nothing-red">
                {isClipped ? <Scissors size={14} /> : <FileText size={14} />}
              </span>
            )}
            <span className="font-dot">{isClipped ? 'CLIPPED NOTE' : 'FREEFORM'}</span>
            {card.collectionName && (
              <span className="px-2 py-0.5 rounded-full bg-nothing-hover border border-nothing-border text-[10px]">
                {card.collectionName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isSelectMode && (
              <>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onToggleSelect?.(card.cardId);
                  }}
                  title="Select note"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-nothing-gray hover:text-white"
                >
                  <Square size={13} />
                </button>
                <button
                  onClick={copyContent}
                  title="Copy Note"
                  className="text-nothing-gray hover:text-white p-1 rounded hover:bg-nothing-hover transition-colors"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </>
            )}
          </div>
        </div>

        {card.title && (
          <h3 className="font-normal text-white text-base sm:text-lg mb-2 leading-snug tracking-wide">
            {card.title}
          </h3>
        )}

        {card.content && (
          <div className="text-xs text-nothing-light/90 leading-relaxed font-sans whitespace-pre-wrap line-clamp-3">
            {card.content}
          </div>
        )}

        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3" onClick={e => e.stopPropagation()}>
            {card.tags.slice(0, 4).map((tag, idx) => {
              const isSelected = activeTag?.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectTag?.(isSelected ? '' : tag)}
                  className={`inline-flex items-center gap-1 text-[10px] font-mono px-2.5 py-0.5 rounded-full border transition-all ${
                    isSelected
                      ? 'bg-nothing-red text-white border-nothing-red'
                      : 'bg-nothing-hover border-nothing-border/60 text-nothing-gray hover:text-white hover:border-nothing-gray/50'
                  }`}
                >
                  <Tag size={9} />
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 pt-2 border-t border-nothing-border/30 flex items-center justify-between text-[11px] text-nothing-gray font-mono">
        <span>{new Date(card.createTime).toLocaleDateString()}</span>
        <span className="text-nothing-light group-hover:text-nothing-red flex items-center gap-1 transition-colors">
          <span>Full Report</span>
          <Maximize2 size={11} />
        </span>
      </div>
    </div>
  );
}
