'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Mic,
  Image as ImageIcon,
  Bookmark,
  FileText,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Copy,
  Check,
  ExternalLink,
  MapPin,
  Sparkles,
  Tag,
  Users,
  ChevronDown,
  ChevronUp,
  Folder,
  Maximize2,
  Trash2,
} from 'lucide-react';
import type { Card } from '@/types';
import { useScrollLock } from '@/lib/useScrollLock';

interface CardDetailModalProps {
  card: Card | null;
  onClose: () => void;
  activeTag?: string;
  onSelectTag?: (tag: string) => void;
  onToggleTodo?: (cardId: string, eventId: string) => void;
  onRestoreCard?: (cardId: string) => void;
  onDeleteCard?: (cardId: string) => void;
}

export default function CardDetailModal({
  card,
  onClose,
  activeTag,
  onSelectTag,
  onToggleTodo,
  onRestoreCard,
  onDeleteCard,
}: CardDetailModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [duration, setDuration] = useState(card?.audio?.duration || 45);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedInfoIdx, setCopiedInfoIdx] = useState<number | null>(null);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Lock background page scroll while modal is open
  useScrollLock(Boolean(card));

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(card?.audio?.duration || 45);
    setIsImageZoomed(false);
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImageZoomed) {
          setIsImageZoomed(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card, isImageZoomed, onClose]);

  if (!card) return null;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekAudio = (targetSeconds: number) => {
    if (!audioRef.current) return;
    const clamped = Math.max(0, Math.min(duration || 45, targetSeconds));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const skipSeconds = (delta: number) => {
    seekAudio(currentTime + delta);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyTranscript = () => {
    if (!card.audio?.transcript) return;
    navigator.clipboard.writeText(card.audio.transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const copyInfoValue = (val: string, idx: number) => {
    navigator.clipboard.writeText(val);
    setCopiedInfoIdx(idx);
    setTimeout(() => setCopiedInfoIdx(null), 1500);
  };

  const previewImg = card.cachedImageUrl || card.imageUrl || card.link?.preview;
  const candidateUrl =
    card.link?.url ||
    (card.audio?.transcript?.startsWith('http') ? card.audio.transcript.trim() : undefined);

  const formatDateTimeRange = () => {
    const d = new Date(card.createTime);
    const dateStr = d.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (card.audio?.startTime && card.audio?.endTime) {
      const startStr = new Date(card.audio.startTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const endStr = new Date(card.audio.endTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${dateStr} • ${startStr} - ${endStr}`;
    }
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} • ${timeStr}`;
  };

  const highlightMarks = card.audio?.highlightTimestamps || [];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#111111] border border-nothing-border shadow-2xl p-5 sm:p-7 space-y-4 text-white"
      >
        {/* Top Header Card */}
        <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-lg bg-nothing-red/20 text-nothing-red">
                {card.type === 'AUDIO' ? (
                  <Mic size={15} />
                ) : card.type === 'LINK' ? (
                  <Bookmark size={15} />
                ) : card.type === 'IMAGE' ? (
                  <ImageIcon size={15} />
                ) : (
                  <FileText size={15} />
                )}
              </span>
              <span className="font-dot text-xs text-nothing-gray tracking-wider uppercase">
                {card.type === 'AUDIO'
                  ? card.imageUrl
                    ? 'VOICE + PHOTO REPORT'
                    : 'VOICE MEMO REPORT'
                  : card.type === 'IMAGE' && card.audio?.audioUri
                    ? 'CAPTURE + VOICE REPORT'
                    : `${card.type} NOTE`}
              </span>
              {card.collectionName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-nothing-hover border border-nothing-border text-[11px] font-mono text-white">
                  <Folder size={11} className="text-nothing-red" />
                  {card.collectionName}
                </span>
              )}
              {card.captureFrom && (
                <span className="px-2 py-0.5 rounded-full bg-black/50 border border-nothing-border/60 text-[10px] font-mono text-nothing-gray">
                  via {card.captureFrom}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-black/60 text-nothing-gray hover:text-white border border-nothing-border hover:border-white/40 transition-colors shrink-0"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="font-dot text-lg sm:text-xl text-white uppercase tracking-wide leading-snug mb-1.5">
            {card.title || 'Untitled Note'}
          </h2>

          <p className="text-xs font-mono text-nothing-gray">{formatDateTimeRange()}</p>

          {/* Speakers bar (matching Nothing OS S1 / S2 expandable speakers section) */}
          {card.speakers && card.speakers.length > 0 && (
            <div className="mt-4 pt-3 border-t border-nothing-border/50">
              <button
                type="button"
                onClick={() => setShowSpeakers(!showSpeakers)}
                className="w-full flex items-center justify-between text-xs text-nothing-gray hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {card.speakers.map((sp, i) => (
                      <span
                        key={i}
                        className="w-6 h-6 rounded-full bg-nothing-light text-black font-dot text-[10px] flex items-center justify-center border border-[#1A1A1A] font-bold"
                      >
                        S{i + 1}
                      </span>
                    ))}
                  </div>
                  <span className="font-mono text-[11px]">
                    {card.speakers.length} {card.speakers.length === 1 ? 'Speaker' : 'Speakers'}{' '}
                    detected
                  </span>
                </div>
                {showSpeakers ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {showSpeakers && (
                <div className="mt-3 space-y-2">
                  {card.speakers.map((sp, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-black/50 border border-nothing-border/40 text-xs"
                    >
                      <div className="flex items-center gap-1.5 font-mono text-nothing-red mb-0.5">
                        <Users size={12} />
                        <span className="font-semibold">{sp.speakerId || `Speaker ${idx + 1}`}</span>
                      </div>
                      {sp.description && (
                        <p className="text-nothing-light/85 leading-relaxed">{sp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Image / Link Preview Section */}
        {previewImg && !imgError && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 overflow-hidden">
            <div
              onClick={() => setIsImageZoomed(true)}
              className="relative w-full max-h-80 bg-black flex items-center justify-center cursor-zoom-in group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImg}
                alt={card.title || 'Preview'}
                onError={() => setImgError(true)}
                className="max-h-80 w-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              />
              <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/75 border border-nothing-border text-[11px] font-mono text-white flex items-center gap-1.5">
                <Maximize2 size={12} /> Full Screen
              </span>
            </div>
          </div>
        )}
        {previewImg && imgError && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-dashed border-nothing-border/60 p-5 flex flex-col items-center justify-center gap-2 text-center text-nothing-gray">
            <ImageIcon size={28} className="text-nothing-gray/50" />
            <p className="text-xs font-mono text-nothing-light">
              {card.targetState === 1
                ? 'Cloud photo preview was purged when note was moved to trash.'
                : 'Photo preview is currently unavailable in cloud storage.'}
            </p>
            {card.targetState === 1 && (
              <p className="text-[11px] font-mono text-nothing-gray">
                The original photo remains safe on your Nothing Phone. Restoring this note will re-sync it with the cloud.
              </p>
            )}
          </div>
        )}

        {/* Website Link Bar (for LINK cards) */}
        {candidateUrl && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {card.link?.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.link.favicon}
                  alt=""
                  className="w-7 h-7 rounded-lg bg-black p-1 border border-nothing-border shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-nothing-red/20 text-nothing-red flex items-center justify-center shrink-0">
                  <Bookmark size={14} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {card.link?.siteName || card.link?.domain || candidateUrl}
                </p>
                <p className="text-[11px] font-mono text-nothing-gray truncate">{candidateUrl}</p>
              </div>
            </div>
            <a
              href={candidateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-nothing-red text-white text-xs font-dot uppercase tracking-wider hover:bg-white hover:text-black transition-colors flex items-center gap-1.5 shrink-0"
            >
              <span>Open Site</span>
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        {/* Audio Player + Transcript / User Note Card (matching Nothing OS screenshot) */}
        {(card.audio?.audioUri ||
          card.audio?.transcript ||
          (card.content && card.summary && card.content !== card.summary)) && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-4">
            {/* Transcript / User Note Section */}
            {(card.audio?.transcript ||
              (card.content && card.summary && card.content !== card.summary)) && (
              <div className="rounded-xl bg-[#242424] border border-nothing-border/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-nothing-gray uppercase tracking-wider">
                    {card.audio?.audioUri
                      ? 'Розшифровка / Full Transcription'
                      : 'Розшифровка / Full Transcription'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const textToCopy =
                        card.audio?.transcript ||
                        (card.content && card.summary && card.content !== card.summary
                          ? card.content
                          : '');
                      if (!textToCopy) return;
                      navigator.clipboard.writeText(textToCopy);
                      setCopiedTranscript(true);
                      setTimeout(() => setCopiedTranscript(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-nothing-gray hover:text-white px-2 py-0.5 rounded bg-black/40 border border-nothing-border/50 transition-colors"
                  >
                    {copiedTranscript ? (
                      <>
                        <Check size={12} className="text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-white/95 leading-relaxed whitespace-pre-line">
                  {card.audio?.transcript || card.content}
                </p>
              </div>
            )}

            {/* Audio Timeline & Controls */}
            {card.audio?.audioUri && (
              <div>
                <audio
                  ref={audioRef}
                  src={card.audio.audioUri}
                  onLoadedMetadata={() => {
                    if (audioRef.current?.duration && isFinite(audioRef.current.duration)) {
                      setDuration(audioRef.current.duration);
                    }
                  }}
                  onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                  onEnded={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                />

                {/* Interactive Timeline with Yellow Highlight Dots */}
                <div
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekAudio(ratio * (duration || 45));
                  }}
                  className="relative h-2 w-full rounded-full bg-nothing-border cursor-pointer my-3 flex items-center"
                >
                  {/* Progress Fill */}
                  <div
                    className="h-full rounded-full bg-white transition-all duration-100"
                    style={{
                      width: `${Math.min(100, (currentTime / (duration || 45)) * 100)}%`,
                    }}
                  />
                  {/* Playhead thumb */}
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-md -translate-x-1/2"
                    style={{
                      left: `${Math.min(100, (currentTime / (duration || 45)) * 100)}%`,
                    }}
                  />
                  {/* Yellow Highlight Bookmark Dots (from Nothing Key presses during recording) */}
                  {highlightMarks.map((markSec, idx) => {
                    const pct = Math.min(100, Math.max(0, (markSec / (duration || 45)) * 100));
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          seekAudio(markSec);
                        }}
                        title={`Jump to highlighted moment (${formatTime(markSec)})`}
                        className="absolute w-2.5 h-2.5 rounded-full bg-yellow-400 border border-black shadow -translate-x-1/2 hover:scale-125 transition-transform"
                        style={{ left: `${pct}%` }}
                      />
                    );
                  })}
                </div>

                <div className="flex justify-between text-[11px] font-mono text-nothing-gray mb-3">
                  <span>{formatTime(currentTime)}</span>
                  {highlightMarks.length > 0 && (
                    <span className="text-yellow-400/90">
                      ★ {highlightMarks.map(m => formatTime(m)).join(', ')}
                    </span>
                  )}
                  <span>{formatTime(duration)}</span>
                </div>

                {/* Controls: -10s, Play/Pause, +10s */}
                <div className="flex items-center justify-between px-4 sm:px-12">
                  <button
                    type="button"
                    onClick={() => skipSeconds(-10)}
                    className="p-2 rounded-full text-nothing-gray hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 text-xs font-mono"
                    title="Rewind 10 seconds"
                  >
                    <RotateCcw size={18} />
                    <span>10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-white text-black hover:bg-nothing-red hover:text-white flex items-center justify-center transition-all shadow-lg"
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => skipSeconds(10)}
                    className="p-2 rounded-full text-nothing-gray hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 text-xs font-mono"
                    title="Forward 10 seconds"
                  >
                    <span>10s</span>
                    <RotateCw size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary Section */}
        {(card.summary || card.content || card.emotionalSummary) && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-2">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              {card.summary ? 'SUMMARY' : 'DESCRIPTION'}
            </h3>
            <p className="text-sm text-white/95 leading-relaxed">
              {card.summary || card.content}
            </p>
            {card.emotionalSummary && card.emotionalSummary !== card.summary && (
              <p className="text-xs text-nothing-gray font-mono pt-1 border-t border-nothing-border/40">
                Context: {card.emotionalSummary}
              </p>
            )}
          </div>
        )}

        {/* Tasks Checklist (card_events) */}
        {card.events && card.events.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-3">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              TASKS ({card.events.filter(e => e.check === 1 && !e.isPotentialReminder).length}/{card.events.filter(e => !e.isPotentialReminder).length})
            </h3>
            <div className="space-y-2">
              {card.events.map(ev => {
                const isDone = ev.check === 1;
                const isSuggestion = Boolean(ev.isPotentialReminder);
                return (
                  <button
                    key={ev.eventId}
                    type="button"
                    onClick={() => onToggleTodo?.(card.cardId, ev.eventId)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      isDone
                        ? 'bg-black/30 border-nothing-border/30 opacity-60'
                        : isSuggestion
                        ? 'bg-black/50 border-nothing-red/30 hover:border-nothing-red/60'
                        : 'bg-black/50 border-nothing-border/60 hover:border-nothing-red/50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                        isDone
                          ? 'bg-nothing-red border-nothing-red text-white'
                          : isSuggestion
                          ? 'border-nothing-red/60 text-nothing-red'
                          : 'border-nothing-gray/70'
                      }`}
                    >
                      {isDone && <Check size={11} />}
                      {!isDone && isSuggestion && <Sparkles size={10} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-xs sm:text-sm font-medium ${
                            isDone ? 'line-through text-nothing-gray' : 'text-white'
                          }`}
                        >
                          {ev.title}
                        </p>
                        {isSuggestion && !isDone && (
                          <span className="px-1.5 py-0.5 rounded bg-nothing-red/15 text-nothing-red text-[9px] font-mono tracking-wider font-semibold">
                            AI SUGGESTION
                          </span>
                        )}
                      </div>
                      {ev.content && (
                        <p className="text-xs text-nothing-gray mt-0.5">{ev.content}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Key Moments (MEETING_KEY_TOPIC_ANALYSIS) */}
        {card.keyTopics && card.keyTopics.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-3">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              KEY MOMENTS
            </h3>
            <div className="space-y-4">
              {card.keyTopics.map((kt, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-white">{kt.title}</h4>
                    {kt.timestampReference && (
                      <span className="px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/40 text-yellow-300 text-[11px] font-mono">
                        ⏱ {kt.timestampReference}
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-2 text-xs sm:text-sm text-nothing-light/90 leading-relaxed">
                    <span className="text-nothing-red mt-1">•</span>
                    <p>{kt.detailedSummary}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Topics (MEETING_MAIN_TOPIC) */}
        {card.mainTopics && card.mainTopics.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-4">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              MAIN TOPICS
            </h3>
            <div className="space-y-4">
              {card.mainTopics.map((topic, idx) => (
                <div key={idx} className="space-y-1.5">
                  <h4 className="text-sm font-semibold text-white">{topic.title}</h4>
                  <div className="flex items-start gap-2 text-xs sm:text-sm text-nothing-light/90 leading-relaxed">
                    <span className="text-nothing-red mt-1">•</span>
                    <p>{topic.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted Information / Key Values (INFO_EXTRACT) */}
        {card.infoExtract && card.infoExtract.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-2.5">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              EXTRACTED INFO
            </h3>
            <div className="space-y-2">
              {card.infoExtract.map((info, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/50 border border-nothing-border/50 text-xs font-mono"
                >
                  <span className="text-nothing-gray">{info.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm">{info.value}</span>
                    <button
                      type="button"
                      onClick={() => copyInfoValue(info.value, idx)}
                      className="p-1 rounded hover:bg-nothing-hover text-nothing-gray hover:text-white transition-colors"
                      title="Copy value"
                    >
                      {copiedInfoIdx === idx ? (
                        <Check size={13} className="text-green-400" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bullet Points (BULLET_POINTS) */}
        {card.bulletPoints && card.bulletPoints.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-3">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              {card.bulletPointsTitle || 'KEY BULLET POINTS'}
            </h3>
            <div className="space-y-2">
              {card.bulletPoints.map((pt, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 text-xs sm:text-sm text-nothing-light/90 leading-relaxed"
                >
                  <span className="text-nothing-red mt-1">•</span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locations (LOCATION) */}
        {card.locations && card.locations.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-2.5">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              LOCATION
            </h3>
            {card.locations.map((loc, idx) => (
              <a
                key={idx}
                href={
                  loc.locationUrl ||
                  `https://maps.google.com/?q=${encodeURIComponent(loc.locationName)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/50 border border-nothing-border/50 hover:border-nothing-red/50 transition-colors text-xs"
              >
                <div className="flex items-center gap-2.5 text-white">
                  <MapPin size={15} className="text-nothing-red shrink-0" />
                  <span>{loc.locationName}</span>
                </div>
                <ExternalLink size={13} className="text-nothing-gray shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Freeform AI Insights (FREEFORM) */}
        {card.freeformInsights && card.freeformInsights.length > 0 && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-1.5 font-dot text-xs text-nothing-red uppercase tracking-wider">
              <Sparkles size={13} />
              <span>ESSENTIAL AI INSIGHT</span>
            </div>
            {card.freeformInsights.map((ins, idx) => (
              <div key={idx} className="space-y-2">
                {ins.title && <h4 className="text-sm font-medium text-white">{ins.title}</h4>}
                {ins.content && (
                  <p className="text-xs sm:text-sm text-nothing-light/85 leading-relaxed">
                    {ins.content}
                  </p>
                )}
                {ins.nextActions && ins.nextActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ins.nextActions.map((na, naIdx) => (
                      <span
                        key={naIdx}
                        title={na.prompt}
                        className="px-2.5 py-1 rounded-lg bg-black/50 border border-nothing-border/60 text-[11px] font-mono text-nothing-gray"
                      >
                        ✦ {na.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tags & Collection Footer */}
        {((card.tags && card.tags.length > 0) || card.collectionName) && (
          <div className="rounded-2xl bg-[#1A1A1A] border border-nothing-border/60 p-4 sm:p-5 space-y-3">
            <h3 className="font-dot text-xs text-nothing-gray uppercase tracking-wider">
              COLLECTIONS & TAGS
            </h3>
            <div className="flex flex-wrap gap-2">
              {card.collectionName && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-nothing-hover border border-nothing-border text-xs font-mono text-white">
                  <Folder size={12} className="text-nothing-red" />
                  {card.collectionName}
                </span>
              )}
              {card.tags?.map((tag, idx) => {
                const isSelected = activeTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectTag?.(isSelected ? '' : tag);
                      onClose();
                    }}
                    className={`inline-flex items-center gap-1 text-xs font-mono px-3 py-1 rounded-full border transition-all ${
                      isSelected
                        ? 'bg-nothing-red text-white border-nothing-red'
                        : 'bg-black/60 border-nothing-border text-nothing-gray hover:text-white'
                    }`}
                  >
                    <Tag size={10} />
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trash Notice & Actions (at bottom of note) */}
        {card.targetState === 1 && (
          <div className="sticky bottom-0 z-20 rounded-2xl bg-red-950/90 border border-red-800/60 p-3.5 sm:p-4 flex items-center justify-between gap-3 flex-wrap backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2 text-xs font-mono text-red-200">
              <Trash2 size={16} className="text-nothing-red shrink-0" />
              <span>This note is in the trash</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onRestoreCard && (
                <button
                  type="button"
                  onClick={() => {
                    onRestoreCard(card.cardId);
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-neutral-200 transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 font-medium shadow-sm"
                  title="Restore note from trash"
                >
                  <RotateCcw size={13} />
                  <span>Restore</span>
                </button>
              )}
              {onDeleteCard && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCard(card.cardId);
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-900/60 hover:bg-nothing-red text-white transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 border border-red-700/50"
                  title="Permanently delete note"
                >
                  <Trash2 size={13} />
                  <span>Delete Forever</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Image Lightbox when clicking image inside modal */}
      {isImageZoomed && previewImg && (
        <div
          onClick={e => {
            e.stopPropagation();
            setIsImageZoomed(false);
          }}
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImg}
            alt={card.title || 'Full Image'}
            className="max-h-[85vh] w-auto rounded-xl object-contain border border-nothing-border"
          />
          <div className="flex items-center gap-4 mt-3">
            <a
              href={previewImg}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs font-mono text-nothing-red hover:underline flex items-center gap-1"
            >
              <ExternalLink size={12} /> Open original in new tab
            </a>
            <span className="text-xs font-mono text-nothing-gray">• Click anywhere to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
