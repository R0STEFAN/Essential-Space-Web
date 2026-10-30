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
  ExternalLink,
  Folder,
} from 'lucide-react';
import type { Collection, Card, CardLink } from '@/types';
import { createCloudCollection } from '@/lib/nothing-collections';
import {
  requestNothingAiAnalysis,
  requestAudioAiAnalysis,
  createCloudCard,
} from '@/lib/nothing-cards';
import { convertToWebP } from '@/lib/image-optimizer';
import { uploadMediaToGcs } from '@/lib/firebase-upload';
import { useScrollLock } from '@/lib/useScrollLock';
import { fetchLinkPreview, normalizeUrl } from '@/lib/link-preview';

interface CreateNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  activeCollectionId?: string;
  token: string;
  userId: string;
  aiLanguage?: string;
  onCardCreated: (card: Card) => void;
  onCollectionCreated?: (col: Collection) => void;
}

type TabType = 'NOTE' | 'LINK' | 'IMAGE' | 'VOICE';

export default function CreateNoteModal({
  isOpen,
  onClose,
  collections,
  activeCollectionId,
  token,
  userId,
  aiLanguage = 'uk',
  onCardCreated,
  onCollectionCreated,
}: CreateNoteModalProps) {
  const [tab, setTab] = useState<TabType>('NOTE');
  const [content, setContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState<CardLink | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    activeCollectionId ? [activeCollectionId] : []
  );
  const [showColInput, setShowColInput] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [isCreatingCol, setIsCreatingCol] = useState(false);
  const [createColError, setCreateColError] = useState<string | null>(null);
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
      setSelectedCollectionIds(prev => (prev.includes(activeCollectionId) ? prev : [...prev, activeCollectionId]));
    }
  }, [activeCollectionId]);

  const toggleCollection = (colId: string) => {
    setSelectedCollectionIds(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;
    setIsCreatingCol(true);
    setCreateColError(null);
    try {
      const res = await createCloudCollection(token, userId, name);
      if (!res.success || !res.collection) {
        throw new Error(res.error || 'Failed to create collection');
      }
      onCollectionCreated?.(res.collection);
      setSelectedCollectionIds(prev => [...prev, res.collection!.collectionId]);
      setNewColName('');
      setShowColInput(false);
    } catch (err: any) {
      setCreateColError(err?.message || 'Failed to create collection');
    } finally {
      setIsCreatingCol(false);
    }
  };

  // Adjust visible attachments based on selected primary tab
  useEffect(() => {
    if (tab === 'IMAGE') {
      setShowImageAttachment(true);
    } else if (tab === 'VOICE') {
      setShowVoiceAttachment(true);
    }
  }, [tab]);

  // Debounced link preview fetching when entering a URL
  useEffect(() => {
    if (tab !== 'LINK') return;
    const trimmed = linkUrl.trim();
    if (!trimmed || trimmed.length < 4 || !trimmed.includes('.')) {
      setLinkPreview(null);
      setIsLoadingPreview(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingPreview(true);
      try {
        const meta = await fetchLinkPreview(trimmed);
        setLinkPreview(meta);
      } catch (err) {
        console.warn('Failed to load link preview:', err);
      } finally {
        setIsLoadingPreview(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [linkUrl, tab]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setLinkUrl('');
      setLinkPreview(null);
      setIsLoadingPreview(false);
      setSelectedCollectionIds(activeCollectionId ? [activeCollectionId] : []);
      setShowColInput(false);
      setNewColName('');
      setCreateColError(null);
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

      let normalizedLink = linkUrl.trim();
      let activeMeta = linkPreview;
      if (tab === 'LINK') {
        normalizedLink = normalizeUrl(normalizedLink);
        if (!activeMeta || activeMeta.url !== normalizedLink) {
          setStatusText('Fetching link preview & OpenGraph metadata...');
          try {
            activeMeta = await fetchLinkPreview(normalizedLink);
            setLinkPreview(activeMeta);
          } catch {
            // fallback handled in fetchLinkPreview
          }
        }
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
            language: aiLanguage,
          });
        } else if (hasImage && imageGcsKey) {
          // Photo note
          setStatusText('Nothing AI analyzing image & extracting topics...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'IMG',
            userText: content,
            s3FileKey: imageGcsKey,
            language: aiLanguage,
          });
        } else if (tab === 'LINK') {
          // Link note
          setStatusText('Nothing AI summarizing web page & generating tags...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'SHARE_SHEET',
            url: normalizedLink,
            linkPreviewMeta: activeMeta
              ? {
                  title: activeMeta.title,
                  description: activeMeta.description,
                  preview: activeMeta.preview,
                }
              : undefined,
            userText: content,
            language: aiLanguage,
          });
        } else {
          // Pure text note
          setStatusText('Nothing AI extracting insights & action items...');
          aiResult = await requestNothingAiAnalysis({
            token,
            promptType: 'TEXT',
            userText: content,
            language: aiLanguage,
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
      // Assign official Nothing OS capture_from source
      const targetCaptureFrom = tab === 'LINK' ? 'share_sheet' : (hasAudio ? 'recording' : 'note');

      setStatusText('Syncing new note to Nothing Cloud...');
      const createRes = await createCloudCard({
        token,
        userId,
        type: finalCardType,
        captureFrom: targetCaptureFrom,
        title:
          aiResult?.title ||
          (tab === 'LINK'
            ? activeMeta?.title || normalizedLink
            : content.trim()
            ? content.trim().slice(0, 40)
            : hasAudio && hasImage
            ? 'Voice + Photo Memo'
            : hasAudio
            ? 'Voice Memo'
            : 'Photo Note'),
        content,
        summary:
          aiResult?.summary ||
          (tab === 'LINK'
            ? activeMeta?.description
            : (content.trim() ? content.trim() : undefined)),
        imageUrl: (tab === 'LINK' ? activeMeta?.preview : undefined) || finalImageUrl,
        cachedImageUrl: localDataUrl,
        imageGcsKey,
        collectionId: selectedCollectionIds[0] || undefined,
        collectionIds: selectedCollectionIds,
        tags: aiResult?.tags,
        bulletPoints: aiResult?.bulletPoints,
        bulletPointsTitle: aiResult?.bulletPointsTitle,
        infoExtract: aiResult?.infoExtract,
        events: aiResult?.events,
        linkUrl: tab === 'LINK' ? normalizedLink : undefined,
        linkMeta: tab === 'LINK' ? activeMeta || undefined : undefined,
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
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-nothing-gray uppercase mb-1.5 flex items-center justify-between">
                  <span>Target Web URL</span>
                  {linkPreview && (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <Check size={11} strokeWidth={3} />
                      {linkPreview.domain}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-nothing-border text-xs text-white placeholder:text-nothing-gray/50 focus:outline-none focus:border-white transition-colors font-mono"
                  />
                  {isLoadingPreview && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 size={13} className="animate-spin text-nothing-red" />
                    </div>
                  )}
                </div>
              </div>

              {/* Live Preview Card */}
              {isLoadingPreview && !linkPreview && (
                <div className="p-3.5 rounded-xl bg-black/40 border border-dashed border-nothing-border/60 flex items-center gap-2.5 text-xs font-mono text-nothing-gray animate-pulse">
                  <Loader2 size={14} className="animate-spin text-nothing-red shrink-0" />
                  <span>Loading website preview & OpenGraph data...</span>
                </div>
              )}

              {linkPreview && (
                <div className="rounded-xl bg-[#151515] border border-nothing-border overflow-hidden p-3.5 space-y-2.5 transition-all animate-fadeIn">
                  <div className="flex items-center justify-between text-[11px] font-mono text-nothing-gray">
                    <div className="flex items-center gap-2 min-w-0">
                      {linkPreview.favicon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={linkPreview.favicon}
                          alt=""
                          className="w-4 h-4 rounded shrink-0 object-contain"
                          onError={e => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Bookmark size={13} className="text-nothing-red shrink-0" />
                      )}
                      <span className="truncate text-white font-medium">
                        {linkPreview.siteName || linkPreview.domain}
                      </span>
                    </div>
                    <a
                      href={linkPreview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-nothing-gray hover:text-white flex items-center gap-1 text-[10px]"
                      title="Open Link"
                    >
                      <span>Visit</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>

                  {linkPreview.preview && (
                    <div className="w-full h-36 rounded-lg overflow-hidden bg-black relative border border-nothing-border/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={linkPreview.preview}
                        alt=""
                        className="w-full h-full object-cover object-top"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-medium text-white line-clamp-1">
                      {linkPreview.title}
                    </h4>
                    {linkPreview.description && (
                      <p className="text-[11px] text-nothing-gray line-clamp-2 mt-0.5 leading-relaxed font-mono">
                        {linkPreview.description}
                      </p>
                    )}
                  </div>
                </div>
              )}
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

          {/* Collections Multi-Select Section */}
          <div className="pt-3 border-t border-nothing-border/40 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[11px] text-nothing-gray uppercase flex items-center gap-1.5">
                <Folder size={12} className="text-nothing-red" />
                <span>Collections</span>
                {selectedCollectionIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-nothing-red/20 text-nothing-red text-[10px] font-semibold">
                    {selectedCollectionIds.length}
                  </span>
                )}
              </span>

              <div className="flex items-center gap-2.5">
                {selectedCollectionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCollectionIds([])}
                    className="text-[10px] text-nothing-gray hover:text-white underline font-mono"
                  >
                    Clear
                  </button>
                )}
                {!showColInput && (
                  <button
                    type="button"
                    onClick={() => setShowColInput(true)}
                    className="text-[10px] text-nothing-red hover:underline flex items-center gap-0.5 font-mono"
                  >
                    <Plus size={11} />
                    <span>+ New Collection</span>
                  </button>
                )}
              </div>
            </div>

            {/* Inline collection creator */}
            {showColInput && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-black border border-nothing-border animate-fadeIn">
                <input
                  type="text"
                  autoFocus
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  placeholder="Collection name..."
                  className="flex-1 bg-transparent text-xs font-mono text-white placeholder-nothing-gray focus:outline-none px-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateCollection(e);
                    } else if (e.key === 'Escape') {
                      setShowColInput(false);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={isCreatingCol || !newColName.trim()}
                  onClick={handleCreateCollection}
                  className="px-2.5 py-1 rounded-lg bg-nothing-red text-white text-[11px] font-dot uppercase tracking-wider disabled:opacity-50 flex items-center gap-1 shadow-sm"
                >
                  {isCreatingCol ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowColInput(false)}
                  className="p-1 text-nothing-gray hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {createColError && (
              <p className="text-[10px] font-mono text-nothing-red">{createColError}</p>
            )}

            {/* Multi-Select Collection Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {collections.map(c => {
                const isSelected = selectedCollectionIds.includes(c.collectionId);
                return (
                  <button
                    key={c.collectionId}
                    type="button"
                    onClick={() => toggleCollection(c.collectionId)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono transition-all border ${
                      isSelected
                        ? 'bg-nothing-red text-white border-nothing-red shadow-sm'
                        : 'bg-black/40 border-nothing-border text-nothing-gray hover:text-white hover:border-white/40'
                    }`}
                  >
                    {isSelected ? (
                      <Check size={11} strokeWidth={3} />
                    ) : (
                      <Folder size={11} className="text-nothing-gray" />
                    )}
                    <span>{c.name}</span>
                  </button>
                );
              })}
              {collections.length === 0 && (
                <span className="text-[11px] font-mono text-nothing-gray italic">
                  No collections available. Create one using the button above.
                </span>
              )}
            </div>
          </div>

          {/* AI pipeline toggle */}
          <div className="pt-2.5 border-t border-nothing-border/40 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useAi}
                onChange={e => setUseAi(e.target.checked)}
                className="rounded bg-black border-nothing-border text-nothing-red focus:ring-0"
              />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-white">
                <Sparkles size={11} className="text-nothing-red" />
                <span>Nothing Cloud AI Analysis</span>
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
