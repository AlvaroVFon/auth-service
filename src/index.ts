import { bootstrap } from './config/bootstrap';
import { WinstonLogger } from './libs/logger/adapters/winston.logger';

const logger = new WinstonLogger();

void bootstrap(logger);
