export interface Payload {
  userId: string;
  type: TokenType;
}

type TokenType = 'access' | 'refresh';
