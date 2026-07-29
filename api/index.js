const { app, ensureInit } = require('../server/app');

module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
