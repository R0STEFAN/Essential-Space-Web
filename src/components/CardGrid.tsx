'use client';

import { useState } from 'react';
import type { Card, Collection } from '@/types';
import AudioCard from './AudioCard';
import TodoCard from './TodoCard';
import LinkCard from './LinkCard';
import TextCard from './TextCard';
import ImageCard from './ImageCard';
import CardDetailModal from './CardDetailModal';
import { Inbox } from 'lucide-react';

interface CardGridProps {
  cards: Card[];
  isLoading: boolean;
  onToggleTodo: (cardId: string, eventId: string) => void;
  activeTag?: string;
  onSelectTag?: (tag: string) => void;
  isSelectMode?: boolean;
  selectedCardIds?: Set<string>;
  onToggleSelect?: (cardId: string) => void;
  onRestoreCard?: (cardId: string) => void;
  onDeleteCard?: (cardId: string) => void;
  collections?: Collection[];
  token?: string;
  userId?: string;
  onCardUpdated?: (card: Card) => void;
  onOpenCreateCollection?: () => void;
  onCollectionCreated?: (collection: Collection) => void;
}

export default function CardGrid({
  cards,
  isLoading,
  onToggleTodo,
  activeTag,
  onSelectTag,
  isSelectMode,
  selectedCardIds,
  onToggleSelect,
  onRestoreCard,
  onDeleteCard,
  collections = [],
  token,
  userId,
  onCardUpdated,
  onOpenCreateCollection,
  onCollectionCreated,
}: CardGridProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = cards.find(c => c.cardId === selectedCardId) || null;
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="nothing-card h-56 p-5 border-nothing-border/40" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-nothing-border rounded-2xl bg-nothing-card/30">
        <div className="p-3 rounded-full bg-nothing-border/40 text-nothing-gray mb-3">
          <Inbox size={28} />
        </div>
        <h4 className="font-dot text-sm text-white mb-1">NO CARDS FOUND</h4>
        <p className="text-xs text-nothing-gray max-w-sm font-mono">
          No notes match your current filters. Click &quot;SYNC&quot; to fetch latest updates from your Nothing OS device.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-max">
        {cards.map(card => {
          const isSelected = selectedCardIds?.has(card.cardId);
          switch (card.type) {
            case 'IMAGE':
              return (
                <ImageCard
                  key={card.cardId}
                  card={card}
                  activeTag={activeTag}
                  onSelectTag={onSelectTag}
                  onOpenDetail={c => setSelectedCardId(c.cardId)}
                  isSelectMode={isSelectMode}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelect}
                />
              );
            case 'AUDIO':
              return (
                <AudioCard
                  key={card.cardId}
                  card={card}
                  activeTag={activeTag}
                  onSelectTag={onSelectTag}
                  onOpenDetail={c => setSelectedCardId(c.cardId)}
                  isSelectMode={isSelectMode}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelect}
                />
              );
            case 'TODO':
              return (
                <TodoCard
                  key={card.cardId}
                  card={card}
                  onToggleTodo={onToggleTodo}
                  isSelectMode={isSelectMode}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelect}
                  onOpenDetail={c => setSelectedCardId(c.cardId)}
                />
              );
            case 'LINK':
              return (
                <LinkCard
                  key={card.cardId}
                  card={card}
                  activeTag={activeTag}
                  onSelectTag={onSelectTag}
                  onOpenDetail={c => setSelectedCardId(c.cardId)}
                  isSelectMode={isSelectMode}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelect}
                />
              );
            case 'TEXT':
            case 'CLIPPED_TEXT':
            case 'FREEFORM':
            default:
              return (
                <TextCard
                  key={card.cardId}
                  card={card}
                  activeTag={activeTag}
                  onSelectTag={onSelectTag}
                  onOpenDetail={c => setSelectedCardId(c.cardId)}
                  isSelectMode={isSelectMode}
                  isSelected={isSelected}
                  onToggleSelect={onToggleSelect}
                />
              );
          }
        })}
      </div>

      <CardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCardId(null)}
        collections={collections}
        token={token}
        userId={userId}
        onCardUpdated={onCardUpdated}
        onOpenCreateCollection={onOpenCreateCollection}
        onCollectionCreated={onCollectionCreated}
        activeTag={activeTag}
        onSelectTag={onSelectTag}
        onToggleTodo={onToggleTodo}
        onRestoreCard={onRestoreCard}
        onDeleteCard={onDeleteCard}
      />
    </>
  );
}
