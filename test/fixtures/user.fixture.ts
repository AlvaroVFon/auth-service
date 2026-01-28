import { User as UserInterface } from '../../src/users/user.interface';
import { User } from '../../src/users/user.schema';

export const createTestUser = async (data?: Partial<UserInterface>): Promise<UserInterface> => {
  const userData = {
    ...defaultUserData,
    ...data,
  };

  return User.create(userData);
};

const defaultUserData: UserInterface = {
  username: 'testuser',
  email: 'testuser@example.com',
};
