export interface Credentials {
  email: string;
  password: string;
  application?: string;
}

export interface SignupCredentials extends Credentials {
  passwordConfirmation: string;
}

export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
}

export type LoginResult = TokenPairResponse | MfaChallengeResponse;
