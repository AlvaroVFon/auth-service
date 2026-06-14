import fixture from '.';
import { User } from '../../src/users/users.schema';
import { User as UserInterface } from '../../src/users/users.interface';
import { Code as CodeInterface } from '../../src/auth/codes/code.interface';
import { CodesModel } from '../../src/auth/codes/codes.schema';
import { Holder } from '../../src/holders/holders.interface';
import { HoldersModel } from '../../src/holders/holders.schema';
import { ConfigEntry } from '../../src/libs/config-service/config-service.interface';
import { ConfigEntryModel } from '../../src/libs/config-service/adapters/mongo-config-entry.schema';
import { TenantsModel } from '../../src/tenants/tenants.schema';
import { Tenant } from '../../src/tenants/tentants.interface';

export const registerModels = async (): Promise<void> => {
  await fixture.registerModel<UserInterface>(User.modelName, User.schema);

  await fixture.registerModel<CodeInterface>(
    CodesModel.modelName,
    CodesModel.schema,
  );

  await fixture.registerModel<Holder>(
    HoldersModel.modelName,
    HoldersModel.schema,
  );

  await fixture.registerModel<ConfigEntry>(
    ConfigEntryModel.modelName,
    ConfigEntryModel.schema,
  );

  await fixture.registerModel<Tenant>(
    TenantsModel.modelName,
    TenantsModel.schema,
  );
};

export default fixture;
