import { Roles } from './enums/roles.enum';

export interface RequestActor {
  role: Roles | string;
  audience?: string;
}

/**
 * Global role of the caller when the token is not scoped to an application.
 * Application-scoped tokens carry a grant role and never a global owner role.
 */
export const resolveGlobalActorRole = (
  user?: RequestActor,
): Roles | undefined =>
  user !== undefined &&
  user.audience === undefined &&
  (Object.values(Roles) as string[]).includes(user.role)
    ? (user.role as Roles)
    : undefined;
