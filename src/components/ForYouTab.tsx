'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  CheckSquare,
  Clock,
  ExternalLink,
  Check,
  X,
  FolderPlus,
  FolderCheck,
  ChevronRight,
  Inbox,
  Mic,
  Bookmark,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import type { Card, Collection } from '@/types';
import type { ForYouTask, ForYouRecommendation, ForYouData } from '@/lib/foryou';
import CardGrid from './CardGrid';

interface ForYouTabProps {
  cards: Card[];
  collections: Collection[];
  onToggleTodo: (cardId: string, eventId: string) => void;
  onRefreshData: () => void;
  onOpenCardDetail: (card: Card) => void;
  onNavigateToCollection: (collectionId: string) => void;
}

export default function ForYouTab({
  cards,
  collections,
  onToggleTodo,
  onRefreshData,
  onOpenCardDetail,
  onNavigateToCollection,
}: ForYouTabProps) {
  const [foryouData, setForyouData] = useState<ForYouData | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchForYou = useCallback(async () => {
    try {
      const res = await fetch('/api/foryou');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setForyouData(data);
        }
      }
    } catch (err) {
      console.error('Failed to load For You data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForYou();
  }, [fetchForYou, cards]);

  const handleRecommendationAction = async (
    rec: ForYouRecommendation,
    action: 'CREATE_COLLECTION' | 'ADD_TO_COLLECTION' | 'DISMISS'
  ) => {
    setActionLoadingId(rec.id);
    try {
      const res = await fetch('/api/foryou/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          recommendationId: rec.id,
          name: rec.suggestedName,
          collectionId: rec.collectionId,
          collectionName: rec.suggestedName,
          cardIds: rec.cardIds,
        }),
      });

      if (res.ok) {
        // Optimistically remove from recommendations list
        setForyouData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            recommendations: prev.recommendations.filter(r => r.id !== rec.id),
          };
        });
        onRefreshData();
      }
    } catch (err) {
      console.error('Failed to process recommendation:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTaskToggle = (cardId: string, eventId: string) => {
    // Optimistic toggle in local list
    setForyouData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tasks: prev.tasks.map(t =>
          t.cardId === cardId && t.eventId === eventId
            ? { ...t, check: t.check === 1 ? 0 : 1 }
            : t
        ),
      };
    });
    onToggleTodo(cardId, eventId);
  };

  const tasks = foryouData?.tasks || [];
  const recommendations = foryouData?.recommendations || [];

  const filteredTasks = tasks.filter(t => {
    if (taskFilter === 'pending') return t.check === 0;
    if (taskFilter === 'completed') return t.check === 1;
    return true;
  });

  const pendingCount = tasks.filter(t => t.check === 0).length;
  const completedCount = tasks.filter(t => t.check === 1).length;

  // Format date helper
  const formatTaskTime = (timeMs?: number) => {
    if (!timeMs) return null;
    const d = new Date(timeMs);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    if (isToday) {
      return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get icon for parent card type
  const getCardTypeIcon = (type: string) => {
    switch (type) {
      case 'AUDIO':
        return <Mic size={11} className="text-nothing-red" />;
      case 'LINK':
        return <Bookmark size={11} className="text-blue-400" />;
      case 'IMAGE':
        return <ImageIcon size={11} className="text-amber-400" />;
      default:
        return <FileText size={11} className="text-nothing-gray" />;
    }
  };

  // Recent 6 active cards
  const recentCards = cards
    .filter(c => c.targetState === 0)
    .slice(0, 6);

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Header Overview & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-nothing-border/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-nothing-red animate-pulse" />
            <h2 className="font-dot text-lg font-semibold text-white tracking-wider">
              FOR YOU // OVERVIEW
            </h2>
          </div>
          <p className="text-xs font-mono text-nothing-gray mt-1">
            Intelligent collection recommendations and aggregated tasks from your Nothing captures
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-nothing-card border border-nothing-border flex items-center gap-2">
            <span className="text-nothing-gray">TASKS:</span>
            <span className="text-white font-semibold">{pendingCount}</span>
            <span className="text-nothing-gray/60">pending</span>
          </div>
          {recommendations.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-nothing-red/10 border border-nothing-red/30 flex items-center gap-1.5 text-nothing-red">
              <Sparkles size={12} />
              <span>{recommendations.length} SUGGESTIONS</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. SECTION 1: Smart Recommendations Carousel */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-nothing-red" />
            <h3 className="font-dot text-sm tracking-wider text-white uppercase font-medium">
              COLLECTION RECOMMENDATIONS
            </h3>
          </div>
          <span className="text-[11px] font-mono text-nothing-gray">
            {recommendations.length} available
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
            <div className="h-48 rounded-2xl bg-nothing-card/60 border border-nothing-border" />
            <div className="h-48 rounded-2xl bg-nothing-card/60 border border-nothing-border" />
          </div>
        ) : recommendations.length === 0 ? (
          <div className="p-6 rounded-2xl bg-nothing-card/30 border border-dashed border-nothing-border/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-nothing-border/30 text-nothing-gray">
                <FolderCheck size={18} />
              </div>
              <div>
                <p className="text-xs font-mono text-white">All collections are up to date</p>
                <p className="text-[11px] font-mono text-nothing-gray">
                  Nothing Space will automatically suggest new collections as you capture more notes.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map(rec => {
              const isLoading = actionLoadingId === rec.id;
              const isCreate = rec.type === 'CREATE_COLLECTION';

              return (
                <div
                  key={rec.id}
                  className="group relative flex flex-col justify-between p-5 rounded-2xl bg-nothing-card border border-nothing-border/80 hover:border-white/40 transition-all duration-200 shadow-lg hover:shadow-black/50"
                >
                  {/* Top Bar: Badge & Dismiss */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-nothing-red/15 border border-nothing-red/30 text-[10px] font-mono text-nothing-red uppercase tracking-wider">
                      <Sparkles size={10} />
                      <span>{isCreate ? 'NEW COLLECTION' : 'ADD TO EXISTING'}</span>
                    </div>

                    <button
                      onClick={() => handleRecommendationAction(rec, 'DISMISS')}
                      disabled={isLoading}
                      title="Dismiss suggestion"
                      className="p-1 rounded-lg text-nothing-gray/60 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Title & Reason */}
                  <div className="my-3">
                    <h4 className="font-dot text-sm text-white font-semibold tracking-wide">
                      {rec.title}
                    </h4>
                    {rec.reason && (
                      <p className="text-[11px] font-mono text-nothing-gray mt-1">
                        {rec.reason}
                      </p>
                    )}
                  </div>

                  {/* Fan Stack Previews (Stacked Cards) */}
                  <div className="relative h-20 my-2 flex items-center pl-2">
                    {rec.previewCards.map((prevCard, idx) => {
                      const rotation = idx === 0 ? '-rotate-3' : idx === 1 ? 'rotate-1 translate-x-4' : 'rotate-4 translate-x-8';
                      const zIndex = 30 - idx * 10;
                      return (
                        <div
                          key={prevCard.cardId}
                          onClick={() => {
                            const fullCard = cards.find(c => c.cardId === prevCard.cardId);
                            if (fullCard) onOpenCardDetail(fullCard);
                          }}
                          className={`absolute w-36 h-16 p-2 rounded-xl bg-black border border-nothing-border/90 shadow-md flex flex-col justify-between cursor-pointer hover:border-white transition-all transform ${rotation}`}
                          style={{ zIndex, left: `${idx * 28}px` }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-nothing-card text-nothing-gray border border-nothing-border">
                              {prevCard.type}
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-white/90 truncate">
                            {prevCard.title}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-nothing-border/60 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-nothing-gray">
                      {rec.cardIds.length} notes
                    </span>

                    <button
                      onClick={() =>
                        handleRecommendationAction(
                          rec,
                          isCreate ? 'CREATE_COLLECTION' : 'ADD_TO_COLLECTION'
                        )
                      }
                      disabled={isLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-nothing-hover text-black text-xs font-dot tracking-wider font-semibold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      {isCreate ? <FolderPlus size={13} /> : <Check size={13} />}
                      <span>{isCreate ? 'CREATE COLLECTION' : 'ADD ALL NOTES'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. SECTION 2: Tasks & Reminders from All Notes */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-nothing-red" />
            <h3 className="font-dot text-sm tracking-wider text-white uppercase font-medium">
              TASKS & REMINDERS FROM ALL NOTES
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-nothing-card border border-nothing-border text-[11px] font-mono text-nothing-gray">
              {pendingCount} pending
            </span>
          </div>

          {/* Sub-filter tabs */}
          <div className="flex items-center gap-1 bg-nothing-card p-1 rounded-full border border-nothing-border text-xs font-dot">
            <button
              onClick={() => setTaskFilter('pending')}
              className={`px-3 py-1 rounded-full transition-all ${
                taskFilter === 'pending'
                  ? 'bg-white text-black font-semibold'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              PENDING ({pendingCount})
            </button>
            <button
              onClick={() => setTaskFilter('completed')}
              className={`px-3 py-1 rounded-full transition-all ${
                taskFilter === 'completed'
                  ? 'bg-white text-black font-semibold'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              COMPLETED ({completedCount})
            </button>
            <button
              onClick={() => setTaskFilter('all')}
              className={`px-3 py-1 rounded-full transition-all ${
                taskFilter === 'all'
                  ? 'bg-white text-black font-semibold'
                  : 'text-nothing-gray hover:text-white'
              }`}
            >
              ALL ({tasks.length})
            </button>
          </div>
        </div>

        {/* Tasks List */}
        {filteredTasks.length === 0 ? (
          <div className="p-8 rounded-2xl bg-nothing-card/30 border border-dashed border-nothing-border/60 text-center">
            <div className="p-3 rounded-full bg-nothing-border/30 text-nothing-gray mx-auto w-fit mb-2">
              <Check size={20} />
            </div>
            <p className="text-xs font-dot text-white">NO TASKS IN THIS VIEW</p>
            <p className="text-[11px] font-mono text-nothing-gray mt-0.5">
              {taskFilter === 'pending'
                ? 'All tasks completed! Any to-do list extracted by Nothing AI will show here.'
                : 'No tasks match the selected filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTasks.map(task => {
              const isChecked = task.check === 1;
              const formattedTime = formatTaskTime(task.time);
              const parentCard = cards.find(c => c.cardId === task.cardId);

              return (
                <div
                  key={`${task.cardId}_${task.eventId}`}
                  className={`group p-4 rounded-2xl border transition-all duration-200 flex items-start justify-between gap-3 ${
                    isChecked
                      ? 'bg-nothing-card/40 border-nothing-border/40 opacity-70'
                      : 'bg-nothing-card border-nothing-border hover:border-white/40'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox button with Nothing style */}
                    <button
                      onClick={() => handleTaskToggle(task.cardId, task.eventId)}
                      className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all mt-0.5 ${
                        isChecked
                          ? 'bg-nothing-red border-nothing-red text-white'
                          : 'border-nothing-border bg-black hover:border-white'
                      }`}
                    >
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-mono font-medium leading-relaxed transition-all ${
                          isChecked ? 'line-through text-nothing-gray' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </p>

                      {task.content && (
                        <p className="text-[11px] font-mono text-nothing-gray mt-1 line-clamp-2">
                          {task.content}
                        </p>
                      )}

                      {/* Meta pills: time & parent card */}
                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {formattedTime && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nothing-red/10 border border-nothing-red/30 text-[10px] font-mono text-nothing-red">
                            <Clock size={10} />
                            <span>{formattedTime}</span>
                          </span>
                        )}

                        {parentCard && (
                          <button
                            onClick={() => onOpenCardDetail(parentCard)}
                            title="Open parent note"
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-nothing-border/40 hover:bg-white hover:text-black border border-nothing-border text-[10px] font-mono text-nothing-gray transition-colors"
                          >
                            {getCardTypeIcon(task.cardType)}
                            <span className="truncate max-w-[140px] sm:max-w-[200px]">
                              {task.cardTitle}
                            </span>
                            <ExternalLink size={9} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. SECTION 3: Recent Captures Grid */}
      <section className="space-y-4 pt-4 border-t border-nothing-border/60">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-dot text-sm tracking-wider text-white uppercase font-medium">
              RECENT CAPTURES
            </h3>
            <p className="text-[11px] font-mono text-nothing-gray">
              Latest notes and memories synced from Nothing Phone
            </p>
          </div>
        </div>

        <CardGrid
          cards={recentCards}
          isLoading={loading}
          onToggleTodo={onToggleTodo}
        />
      </section>
    </div>
  );
}
