export interface TelegramPort {
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface TelegramAdapterOptions {
  botToken: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}
