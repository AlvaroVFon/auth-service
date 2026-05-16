export interface ConfigEntry {
  key: string;
  active: boolean;
  value: Record<string, unknown>;
}

export interface ConfigService {
  get<T>(key: string): Promise<T | null>;
}
