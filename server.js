import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import buildVersionHandler from './api/build-version.js';
import publicConfigHandler from './api/public-config.js';
import iaHandler from './api/ia.js';
import modelosHandler from './api/modelos.js';
import createSessionHandler from './api/create-session.js';
import joinSessionHandler from './api/join-session.js';
import createCharacterHandler from './api/create-character.js';
import submitDecisionHandler from './api/submit-decision.js';
import sessionStatusHandler from './api/session-status.js';
import consolidateRoundHandler from './api/consolidate-round.js';
import generateChapterHandler from './api/generate-chapter.js';
import currentStateHandler from './api/current-state.js';
import adminCrudHandler from './api/admin-crud.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);

const apiRoutes = {
  '/api/build-version': buildVersionHandler,
  '/api/public-config': publicConfigHandler,
  '/api/ia': iaHandler,
  '/api/modelos': modelosHandler,
  '/api/create-session': createSessionHandler,
  '/api/join-session': joinSessionHandler,
  '/api/create-character': createCharacterHandler,
  '/api/submit-decision': submitDecisionHandler,
  '/api/session-status': sessionStatusHandler,
  '/api/consolidate-round': consolidateRoundHandler,
  '/api/generate-chapter': generateChapterHandler,
  '/api/current-state': currentStateHandler,
  '/api/admin-crud': adminCrudHandler
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createResponse(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    json(payload) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    },
    end(payload) {
      res.end(payload);
    }
  };
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function enrichRequest(req, url, body) {
  req.query = Object.fromEntries(url.searchParams.entries());
  req.body = body;
  return req;
}

async function serveStatic(res, pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const relativePath = normalizedPath.replace(/^\/+/, '');
  const target = path.join(publicDir, relativePath);

  try {
    const file = await readFile(target);
    const extension = path.extname(target).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream');
    res.end(file);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (apiRoutes[url.pathname]) {
    const body = await parseBody(req);
    const request = enrichRequest(req, url, body);
    const response = createResponse(res);
    await apiRoutes[url.pathname](request, response);
    return;
  }

  const served = await serveStatic(res, url.pathname);
  if (served) return;

  const fallback = await serveStatic(res, '/index.html');
  if (fallback) return;

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`ContaComigo running on port ${port}`);
});
