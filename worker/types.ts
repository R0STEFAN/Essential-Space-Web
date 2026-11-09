export interface Env {
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  // Telegram bindings for future sync
  TELEGRAM_POSTS_KV?: any;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_ALLOWED_USER_ID?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
