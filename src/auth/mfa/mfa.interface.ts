export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface MfaActivation {
  recoveryCodes: string[];
}
