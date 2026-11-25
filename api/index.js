/**
 * SWE ENGLISH EXTRA — Vercel Serverless API Entrypoint
 * Routes all /api/* requests through the unified security & Cloud KV classroom server.
 */
'use strict';

const path = require('node:path');
const { createAppServer } = require('../server.js');

const appServer = createAppServer({
  rootDir: path.resolve(__dirname, '..'),
  serverless: true
});

module.exports = function vercelApiHandler(req, res) {
  return appServer.emit('request', req, res);
};
