'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { buildConfigJs } = require('./lib/specter-config');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3000;
const DEV = process.env.DEV === '1' || process.argv.includes('--dev');
const ROOT = DEV ? __dirname : path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

const BLOCKED = new Set([
  '.env',
  '.env.example',
  'package.json',
  'package-lock.json',
  'server.js',
  'vercel.json',
]);

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let rel = decoded === '/' ? '/index.html' : decoded;
  if (rel.includes('\0')) return null;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return null;
  const base = path.basename(abs).toLowerCase();
  if (BLOCKED.has(base) || base.startsWith('.env')) return null;
  return abs;
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function renderIndex(html) {
  const boot = '<script>\n' + buildConfigJs(process.env) + '</script>';
  return html.replace('<!-- SPECTER_BOOT -->', boot);
}

if (!DEV && !fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('Missing dist/. Run: npm run build');
  process.exit(1);
}

const server = http.createServer(function (req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
  } catch (e) {
    send(res, 400, 'Bad Request');
    return;
  }

  if (pathname === '/config.js') {
    send(res, 404, 'Not Found');
    return;
  }

  const filePath = safeResolve(pathname);
  if (!filePath) {
    send(res, 404, 'Not Found');
    return;
  }

  fs.stat(filePath, function (err, st) {
    if (err || !st.isFile()) {
      send(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isIndex = path.basename(filePath).toLowerCase() === 'index.html';
    if (isIndex) {
      fs.readFile(filePath, 'utf8', function (readErr, html) {
        if (readErr) {
          send(res, 500, 'Failed to read index');
          return;
        }
        const body = renderIndex(html);
        if (method === 'HEAD') {
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': Buffer.byteLength(body),
            'Cache-Control': 'no-store',
          });
          res.end();
          return;
        }
        send(res, 200, body, type);
      });
      return;
    }
    if (method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': st.size,
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, function () {
  console.log(
    'Panel running at http://localhost:' + PORT +
    (DEV ? ' (dev — readable source)' : ' (dist — obfuscated script.js)')
  );
  if (!process.env.BOT_TOKEN) {
    console.warn('Warning: BOT_TOKEN is not set in .env');
  }
});
