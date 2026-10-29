export type CardType = 'AUDIO' | 'TEXT' | 'CLIPPED_TEXT' | 'LINK' | 'FREEFORM' | 'TODO' | 'IMAGE';

export interface CardAudio {
  audioUri?: string;
  transcript?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
  speakerName?: string;
  timestamps?: string;
  highlightTimestamps?: number[]; // in seconds
}

export interface CardEvent {
  eventId: string;
  cardId: string;
  title: string;
  content?: string;
  check: number; // 0: unchecked, 1: checked
  time?: number;
  isPotentialReminder?: boolean;
}

export interface CardLink {
  url: string;
  title?: string;
  description?: string;
  domain?: string;
  siteName?: string;
  favicon?: string;
  preview?: string;
  text?: string;
}

export interface CardAttachment {
  attachmentId: string;
  type: number;
  source: string;
  timestamp?: number;
}

export interface Card {
  cardId: string;
  userId: string;
  type: CardType;
  title?: string;
  content?: string;
  summary?: string;
  imageUrl?: string;
  cachedImageUrl?: string;
  captureFrom?: string;
  tags?: string[];
  bulletPointsTitle?: string;
  bulletPoints?: string[];
  infoExtract?: Array<{ title: string; value: string }>;
  keyTopics?: Array<{
    title: string;
    detailedSummary: string;
    timestampReference?: string;
  }>;
  mainTopics?: Array<{
    title: string;
    content: string;
  }>;
  emotionalSummary?: string;
  locations?: Array<{
    locationName: string;
    locationUrl: string;
  }>;
  freeformInsights?: Array<{
    title?: string;
    content?: string;
    nextActions?: Array<{ title: string; prompt: string }>;
  }>;
  speakers?: Array<{ speakerId: string; description?: string }>;
  collectionId?: string;
  collectionIds?: string[];
  collectionName?: string;
  collectionNames?: string[];
  targetState: number; // 0 = active, 1 = bin/trash
  createTime: number;
  updateTime: number;
  audio?: CardAudio;
  events?: CardEvent[];
  link?: CardLink;
  attachments?: CardAttachment[];
  clientVersion?: number;
  rawClientRequestResponse?: string;
  files?: Array<{ region?: string; gcsKey?: string }>;
}

export interface Collection {
  collectionId: string;
  userId: string;
  name: string;
  color?: string;
  updateTime?: number;
  cardCount?: number;
}

export interface NothingUser {
  uuid: string;
  email: string;
  userName?: string;
  nickName?: string;
  avatarLink?: string;
  country?: string;
  token: string;
  refreshToken?: string;
}

export interface SyncResult {
  success: boolean;
  cardsCount: number;
  collectionsCount: number;
  lastSyncTime: number;
  error?: string;
}
