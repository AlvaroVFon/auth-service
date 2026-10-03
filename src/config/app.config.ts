import { Application } from 'express';

import { LoggerInterface } from '../libs/logger/logger.interface';
import { getStringEnvVariable } from './env.config';

const HOST = getStringEnvVariable('HOST', 'localhost');
const PORT = Number(getStringEnvVariable('PORT', '3000'));

const startServer = (app: Application, logger: LoggerInterface) => {
  app.listen(PORT, HOST, () => {
    logger.info(`Server is running at http://${HOST}:${PORT}`);
  });
};

export { startServer };
