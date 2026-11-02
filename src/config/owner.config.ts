import { InvalidArgumentError } from '../common/exceptions/base.exception';

export interface OwnerCredentials {
  email: string;
  password: string;
}

export const resolveOwnerCredentials = (
  env: NodeJS.ProcessEnv = process.env,
): OwnerCredentials | null => {
  const email = env.OWNER_EMAIL?.trim();
  const password = env.OWNER_PASSWORD;

  if (!email && !password) {
    return null;
  }

  if (!email || !password) {
    throw new InvalidArgumentError(
      'OWNER_EMAIL and OWNER_PASSWORD must be configured together',
    );
  }

  return { email, password };
};
