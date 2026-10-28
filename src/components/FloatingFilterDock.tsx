'use client';

import { Layers, Image as ImageIcon, Mic, CheckSquare, Bookmark, FileText, Trash2 } from 'lucide-react';

interface FloatingFilterDockProps {
  activeType: string;
  isTrash: boolean;
  onSelectType: (type: string) => void;
  onToggleTrash: () => void;
}

export default function FloatingFilterDock({
  activeType,
  isTrash,
  onSelectType,
  onToggleTrash,
}: FloatingFilterDockProps) {
  const filterItems = [
    { id: '', label: 'ALL', icon: Layers },
    { id: 'IMAGE', label: 'CAPTURES', icon: ImageIcon },
    { id: 'AUDIO', label: 'VOICE', icon: Mic },
    { id: 'TODO', label: 'TASKS', icon: CheckSquare },
    { id: 'LINK', label: 'LINKS', icon: Bookmark },
    { id: 'TEXT', label: 'NOTES', icon: FileText },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] pointer-events-auto">
      <div className="flex items-center gap-1 bg-black/85 backdrop-blur-xl border border-nothing-border/80 px-2 py-1.5 rounded-full shadow-2xl shadow-black/90 transition-all duration-300 hover:border-white/30">
        {filterItems.map(item => {
          const Icon = item.icon;
          const isActive = !isTrash && activeType === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (isTrash) onToggleTrash();
                onSelectType(item.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-dot tracking-wider transition-all duration-200 select-none ${
                isActive
                  ? 'bg-white text-black font-semibold shadow-md scale-[1.02]'
                  : 'text-nothing-gray hover:text-white hover:bg-nothing-hover/40'
              }`}
            >
              <Icon size={13} className={isActive ? 'text-black' : ''} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}

        <div className="w-[1px] h-4 bg-nothing-border/80 mx-1" />

        {/* Trash / Bin */}
        <button
          onClick={onToggleTrash}
          title="Bin / Trash"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-dot tracking-wider transition-all duration-200 select-none ${
            isTrash
              ? 'bg-nothing-red text-white font-semibold shadow-md scale-[1.02]'
              : 'text-nothing-gray hover:text-nothing-red hover:bg-nothing-hover/40'
          }`}
        >
          <Trash2 size={13} />
          <span className="hidden sm:inline">BIN</span>
        </button>
      </div>
    </div>
  );
}
