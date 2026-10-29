'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  CheckSquare,
  Clock,
  ExternalLink,
  Check,
  X,
  FolderPlus,
  FolderCheck,
  Mic,
  Bookmark,
  FileText,
  Image as ImageIcon,
  ListTodo,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Card, Collection } from '@/types';
import { computeForYouData, type ForYouTask, type ForYouRecommendation, type ForYouData } from '@/lib/foryou';
import { getDbDismissedSuggestions, dismissDbSuggestion, updateDbCard } from '@/lib/db';
import { createCloudCollection } from '@/lib/nothing-collections';
import { bulkAssignCollectionCloudCards, updateCloudCard } from '@/lib/nothing-cards';
import CardGrid from './CardGrid';

interface ForYouTabProps {
  cards: Card[];
  collections: Collection[];
  onToggleTodo: (cardId: string, eventId: string) => void;
  onRefreshData: () => void;
  onOpenCardDetail: (card: Card) => void;
  onNavigateToCollection: (collectionId: string) => void;
  token?: string;
  userId?: string;
}

export default function ForYouTab({
  cards,
  collections,
  onToggleTodo,
  onRefreshData,
  onOpenCardDetail,
  onNavigateToCollection,
  token,
  userId,
}: ForYouTabProps) {
  const [foryouData, setForyouData] = useState<ForYouData | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isAiTasksExpanded, setIsAiTasksExpanded] = useState<boolean>(false);

  const computeForYou = useCallback(async () => {
    try {
      const dismissed = await getDbDismissedSuggestions();
      const dismissedSet = new Set(dismissed);
      const computed = await computeForYouData(cards, collections, dismissedSet, token);
      setForyouData(computed);
    } catch (err) {
      console.error('Failed to compute For You data:', err);
    } finally {
      setLoading(false);
    }
  }, [cards, collections, token]);

  useEffect(() => {
    computeForYou();
  }, [computeForYou]);

  const handleRecommendationAction = async (
    rec: ForYouRecommendation,
    action: 'CREATE_COLLECTION' | 'ADD_TO_COLLECTION' | 'DISMISS'
  ) => {
    setActionLoadingId(rec.id);
    try {
      if (action === 'DISMISS') {
        await dismissDbSuggestion(rec.id);
      } else if (action === 'CREATE_COLLECTION') {
        await dismissDbSuggestion(rec.id);
        if (token && userId) {
          const createRes = await createCloudCollection(token, userId, rec.suggestedName);
          if (createRes.success && createRes.collection) {
            const targetCards = cards.filter(c => rec.cardIds.includes(c.cardId));
            await bulkAssignCollectionCloudCards(token, targetCards, createRes.collection.collectionId);
            for (const c of targetCards) {
              await updateDbCard(c.cardId, {
                collectionId: createRes.collection.collectionId,
                collectionName: createRes.collection.name,
              });
            }
          }
        }
      } else if (action === 'ADD_TO_COLLECTION') {
        await dismissDbSuggestion(rec.id);
        if (token && rec.collectionId) {
          const targetCards = cards.filter(c => rec.cardIds.includes(c.cardId));
          await bulkAssignCollectionCloudCards(token, targetCards, rec.collectionId);
          for (const c of targetCards) {
            await updateDbCard(c.cardId, {
              collectionId: rec.collectionId,
              collectionName: rec.suggestedName,
            });
          }
        }
      }

      setForyouData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          recommendations: prev.recommendations.filter(r => r.id !== rec.id),
        };
      });
      onRefreshData();
    } catch (err) {
      console.error('Failed to process recommendation:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTaskToggle = (cardId: string, eventId: string) => {
    onToggleTodo(cardId, eventId);
  };

  // Derive tasks reactively from parent cards state to avoid race conditions
  // Only include CONFIRMED tasks (isPotentialReminder !== true)
  const tasks = useMemo<ForYouTask[]>(() => {
    const activeCards = cards.filter(c => c.targetState === 0);
    const list: ForYouTask[] = [];
    for (const card of activeCards) {
      if (Array.isArray(card.events) && card.events.length > 0) {
        for (const ev of card.events) {
          if (!ev.title || ev.isPotentialReminder) continue;
          list.push({
            eventId: ev.eventId,
            cardId: card.cardId,
            title: ev.title,
            content: ev.content,
            check: ev.check === 1 ? 1 : 0,
            time: ev.time,
            isPotentialReminder: false,
            cardTitle: card.title || 'Untitled Note',
            cardType: card.type,
            cardCreateTime: card.createTime,
          });
        }
      }
    }
    list.sort((a, b) => {
      if (a.check !== b.check) return a.check - b.check;
      if (a.time && b.time) return a.time - b.time;
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return b.cardCreateTime - a.cardCreateTime;
    });
    return list;
  }, [cards]);

  // Collect unconfirmed AI suggestions (events where isPotentialReminder === true)
  const suggestedTasks = useMemo<ForYouTask[]>(() => {
    const activeCards = cards.filter(c => c.targetState === 0);
    const list: ForYouTask[] = [];
    for (const card of activeCards) {
      if (Array.isArray(card.events) && card.events.length > 0) {
        for (const ev of card.events) {
          if (!ev.title || !ev.isPotentialReminder || ev.check === 1) continue;
          list.push({
            eventId: ev.eventId,
            cardId: card.cardId,
            title: ev.title,
            content: ev.content,
            check: 0,
            time: ev.time,
            isPotentialReminder: true,
            cardTitle: card.title || 'Untitled Note',
            cardType: card.type,
            cardCreateTime: card.createTime,
          });
        }
      }
    }
    return list;
  }, [cards]);

  const handleAcceptTaskSuggestion = async (task: ForYouTask) => {
    const parentCard = cards.find(c => c.cardId === task.cardId);
    if (!parentCard || !parentCard.events) return;

    // Confirm task: set isPotentialReminder = false
    const updatedEvents = parentCard.events.map(e =>
      e.eventId === task.eventId ? { ...e, isPotentialReminder: false } : e
    );

    await updateDbCard(task.cardId, { events: updatedEvents });
    if (token) {
      updateCloudCard(token, { ...parentCard, events: updatedEvents }).catch(err =>
        console.warn('Sync confirmed task failed:', err)
      );
    }
    onRefreshData();
  };

  const handleDismissTaskSuggestion = async (task: ForYouTask) => {
    const parentCard = cards.find(c => c.cardId === task.cardId);
    if (!parentCard || !parentCard.events) return;

    // Dismiss: remove the potential reminder event from card
    const updatedEvents = parentCard.events.filter(e => e.eventId !== task.eventId);

    await updateDbCard(task.cardId, { events: updatedEvents });
    if (token) {
      updateCloudCard(token, { ...parentCard, events: updatedEvents }).catch(err =>
        console.warn('Sync dismissed task suggestion failed:', err)
      );
    }
    onRefreshData();
  };

  const recommendations = foryouData?.recommendations || [];

  // Group unique source lists (parent captures)
  const sourceLists = useMemo(() => {
    const map = new Map<
      string,
      { cardId: string; title: string; type: string; count: number; pendingCount: number }
    >();
    for (const t of tasks) {
      const existing = map.get(t.cardId);
      if (!existing) {
        map.set(t.cardId, {
          cardId: t.cardId,
          title: t.cardTitle,
          type: t.cardType,
          count: 1,
          pendingCount: t.check === 0 ? 1 : 0,
        });
      } else {
        existing.count++;
        if (t.check === 0) existing.pendingCount++;
      }
    }
    return Array.from(map.values());
  }, [tasks]);

  // Lists that have at least 1 UNCOMPLETED task (pendingCount > 0)
  const activeSourceLists = useMemo(() => {
    return sourceLists.filter(l => l.pendingCount > 0);
  }, [sourceLists]);

  // If selectedListId no longer has any pending tasks (in pending view), reset to all
  useEffect(() => {
    if (selectedListId && taskFilter === 'pending') {
      const current = activeSourceLists.find(l => l.cardId === selectedListId);
      if (!current) {
        setSelectedListId('');
      }
    }
  }, [activeSourceLists, selectedListId, taskFilter]);

  const filteredTasks = tasks.filter(t => {
    if (selectedListId && t.cardId !== selectedListId) return false;
    if (taskFilter === 'pending') return t.check === 0;
    if (taskFilter === 'completed') return t.check === 1;
    return true;
  });

  // Group tasks by their source list
  const groupedTasks = useMemo(() => {
    if (selectedListId) {
      const targetList = sourceLists.find(l => l.cardId === selectedListId);
      return [
        {
          cardId: selectedListId,
          title: targetList?.title || 'Tasks',
          type: targetList?.type || 'TODO',
          tasks: filteredTasks,
        },
      ];
    }

    const groups: Array<{
      cardId: string;
      title: string;
      type: string;
      tasks: ForYouTask[];
    }> = [];

    for (const list of sourceLists) {
      const listTasks = filteredTasks.filter(t => t.cardId === list.cardId);
      if (listTasks.length > 0) {
        groups.push({
          cardId: list.cardId,
          title: list.title,
          type: list.type,
          tasks: listTasks,
        });
      }
    }
    return groups;
  }, [filteredTasks, selectedListId, sourceLists]);

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
          {suggestedTasks.length > 0 && (
            <button
              onClick={() => setIsAiTasksExpanded(prev => !prev)}
              className="px-3 py-1.5 rounded-xl bg-nothing-red/10 hover:bg-nothing-red/20 border border-nothing-red/30 flex items-center gap-1.5 text-nothing-red transition-colors cursor-pointer"
            >
              <Sparkles size={12} />
              <span>{suggestedTasks.length} AI SUGGESTIONS</span>
              {isAiTasksExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
          {recommendations.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/20 flex items-center gap-1.5 text-white">
              <FolderPlus size={12} />
              <span>{recommendations.length} COLLECTIONS</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. SECTION 1: Tasks & Reminders from All Notes */}
      <section className="space-y-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

        {/* List / Categories Selector (Only show pills for lists that have UNCOMPLETED tasks) */}
        {activeSourceLists.length > 0 && (
          <div className="max-w-4xl mx-auto flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            <span className="text-[10px] font-mono text-nothing-gray uppercase shrink-0 mr-1 flex items-center gap-1">
              <ListTodo size={12} className="text-nothing-red" />
              <span>LISTS:</span>
            </span>

            <button
              onClick={() => setSelectedListId('')}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-all shrink-0 select-none ${
                selectedListId === ''
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'bg-nothing-card border border-nothing-border text-nothing-gray hover:text-white hover:border-white/40'
              }`}
            >
              All Lists ({pendingCount})
            </button>

            {activeSourceLists.map(list => {
              const isSelected = selectedListId === list.cardId;
              return (
                <button
                  key={list.cardId}
                  onClick={() => setSelectedListId(isSelected ? '' : list.cardId)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all shrink-0 select-none ${
                    isSelected
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'bg-nothing-card border border-nothing-border text-nothing-gray hover:text-white hover:border-white/40'
                  }`}
                >
                  {getCardTypeIcon(list.type)}
                  <span className="truncate max-w-[160px]">{list.title}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      isSelected
                        ? 'bg-black text-white'
                        : 'bg-nothing-border/60 text-nothing-gray'
                    }`}
                  >
                    {list.pendingCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tasks List - 1 Centered Column (Flat & compact list without bulky group headers) */}
        {filteredTasks.length === 0 ? (
          <div className="max-w-4xl mx-auto p-8 rounded-2xl bg-nothing-card/30 border border-dashed border-nothing-border/60 text-center">
            <div className="p-3 rounded-full bg-nothing-border/30 text-nothing-gray mx-auto w-fit mb-2">
              <Check size={20} />
            </div>
            <p className="text-xs font-dot text-white">NO TASKS IN THIS VIEW</p>
            <p className="text-[11px] font-mono text-nothing-gray mt-0.5">
              {taskFilter === 'pending'
                ? 'All tasks in this list completed! New items will appear here.'
                : 'No tasks match the selected filter.'}
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col gap-2 w-full">
            {filteredTasks.map(task => {
              const parentCard = cards.find(c => c.cardId === task.cardId);
              const isChecked = task.check === 1;
              const formattedTime = formatTaskTime(task.time);

              return (
                <div
                  key={`${task.cardId}_${task.eventId}`}
                  className={`group px-4 py-2.5 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isChecked
                      ? 'bg-nothing-card/40 border-nothing-border/40 opacity-70'
                      : 'bg-nothing-card border-nothing-border hover:border-white/40'
                  }`}
                >
                  {/* Left part: Checkbox + Title & Content */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      onClick={() => handleTaskToggle(task.cardId, task.eventId)}
                      className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isChecked
                          ? 'bg-nothing-red border-nothing-red text-white'
                          : 'border-nothing-border bg-black hover:border-white'
                      }`}
                    >
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </button>

                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5">
                      <p
                        className={`text-xs font-mono font-medium truncate ${
                          isChecked ? 'line-through text-nothing-gray' : 'text-white'
                        }`}
                      >
                        {task.title}
                      </p>

                      {task.content && task.content !== task.title && (
                        <span
                          className={`text-[11px] font-mono truncate ${
                            isChecked ? 'line-through text-nothing-gray/50' : 'text-nothing-gray'
                          }`}
                        >
                          {task.content}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right part: Meta badges (Time + Parent Note pill) */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-8 sm:pl-0">
                    {formattedTime && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-nothing-red/10 border border-nothing-red/30 text-[10px] font-mono text-nothing-red whitespace-nowrap">
                        <Clock size={10} />
                        <span>{formattedTime}</span>
                      </span>
                    )}

                    {parentCard && (
                      <button
                        onClick={() => onOpenCardDetail(parentCard)}
                        title="Open parent note"
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-nothing-border/40 hover:bg-white hover:text-black border border-nothing-border text-[10px] font-mono text-nothing-gray transition-colors whitespace-nowrap"
                      >
                        {getCardTypeIcon(task.cardType)}
                        <span className="truncate max-w-[120px] sm:max-w-[160px]">
                          {task.cardTitle}
                        </span>
                        <ExternalLink size={9} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI Task Suggestions Box - Placed BELOW active tasks, collapsed by default */}
        {suggestedTasks.length > 0 && (
          <div className="max-w-4xl mx-auto rounded-2xl bg-nothing-card/80 border border-nothing-red/30 transition-all overflow-hidden mt-6">
            {/* Header row with EXPAND / COLLAPSE toggle */}
            <div
              onClick={() => setIsAiTasksExpanded(prev => !prev)}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles size={14} className="text-nothing-red animate-pulse shrink-0" />
                <h4 className="font-dot text-xs text-white uppercase tracking-wider font-medium">
                  AI TASK SUGGESTIONS ({suggestedTasks.length})
                </h4>
                <span className="hidden sm:inline text-[10px] font-mono text-nothing-gray">
                  • Review and confirm before adding to tasks
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAiTasksExpanded(prev => !prev);
                  }}
                  className="px-2.5 py-1 rounded-full bg-nothing-border/40 hover:bg-white hover:text-black border border-nothing-border text-[10px] font-mono text-nothing-gray transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{isAiTasksExpanded ? 'COLLAPSE' : 'EXPAND'}</span>
                  {isAiTasksExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            {/* Suggestions list (only visible when expanded) */}
            {isAiTasksExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-nothing-border/40 space-y-2">
                {suggestedTasks.map(task => {
                  const parentCard = cards.find(c => c.cardId === task.cardId);
                  return (
                    <div
                      key={`sug_${task.cardId}_${task.eventId}`}
                      className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 rounded-xl bg-black/60 border border-nothing-border hover:border-nothing-red/40 transition-colors"
                    >
                      {/* Left: Sparkles + Title (full, not truncated) + Content */}
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <Sparkles size={13} className="text-nothing-red/80 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                          <p className="text-xs font-mono text-white font-medium break-words leading-relaxed">
                            {task.title}
                          </p>
                          {task.content && task.content !== task.title && (
                            <p className="text-[11px] font-mono text-nothing-gray break-words leading-relaxed">
                              {task.content}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Note pill + ADD + DISMISS */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pl-6 sm:pl-0">
                        {parentCard && (
                          <button
                            onClick={() => onOpenCardDetail(parentCard)}
                            title="Open note"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-nothing-border/40 hover:bg-white hover:text-black text-[10px] font-mono text-nothing-gray transition-colors whitespace-nowrap max-w-[150px]"
                          >
                            {getCardTypeIcon(task.cardType)}
                            <span className="truncate">{task.cardTitle}</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleAcceptTaskSuggestion(task)}
                          className="px-3 py-1 rounded-full bg-white hover:bg-neutral-200 text-black text-[10px] font-mono font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Check size={10} strokeWidth={3} />
                          <span>ADD</span>
                        </button>
                        <button
                          onClick={() => handleDismissTaskSuggestion(task)}
                          title="Dismiss suggestion"
                          className="p-1 rounded-full text-nothing-gray hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. SECTION 2: Smart Recommendations Carousel */}
      <section className="space-y-4 pt-6 border-t border-nothing-border/60">
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

                  {/* Fan Stack Previews (Stacked Cards with Visual Previews) */}
                  <div className="relative h-24 my-2 flex items-center pl-1 overflow-visible">
                    {rec.previewCards.map((prevCard, idx) => {
                      const fullCard = cards.find(c => c.cardId === prevCard.cardId);
                      const previewImg =
                        prevCard.imageUrl || fullCard?.imageUrl || fullCard?.link?.preview;
                      const rotation =
                        idx === 0
                          ? '-rotate-3 hover:-rotate-1'
                          : idx === 1
                          ? 'rotate-1 translate-x-2'
                          : 'rotate-5 translate-x-4';
                      const zIndex = 30 - idx * 10;

                      return (
                        <div
                          key={prevCard.cardId}
                          onClick={() => {
                            if (fullCard) onOpenCardDetail(fullCard);
                          }}
                          className={`group/stack absolute w-36 sm:w-40 h-20 rounded-xl bg-black border border-white/20 shadow-lg flex flex-col justify-between cursor-pointer hover:border-white hover:z-40 transition-all duration-200 transform ${rotation} overflow-hidden`}
                          style={{ zIndex, left: `${idx * 32}px` }}
                        >
                          {/* Image preview or dark gradient */}
                          {previewImg ? (
                            <div className="absolute inset-0 w-full h-full overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={previewImg}
                                alt={prevCard.title || 'Preview'}
                                className="w-full h-full object-cover object-center group-hover/stack:scale-105 transition-transform duration-300"
                                onError={e => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/25 pointer-events-none" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 to-black pointer-events-none" />
                          )}

                          {/* Content Overlay */}
                          <div className="relative z-10 p-2 flex flex-col justify-between h-full">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-nothing-gray border border-white/10 shadow-sm">
                                {getCardTypeIcon(prevCard.type)}
                                <span className="tracking-wider">{prevCard.type}</span>
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-white/95 font-medium truncate drop-shadow-md">
                              {prevCard.title || 'Untitled Note'}
                            </p>
                          </div>
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
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black text-xs font-dot tracking-wider font-semibold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shadow-sm"
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
