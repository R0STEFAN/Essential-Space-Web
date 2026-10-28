'use client';

import { ExternalLink, Bookmark, Tag, Maximize2, Check, Square } from 'lucide-react';
import type { Card } from '@/types';

export default function LinkCard({
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
  const candidateUrl =
    card.link?.url ||
    (card.audio?.transcript?.startsWith('http') ? card.audio.transcript.trim() : undefined) ||
    card.content?.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
    card.summary?.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
    '';

  let domain = card.link?.domain || '';
  if (!domain && candidateUrl) {
    try {
      domain = new URL(candidateUrl).hostname.replace(/^www\./, '');
    } catch {
      domain = candidateUrl;
    }
  }

  const previewImg = card.link?.preview || card.imageUrl;
  const title = card.title || card.link?.title || candidateUrl || 'Saved Link';
  const description = card.summary || card.link?.description || card.content;

  return (
    <div
      onClick={() => {
        if (isSelectMode) {
          onToggleSelect?.(card.cardId);
        } else {
          onOpenDetail?.(card);
        }
      }}
      className={`nothing-card overflow-hidden flex flex-col justify-between group cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-nothing-red border-nothing-red bg-nothing-red/[0.04]'
          : 'hover:border-nothing-red/50'
      }`}
    >
      <div>
        {/* OpenGraph / Website Preview Image */}
        {previewImg && (
          <div className="w-full h-44 bg-nothing-black overflow-hidden relative border-b border-nothing-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImg}
              alt={title}
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              onError={e => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>
        )}

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between text-xs text-nothing-gray font-mono mb-2.5">
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
                  <Bookmark size={14} />
                </span>
              )}
              <span className="font-dot">LINK / BOOKMARK</span>
              {card.collectionName && (
                <span className="px-2 py-0.5 rounded-full bg-nothing-hover border border-nothing-border text-[10px]">
                  {card.collectionName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {!isSelectMode && (
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
              )}
              {candidateUrl && (
                <a
                  href={candidateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-nothing-gray hover:text-white p-1 rounded hover:bg-nothing-hover transition-colors"
                  title="Open Website"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>

          <h3 className="font-normal text-white text-base sm:text-lg mb-2 leading-snug line-clamp-2 group-hover:text-nothing-red transition-colors tracking-wide">
            {title}
          </h3>

          {/* Domain Pill (matching Nothing OS Library View) */}
          {(domain || candidateUrl) && (
            <a
              href={candidateUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-nothing-hover/80 border border-nothing-border text-xs font-mono text-white hover:border-nothing-red/60 transition-colors mb-3 max-w-full"
            >
              {card.link?.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.link.favicon}
                  alt=""
                  className="w-4 h-4 rounded-full bg-white/10 shrink-0"
                  onError={e => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
              <span className="truncate">{domain || candidateUrl}</span>
            </a>
          )}

          {description && (
            <p className="text-xs text-nothing-light/85 leading-relaxed line-clamp-2 mb-3">
              {description}
            </p>
          )}

          {/* Top 1 Extracted Key-Value Preview */}
          {card.infoExtract && card.infoExtract.length > 0 && (
            <div className="bg-nothing-hover/40 rounded-lg px-2.5 py-2 mb-2.5 border border-nothing-border/40 text-xs font-mono flex justify-between items-center">
              <span className="text-nothing-gray truncate mr-2">{card.infoExtract[0].title}:</span>
              <span className="text-white font-semibold truncate">{card.infoExtract[0].value}</span>
            </div>
          )}

          {/* Tags */}
          {card.tags && card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
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
                        : 'bg-nothing-hover border-nothing-border/60 text-nothing-gray hover:text-white'
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
      </div>

      <div className="px-5 pb-4 pt-2 border-t border-nothing-border/30 flex items-center justify-between text-[11px] text-nothing-gray font-mono">
        <span>{new Date(card.createTime).toLocaleDateString()}</span>
        <span className="text-nothing-light group-hover:text-nothing-red flex items-center gap-1 transition-colors">
          <span>Full Report</span>
          <Maximize2 size={11} />
        </span>
      </div>
    </div>
  );
}
