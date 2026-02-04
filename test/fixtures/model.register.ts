import fixture from './fixture';
import { User } from '../../src/users/users.schema';
import { User as UserInterface } from '../../src/users/users.interface';
import { Code as CodeInterface } from '../../src/auth/codes/code.interface';
import { CodesModel } from '../../src/auth/codes/codes.schema';
import { RefreshToken as RefreshTokenInterface } from '../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenModel } from '../../src/auth/tokens/refresh-token.schema';

export const registerModels = async (): Promise<void> => {
  await fixture.registerModel<UserInterface>(User.modelName, User.schema);
  await fixture.registerModel<CodeInterface>(
    CodesModel.modelName,
    CodesModel.schema,
  );
  await fixture.registerModel<RefreshTokenInterface>(
    RefreshTokenModel.modelName,
    RefreshTokenModel.schema,
  );
};

export default fixture;
