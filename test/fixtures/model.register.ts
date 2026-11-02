import fixture from '.';
import { Application } from '../../src/applications/applications.interface';
import { ApplicationModel } from '../../src/applications/applications.schema';
import { AuditEventRecord } from '../../src/audit/audit.interface';
import { AuditEventModel } from '../../src/audit/audit.schema';
import { Code as CodeInterface } from '../../src/auth/codes/code.interface';
import { CodesModel } from '../../src/auth/codes/codes.schema';
import { BlacklistedToken } from '../../src/auth/tokens/blacklisted-token.interface';
import { BlacklistedTokenModel } from '../../src/auth/tokens/blacklisted-token.schema';
import { Grant } from '../../src/grants/grants.interface';
import { GrantModel } from '../../src/grants/grants.schema';
import { Holder } from '../../src/holders/holders.interface';
import { HoldersModel } from '../../src/holders/holders.schema';
import { OneTimeLink } from '../../src/links/link.interface';
import { LinkModel } from '../../src/links/links.schema';
import { User as UserInterface } from '../../src/users/users.interface';
import { User } from '../../src/users/users.schema';

export const registerModels = async (): Promise<void> => {
  await fixture.registerModel<UserInterface>(User.modelName, User.schema);

  await fixture.registerModel<BlacklistedToken>(
    BlacklistedTokenModel.modelName,
    BlacklistedTokenModel.schema,
  );

  await fixture.registerModel<CodeInterface>(
    CodesModel.modelName,
    CodesModel.schema,
  );

  await fixture.registerModel<Holder>(
    HoldersModel.modelName,
    HoldersModel.schema,
  );

  await fixture.registerModel<Application>(
    ApplicationModel.modelName,
    ApplicationModel.schema,
  );

  await fixture.registerModel<Grant>(GrantModel.modelName, GrantModel.schema);

  await fixture.registerModel<OneTimeLink>(
    LinkModel.modelName,
    LinkModel.schema,
  );

  await fixture.registerModel<AuditEventRecord>(
    AuditEventModel.modelName,
    AuditEventModel.schema,
  );
};

export default fixture;
