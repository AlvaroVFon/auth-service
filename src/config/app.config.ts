import { Application } from 'express';
import { getStringEnvVariable } from './env.config';
import { LoggerInterface } from '../common/interceptors/httplogger.interceptor';

const HOST = getStringEnvVariable('HOST', 'localhost');
const PORT = Number(getStringEnvVariable('PORT', '3000'));

const startServer = (app: Application, logger: LoggerInterface) => {
  app.listen(PORT, HOST, () => {
    logger.log(`Server is running at http://${HOST}:${PORT}`);
  });
};

export { startServer };
