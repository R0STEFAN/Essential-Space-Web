import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractImageFromDataTransfer, hasImageInClipboard } from './clipboard.ts';

describe('Clipboard & Drag-Drop Image Extraction', () => {
  test('returns null when DataTransfer is null or undefined', () => {
    assert.equal(extractImageFromDataTransfer(null), null);
    assert.equal(extractImageFromDataTransfer(undefined), null);
    assert.equal(hasImageInClipboard(null), false);
    assert.equal(hasImageInClipboard(undefined), false);
  });

  test('extracts image from DataTransfer items when item is an image', () => {
    const mockFile = new File(['fake-png-content'], 'screenshot.png', { type: 'image/png' });
    const mockDataTransfer = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => mockFile,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    assert.equal(hasImageInClipboard(mockDataTransfer), true);
    const extracted = extractImageFromDataTransfer(mockDataTransfer);
    assert.equal(extracted, mockFile);
  });

  test('ignores text items in DataTransfer items', () => {
    const mockDataTransfer = {
      items: [
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
      ],
      files: [],
    } as unknown as DataTransfer;

    assert.equal(hasImageInClipboard(mockDataTransfer), false);
    assert.equal(extractImageFromDataTransfer(mockDataTransfer), null);
  });

  test('falls back to files array if items do not contain an image', () => {
    const mockFile = new File(['fake-jpeg-content'], 'photo.jpg', { type: 'image/jpeg' });
    const mockDataTransfer = {
      items: [],
      files: [mockFile],
    } as unknown as DataTransfer;

    assert.equal(hasImageInClipboard(mockDataTransfer), true);
    const extracted = extractImageFromDataTransfer(mockDataTransfer);
    assert.equal(extracted, mockFile);
  });

  test('returns null if files array only contains non-image files', () => {
    const mockFile = new File(['text-content'], 'doc.txt', { type: 'text/plain' });
    const mockDataTransfer = {
      items: [],
      files: [mockFile],
    } as unknown as DataTransfer;

    assert.equal(hasImageInClipboard(mockDataTransfer), false);
    assert.equal(extractImageFromDataTransfer(mockDataTransfer), null);
  });
});
