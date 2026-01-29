import fixture from './fixture';
import { User } from '../../src/users/users.schema';

export const registerModels = async (): Promise<void> => {
  await fixture.registerModel<typeof User>(User.modelName, User.schema);
};

export default fixture;
