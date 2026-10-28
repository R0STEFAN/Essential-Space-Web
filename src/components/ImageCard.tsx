'use client';

import { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Tag,
  Play,
  Pause,
  Maximize2,
  MapPin,
} from 'lucide-react';
import type { Card } from '@/types';

export default function ImageCard({
  card,
  activeTag,
  onSelectTag,
  onOpenDetail,
}: {
  card: Card;
  activeTag?: string;
  onSelectTag?: (tag: string) => void;
  onOpenDetail?: (card: Card) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(card.audio?.duration || 45);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={() => onOpenDetail?.(card)}
      className="nothing-card p-5 flex flex-col justify-between group cursor-pointer hover:border-nothing-red/50 transition-all"
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between text-xs text-nothing-gray font-mono mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-nothing-red/20 text-nothing-red">
              <ImageIcon size={14} />
            </span>
            <span className="font-dot">
              {card.audio?.audioUri ? 'CAPTURE + VOICE' : 'SCREENSHOT / CAPTURE'}
            </span>
            {card.collectionName && (
              <span className="px-2 py-0.5 rounded-full bg-nothing-hover border border-nothing-border text-[10px]">
                {card.collectionName}
              </span>
            )}
          </div>
          <span className="text-[11px]">{new Date(card.createTime).toLocaleDateString()}</span>
        </div>

        {/* Image preview */}
        {card.imageUrl && (
          <div className="relative w-full h-44 mb-3 rounded-xl overflow-hidden bg-nothing-black/80 border border-nothing-border/60 group-hover:border-nothing-red/40 transition-colors">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.imageUrl}
              alt={card.title || 'Captured Note'}
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>
        )}

        {/* Title */}
        {card.title && (
          <h3 className="font-medium text-white text-base mb-1.5 leading-snug line-clamp-2 group-hover:text-nothing-red transition-colors">
            {card.title}
          </h3>
        )}

        {/* Short AI Summary or Note Content */}
        {(card.summary || card.content) && (
          <p className="text-xs text-nothing-light/85 leading-relaxed font-sans mb-3 line-clamp-2">
            {card.summary || card.content}
          </p>
        )}

        {/* Compact Attached Voice Recording Player (for Screenshot + Voice notes) */}
        {card.audio?.audioUri && (
          <div
            onClick={e => e.stopPropagation()}
            className="bg-nothing-black/60 rounded-xl p-2.5 border border-nothing-border/60 mb-3"
          >
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-white text-black hover:bg-nothing-light flex items-center justify-center transition-transform active:scale-95 shadow-md flex-shrink-0"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>

              <div className="flex-1">
                <div className="flex items-center gap-1 h-4">
                  {[40, 70, 30, 90, 60, 80, 50, 100, 75, 45, 60, 85, 30, 95, 50, 70, 40, 80, 60, 40].map(
                    (h, i) => {
                      const isPassed = i / 20 <= currentTime / (duration || 45);
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-all duration-150 ${
                            isPassed ? 'bg-nothing-red' : 'bg-nothing-border'
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      );
                    }
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-nothing-gray font-mono mt-0.5">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 1 Extracted Key-Value Preview */}
        {card.infoExtract && card.infoExtract.length > 0 && (
          <div className="bg-nothing-hover/40 rounded-lg px-2.5 py-2 mb-2.5 border border-nothing-border/40 text-xs font-mono flex justify-between items-center">
            <span className="text-nothing-gray truncate mr-2">{card.infoExtract[0].title}:</span>
            <span className="text-white font-semibold truncate">{card.infoExtract[0].value}</span>
          </div>
        )}

        {/* Location Preview */}
        {card.locations && card.locations.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-nothing-gray mb-2.5 truncate">
            <MapPin size={12} className="text-nothing-red shrink-0" />
            <span className="truncate">{card.locations[0].locationName}</span>
          </div>
        )}

        {/* Tags (compact up to 4) */}
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
            {card.tags.length > 4 && (
              <span className="text-[10px] font-mono text-nothing-gray px-1.5 py-0.5">
                +{card.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 pt-2 border-t border-nothing-border/30 flex items-center justify-between text-[11px] text-nothing-gray font-mono">
        <span>
          {new Date(card.createTime).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <span className="text-nothing-light group-hover:text-nothing-red flex items-center gap-1 transition-colors">
          <span>Full Report</span>
          <Maximize2 size={11} />
        </span>
      </div>
    </div>
  );
}
