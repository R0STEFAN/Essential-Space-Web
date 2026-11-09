export interface Env {
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  TELEGRAM_POSTS_KV?: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (options?: { limit?: number; prefix?: string }) => Promise<{ keys: Array<{ name: string }> }>;
  };
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_ALLOWED_USER_ID?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
