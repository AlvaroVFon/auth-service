import { bootstrap } from './config/bootstrap';
import { WinstonLogger } from './libs/logger/winston.logger';

const logger = new WinstonLogger();

await bootstrap(logger);
