import type { Server } from 'node:http';

import { bootstrap, composition } from './config/bootstrap';
import { registerShutdownHandlers } from './config/shutdown.config';

void bootstrap().then((server) => {
  registerShutdownHandlers({
    server: server as Server,
    database: composition.database,
    logger: composition.logger,
  });
});
