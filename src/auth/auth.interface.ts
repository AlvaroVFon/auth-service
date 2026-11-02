export interface Credentials {
  email: string;
  password: string;
  application?: string;
}

export interface SignupCredentials extends Credentials {
  passwordConfirmation: string;
}
