import { Application } from 'express';
import { getStringEnvVariable } from './env.config';

const HOST = getStringEnvVariable('HOST', 'localhost');
const PORT = Number(getStringEnvVariable('PORT', '3000'));

const startServer = (app: Application) => {
  app.listen(PORT, HOST, () => {
    console.log(`Server is running at http://${HOST}:${PORT}`);
  });
};

export { startServer };
