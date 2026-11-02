/**
 * Utility functions for extracting images from Clipboard and Drag-and-Drop events.
 */

/**
 * Checks if a DataTransfer object (from ClipboardEvent or DragEvent) contains an image.
 */
export function hasImageInClipboard(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;

  // 1. Check DataTransferItemList (standard for clipboard paste)
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.type.startsWith('image/')) {
        return true;
      }
    }
  }

  // 2. Fall back to FileList (for dragged files or copied OS files)
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type.startsWith('image/')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extracts the first image File from a DataTransfer object (from ClipboardEvent or DragEvent).
 * Returns null if no image is present.
 */
export function extractImageFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined
): File | null {
  if (!dataTransfer) return null;

  // 1. Check DataTransferItemList (standard for clipboard paste in modern browsers)
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
  }

  // 2. Fall back to FileList (standard for file drop and OS clipboard files)
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type.startsWith('image/')) {
        return file;
      }
    }
  }

  return null;
}
