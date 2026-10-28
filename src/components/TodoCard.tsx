'use client';

import { useState } from 'react';
import { CheckSquare, Square, Calendar, CheckCircle2, Check } from 'lucide-react';
import type { Card, CardEvent } from '@/types';

export default function TodoCard({
  card,
  onToggleTodo,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: {
  card: Card;
  onToggleTodo: (cardId: string, eventId: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (cardId: string) => void;
  onOpenDetail?: (card: Card) => void;
}) {
  const events = card.events || [];
  const completedCount = events.filter(e => e.check === 1).length;
  const totalCount = events.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  return (
    <div
      onClick={() => {
        if (isSelectMode) {
          onToggleSelect?.(card.cardId);
        }
      }}
      className={`nothing-card p-5 flex flex-col justify-between group transition-all ${
        isSelectMode ? 'cursor-pointer' : ''
      } ${
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
              <span className={`p-1 rounded ${allDone ? 'bg-green-500/20 text-green-400' : 'bg-nothing-red/20 text-nothing-red'}`}>
                {allDone ? <CheckCircle2 size={14} /> : <CheckSquare size={14} />}
              </span>
            )}
            <span className="font-dot">CHECKLIST</span>
            {card.collectionName && (
              <span className="px-2 py-0.5 rounded-full bg-nothing-hover border border-nothing-border text-[10px]">
                {card.collectionName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isSelectMode && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onToggleSelect?.(card.cardId);
                }}
                title="Select note"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-nothing-gray hover:text-white"
              >
                <Square size={13} />
              </button>
            )}
            <span className="font-mono text-[11px] text-nothing-light font-medium">
              {completedCount}/{totalCount}
            </span>
          </div>
        </div>

        {card.title && (
          <h3 className="font-normal text-white text-base sm:text-lg mb-3 leading-snug tracking-wide">
            {card.title}
          </h3>
        )}

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="w-full bg-nothing-border/60 h-1 rounded-full mb-4 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-nothing-red'}`}
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}

        {/* List items */}
        <div className="space-y-2 mt-2">
          {events.map(event => {
            const isChecked = event.check === 1;
            return (
              <div
                key={event.eventId}
                onClick={() => onToggleTodo(card.cardId, event.eventId)}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-nothing-hover cursor-pointer transition-colors select-none"
              >
                <button
                  type="button"
                  className={`mt-0.5 flex-shrink-0 transition-colors ${
                    isChecked ? 'text-nothing-red' : 'text-nothing-gray hover:text-white'
                  }`}
                >
                  {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>

                <div className="flex-1">
                  <p
                    className={`text-xs leading-snug transition-all ${
                      isChecked
                        ? 'line-through text-nothing-gray/60'
                        : 'text-nothing-light'
                    }`}
                  >
                    {event.title}
                  </p>
                  {event.time && (
                    <div className="flex items-center gap-1 text-[10px] text-nothing-gray font-mono mt-1">
                      <Calendar size={10} />
                      <span>{new Date(event.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-2 border-t border-nothing-border/30 flex items-center justify-between text-[11px] text-nothing-gray font-mono">
        <span>{new Date(card.createTime).toLocaleDateString()}</span>
        <span className="text-nothing-gray/70">Nothing OS Task Card</span>
      </div>
    </div>
  );
}
