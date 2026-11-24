'use strict';
const config = require('./src/config');
const app = require('./src/app');
const pool = require('./src/db');

const server = app.listen(config.port, config.host, () => {
  console.log(`App lista en http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} recibido, cerrando...`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10e3).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
