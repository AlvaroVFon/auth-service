import { Application } from 'express';

import { LoggerInterface } from '../libs/logger';
import { getStringEnvVariable } from './env.config';

const HOST = getStringEnvVariable('HOST', 'localhost');
const PORT = Number(getStringEnvVariable('PORT', '3000'));

const startServer = (app: Application, logger: LoggerInterface) => {
  return app.listen(PORT, HOST, () => {
    logger.info(`Server is running at http://${HOST}:${PORT}`);
  });
};

export { startServer };
