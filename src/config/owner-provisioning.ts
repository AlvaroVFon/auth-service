import type { LoggerInterface } from '../libs/logger';
import type { OwnerCredentials } from './owner.config';

export interface OwnerProvisioner {
  ensureOwner(
    email: string,
    password: string,
  ): Promise<{ created: boolean; userId: string; email: string }>;
}

export type OwnerProvisioningStatus = 'skipped' | 'created' | 'existing';

export interface OwnerProvisioningResult {
  status: OwnerProvisioningStatus;
  email?: string;
}

export const provisionOwnerFromEnv = async (options: {
  credentials: OwnerCredentials | null;
  ownerBootstrap: OwnerProvisioner;
  logger: LoggerInterface;
}): Promise<OwnerProvisioningResult> => {
  if (!options.credentials) {
    options.logger.info(
      'Owner bootstrap skipped: OWNER_EMAIL and OWNER_PASSWORD are not configured',
    );
    return { status: 'skipped' };
  }

  const result = await options.ownerBootstrap.ensureOwner(
    options.credentials.email,
    options.credentials.password,
  );

  options.logger.info(
    result.created
      ? `Owner created: ${result.email}`
      : `Owner already exists: ${result.email}`,
  );

  return {
    status: result.created ? 'created' : 'existing',
    email: result.email,
  };
};
