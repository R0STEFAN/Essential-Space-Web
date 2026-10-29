'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileText,
  Bookmark,
  Image as ImageIcon,
  Mic,
  Square,
  Upload,
  Check,
  Loader2,
  Trash2,
  Plus,
} from 'lucide-react';
import type { Collection, Card } from '@/types';
import {
  requestNothingAiAnalysis,
  requestAudioAiAnalysis,
  createCloudCard,
} from '@/lib/nothing-cards';
import { convertToWebP } from '@/lib/image-optimizer';
import { uploadMediaToGcs } from '@/lib/firebase-upload';
import { useScrollLock } from '@/lib/useScrollLock';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  activeCollectionId?: string;
  token: string;
  userId: string;
  onCardCreated: (card: Card) => void;
}

type TabType = 'NOTE' | 'LINK' | 'IMAGE' | 'VOICE';

export default function CreateNoteModal({
  isOpen,
  onClose,
  collections,
  activeCollectionId,
  token,
  userId,
  onCardCreated,
}: CreateNoteModalProps) {
  const [tab, setTab] = useState<TabType>('NOTE');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedCollection, setSelectedCollection] = useState(activeCollectionId || '');
  const [useAi, setUseAi] = useState(true);

  // Lock background page scroll while modal is open
  useScrollLock(isOpen);

  // Attachments state
  const [showImageAttachment, setShowImageAttachment] = useState(false);
  const [showVoiceAttachment, setShowVoiceAttachment] = useState(false);

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Processing state
  const [statusText, setStatusText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeCollectionId) {
      setSelectedCollection(activeCollectionId);
    }
  }, [activeCollectionId]);

  // Adjust visible attachments based on selected primary tab
  useEffect(() => {
    if (tab === 'IMAGE') {
      setShowImageAttachment(true);
    } else if (tab === 'VOICE') {
      setShowVoiceAttachment(true);
    }
  }, [tab]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setLinkUrl('');
      setImageFile(null);
      setImagePreview(null);
      setAudioBlob(null);
      setIsRecording(false);
      setRecordingDuration(0);
      setShowImageAttachment(false);
      setShowVoiceAttachment(false);
      setStatusText(null);
      setError(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
      setShowImageAttachment(true);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (tab !== 'IMAGE') {
      setShowImageAttachment(false);
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        setAudioBlob(fullBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setShowVoiceAttachment(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError(`Microphone access failed: ${err?.message || 'Permission denied'}`);
    }
  };

  // Stop Voice Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
    if (tab !== 'VOICE') {
      setShowVoiceAttachment(false);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const hasImage = Boolean(imageFile);
      const hasAudio = Boolean(audioBlob);

      if (tab === 'LINK' && !linkUrl.trim()) {
        throw new Error('Please enter a valid URL');
      }
      if (tab === 'NOTE' && !content.trim() && !hasImage && !hasAudio) {
        throw new Error('Please enter note text or attach media');
      }
      if (tab === 'IMAGE' && !hasImage) {
        throw new Error('Please select an image to upload');
      }
      if (tab === 'VOICE' && !hasAudio) {
        throw new Error('Please record a voice memo first');
      }

      let aiResult: any = null;
      let finalImageUrl: string | undefined;
      let localDataUrl: string | undefined;
      let imageGcsKey: string | undefined;
      let finalAudioUri: string | undefined;
      let audioGcsKey: string | undefined;

      // 1. Upload Image to GCS if attached
      if (hasImage && imageFile) {
        setStatusText('Optimizing image to WebP format...');
        const { blob: webpBlob } = await convertToWebP(imageFile);

        // Pre-cache local data URL so image is always available offline and in trash
        localDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(webpBlob);
        });

        setStatusText('Uploading photo to Google Cloud Storage...');
        const upload = await uploadMediaToGcs({
          nothingToken: token,
          userId,
          fileBlob: webpBlob,
          contentType: 'image/webp',
          type: 'image',
        });
        finalImageUrl = upload.downloadUrl;
        imageGcsKey = upload.gcsKey;
      }

      // 2. Upload Voice Audio to GCS if recorded
      if (hasAudio && audioBlob) {
        setStatusText('Uploading voice memo to Google Cloud Storage...');
        const upload = await uploadMediaToGcs({
          nothingToken: token,
          userId,
          fileBlob: audioBlob,
          contentType: 'audio/wav',
          type: 'audio',
        });
        finalAudioUri = upload.downloadUrl;
        audioGcsKey = upload.gcsKey;
      }

      // 3. Trigger Official Nothing AI Pipeline
      if (useAi) {
        if (hasAudio && audioGcsKey) {
          // Voice Memo OR Voice + Photo Note
          setStatusText(
            hasImage
              ? 'Gemini 2.0 Flash analyzing voice memo and attached photo together...'
              : 'Gemini 2.0 Flash transcribing & structuring audio report...'
          );
          aiResult = await requestAudioAiAnalysis({
            token,
            s3FileKey: audioGcsKey,
            imageS3FileKey: imageGcsKey, // Attached image passed directly to Gemini 2.0 Flash!
            audioDurationMs: recordingDuration * 1000,
            userText: content,
          });
        } else if (hasImage && imageGcsKey) {
          // Photo note
          setStatusText('Nothing AI analyzing image & extracting topics...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'IMG',
            userText: content,
            s3FileKey: imageGcsKey,
          });
        } else if (tab === 'LINK') {
          // Link note
          setStatusText('Nothing AI summarizing web page & generating tags...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'SHARE_SHEET',
            url: linkUrl,
            userText: content,
          });
        } else {
          // Pure text note
          setStatusText('Nothing AI extracting insights & action items...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'TEXT',
            userText: content,
          });
        }
      }

      // 4. Determine Card Type
      // In Nothing OS, if audio is present, card type is AUDIO (AudioCard renders both image and audio player!)
      let finalCardType: Card['type'] = 'TEXT';
      if (hasAudio) {
        finalCardType = 'AUDIO';
      } else if (hasImage) {
        finalCardType = 'IMAGE';
      } else if (tab === 'LINK') {
        finalCardType = 'LINK';
      }

      // 5. Create Card in Nothing Cloud Storage & IndexedDB
      setStatusText('Syncing new note to Nothing Cloud...');
      const createRes = await createCloudCard({
        token,
        userId,
        type: finalCardType,
        title:
          aiResult?.title ||
          (tab === 'LINK'
            ? linkUrl
            : content.trim()
            ? content.trim().slice(0, 40)
            : hasAudio && hasImage
            ? 'Voice + Photo Memo'
            : hasAudio
            ? 'Voice Memo'
            : 'Photo Note'),
        content,
        summary: aiResult?.summary || (content.trim() ? content.trim() : undefined),
        imageUrl: finalImageUrl,
        cachedImageUrl: localDataUrl,
        imageGcsKey,
        collectionId: selectedCollection || undefined,
        tags: aiResult?.tags,
        bulletPoints: aiResult?.bulletPoints,
        bulletPointsTitle: aiResult?.bulletPointsTitle,
        infoExtract: aiResult?.infoExtract,
        events: aiResult?.events,
        linkUrl: tab === 'LINK' ? linkUrl : undefined,
        audio: finalAudioUri
          ? {
              audioUri: finalAudioUri,
              duration: recordingDuration,
              transcript: aiResult?.transcript,
            }
          : undefined,
        audioGcsKey,
      });

      if (!createRes.success || !createRes.card) {
        throw new Error(createRes.error || 'Failed to create card');
      }

      onCardCreated(createRes.card);
      onClose();
    } catch (err: any) {
      console.error('Create note failed:', err);
      setError(err?.message || 'Failed to create note');
    } finally {
      setIsSubmitting(false);
      setStatusText(null);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const hasImage = Boolean(imageFile);
  const hasAudio = Boolean(audioBlob);
  const isVoiceAndPhoto = Boolean(imageFile && audioBlob);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-2xl bg-nothing-card border border-nothing-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nothing-border/60">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-nothing-red animate-pulse" />
            <h3 className="font-dot text-sm text-white uppercase tracking-wider font-semibold">
              NEW CAPTURE // NOTHING SPACE
            </h3>
            {isVoiceAndPhoto && (
              <span className="px-2 py-0.5 rounded-full bg-nothing-red/20 border border-nothing-red/40 text-[10px] font-mono text-nothing-red">
                VOICE + PHOTO
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-4 p-2 bg-black/40 border-b border-nothing-border/40 gap-1 text-xs font-mono">
          <button
            type="button"
            onClick={() => setTab('NOTE')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'NOTE'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <FileText size={13} />
            <span>Note</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('LINK')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'LINK'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <Bookmark size={13} />
            <span>Link</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('IMAGE')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'IMAGE'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <ImageIcon size={13} />
            <span>Photo</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('VOICE')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'VOICE'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-nothing-gray hover:text-white'
            }`}
          >
            <Mic size={13} />
            <span>Voice</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-nothing-red/15 border border-nothing-red/30 text-xs font-mono text-nothing-red">
              {error}
            </div>
          )}

          {/* Link URL input (for Link tab) */}
          {tab === 'LINK' && (
            <div>
              <label className="block text-[11px] font-mono text-nothing-gray uppercase mb-1.5">
                Target Web URL
              </label>
              <input
                type="url"
                required
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="w-full px-3.5 py-2 rounded-xl bg-black border border-nothing-border text-xs text-white placeholder:text-nothing-gray/50 focus:outline-none focus:border-white transition-colors font-mono"
              />
            </div>
          )}

          {/* Photo / Screenshot Attachment Section */}
          {(tab === 'IMAGE' || showImageAttachment) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono text-nothing-gray uppercase flex items-center gap-1">
                  <ImageIcon size={12} className="text-amber-400" />
                  <span>Photo / Screenshot Attachment</span>
                </label>
                {imageFile && (
                  <button
                    type="button"
                    onClick={removeImage}
                    className="text-[10px] font-mono text-nothing-red hover:underline flex items-center gap-1"
                  >
                    <Trash2 size={10} />
                    <span>Remove photo</span>
                  </button>
                )}
              </div>

              <label className="relative flex flex-col items-center justify-center w-full h-36 rounded-xl border border-dashed border-nothing-border hover:border-white/50 cursor-pointer bg-black/40 overflow-hidden group transition-colors">
                {imagePreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-mono text-white transition-opacity">
                      Click to replace photo
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-nothing-gray">
                    <Upload size={20} className="text-nothing-red" />
                    <span className="text-xs font-mono">Click or drag image here</span>
                    <span className="text-[10px] font-mono text-nothing-gray/60">
                      Auto-compressed to WebP before upload
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Voice Memo Recorder Section */}
          {(tab === 'VOICE' || showVoiceAttachment) && (
            <div className="p-3.5 rounded-xl bg-black border border-nothing-border space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-nothing-gray uppercase">
                  <Mic size={12} className="text-nothing-red" />
                  <span>Voice Memo Recording</span>
                </div>
                {audioBlob && !isRecording && (
                  <button
                    type="button"
                    onClick={removeAudio}
                    className="text-[10px] font-mono text-nothing-red hover:underline flex items-center gap-1"
                  >
                    <Trash2 size={10} />
                    <span>Remove voice</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-dot text-xl font-bold tracking-wider text-white">
                    {formatDuration(recordingDuration)}
                  </span>
                  {isRecording && (
                    <span className="w-2.5 h-2.5 rounded-full bg-nothing-red animate-ping" />
                  )}
                </div>

                <div>
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-3.5 py-1.5 rounded-xl bg-nothing-red hover:bg-nothing-red/80 text-white text-xs font-dot tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-nothing-red/20"
                    >
                      <Mic size={13} />
                      <span>{audioBlob ? 'RE-RECORD' : 'RECORD VOICE'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-dot tracking-wider font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <Square size={13} />
                      <span>STOP</span>
                    </button>
                  )}
                </div>
              </div>

              {audioBlob && !isRecording && (
                <p className="text-[10px] font-mono text-emerald-400">
                  ✓ Voice recording ready ({formatDuration(recordingDuration)})
                </p>
              )}
            </div>
          )}

          {/* Quick Attachment Toggles (Allows combining Photo + Voice in any mode!) */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] font-mono text-nothing-gray uppercase">Attachments:</span>
            {!showImageAttachment && tab !== 'IMAGE' && (
              <button
                type="button"
                onClick={() => setShowImageAttachment(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-nothing-hover border border-nothing-border text-[11px] font-mono text-nothing-gray hover:text-white hover:border-white/30 transition-colors"
              >
                <Plus size={11} />
                <ImageIcon size={11} className="text-amber-400" />
                <span>Add Photo</span>
              </button>
            )}

            {!showVoiceAttachment && tab !== 'VOICE' && (
              <button
                type="button"
                onClick={() => setShowVoiceAttachment(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-nothing-hover border border-nothing-border text-[11px] font-mono text-nothing-gray hover:text-white hover:border-white/30 transition-colors"
              >
                <Plus size={11} />
                <Mic size={11} className="text-nothing-red" />
                <span>Add Voice Memo</span>
              </button>
            )}
          </div>

          {/* Note content / instructions textarea */}
          <div>
            <label className="block text-[11px] font-mono text-nothing-gray uppercase mb-1.5">
              {tab === 'LINK'
                ? 'Optional notes or context'
                : isVoiceAndPhoto
                ? 'Note Context (Analyzed with Photo & Voice Memo)'
                : hasImage
                ? 'Description / Question about photo'
                : 'Note Content'}
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={
                isVoiceAndPhoto
                  ? 'Add any extra notes or questions about this photo and voice memo...'
                  : tab === 'NOTE'
                  ? 'Type your thoughts, meeting notes, shopping items, or action checklist...'
                  : 'Add any extra context or instructions for Nothing AI...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-nothing-border text-xs text-white placeholder:text-nothing-gray/50 focus:outline-none focus:border-white transition-colors font-mono resize-none"
            />
          </div>

          {/* Collection & AI toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-nothing-border/40">
            {/* Collection dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nothing-gray uppercase">Collection:</span>
              <select
                value={selectedCollection}
                onChange={e => setSelectedCollection(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-black border border-nothing-border text-xs font-mono text-white focus:outline-none focus:border-white"
              >
                <option value="">None (Inbox)</option>
                {collections.map(c => (
                  <option key={c.collectionId} value={c.collectionId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* AI pipeline toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useAi}
                onChange={e => setUseAi(e.target.checked)}
                className="rounded bg-black border-nothing-border text-nothing-red focus:ring-0"
              />
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-white">
                <Sparkles size={11} className="text-nothing-red" />
                <span>Nothing Cloud AI</span>
              </span>
            </label>
          </div>

          {/* Status text during processing */}
          {statusText && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-nothing-red/10 border border-nothing-red/30 text-xs font-mono text-nothing-red">
              <Loader2 size={14} className="animate-spin shrink-0" />
              <span className="truncate">{statusText}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-mono text-nothing-gray hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isRecording}
              className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-dot tracking-wider font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>SYNCING...</span>
                </>
              ) : (
                <>
                  <Check size={13} strokeWidth={3} />
                  <span>SAVE CAPTURE</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
