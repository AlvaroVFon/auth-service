export interface Payload {
  userId: string;
  type: TokenType;
  jti?: string;
}

type TokenType = 'access' | 'refresh';
