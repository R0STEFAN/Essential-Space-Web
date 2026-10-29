'use client';

import {
  FolderPlus,
  Trash2,
  RotateCcw,
  X,
  CheckSquare,
  Square,
  Loader2,
  Folder,
} from 'lucide-react';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  isTrash: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenAssignCollection: () => void;
  onDeleteSelected: () => void;
  onRestoreSelected?: () => void;
  isProcessing?: boolean;
}

export default function BulkActionBar({
  selectedCount,
  totalCount,
  isAllSelected,
  isTrash,
  onSelectAll,
  onClearSelection,
  onOpenAssignCollection,
  onDeleteSelected,
  onRestoreSelected,
  isProcessing = false,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] sm:max-w-2xl w-full px-2 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="bg-[#121212]/95 backdrop-blur-xl border border-nothing-border shadow-[0_16px_50px_rgba(0,0,0,0.9)] rounded-2xl p-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Counter and Select All toggle */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="px-2.5 py-1 rounded-lg bg-nothing-red/20 border border-nothing-red/40 text-nothing-red font-dot text-xs uppercase tracking-wider shrink-0">
            {selectedCount} SELECTED
          </div>

          <button
            type="button"
            onClick={onSelectAll}
            className="flex items-center gap-1.5 text-xs font-mono text-nothing-gray hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/5 truncate"
          >
            {isAllSelected ? (
              <>
                <CheckSquare size={13} className="text-nothing-red shrink-0" />
                <span className="hidden sm:inline">Deselect All</span>
              </>
            ) : (
              <>
                <Square size={13} className="shrink-0" />
                <span className="hidden sm:inline">Select All ({totalCount})</span>
                <span className="sm:hidden">All ({totalCount})</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isTrash ? (
            <>
              {onRestoreSelected && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onRestoreSelected}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 font-medium shadow-sm"
                  title="Restore from trash"
                >
                  {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  <span>Restore</span>
                </button>
              )}
              <button
                type="button"
                disabled={isProcessing}
                onClick={onDeleteSelected}
                className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-nothing-red text-red-300 hover:text-white border border-red-800/40 hover:border-nothing-red transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                title="Delete permanently"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Delete Permanently</span>
                <span className="sm:hidden">Delete</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isProcessing}
                onClick={onOpenAssignCollection}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-black transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                title="Add to collection"
              >
                <FolderPlus size={13} />
                <span className="hidden sm:inline">Collection</span>
                <span className="sm:hidden">Collection</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={onDeleteSelected}
                className="px-3 py-1.5 rounded-xl bg-nothing-red/20 hover:bg-nothing-red text-nothing-red hover:text-white border border-nothing-red/40 hover:border-nothing-red transition-all text-xs font-dot uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
                title="Move to trash"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Move to Trash</span>
                <span className="sm:hidden">Trash</span>
              </button>
            </>
          )}

          <div className="w-px h-5 bg-nothing-border/60 mx-0.5 sm:mx-1" />

          {/* Cancel button */}
          <button
            type="button"
            onClick={onClearSelection}
            className="p-1.5 rounded-xl text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
            title="Cancel selection"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
