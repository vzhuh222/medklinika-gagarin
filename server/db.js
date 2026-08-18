const config = require('./config');

const driver = config.databaseUrl
  ? require('./db/postgres')
  : require('./db/sqlite');

module.exports = driver;
