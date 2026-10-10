'use strict';

const fs = require('fs');
const path = require('path');
const { buildConfigJs } = require('../lib/specter-config');

function findIndex() {
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(__dirname, '..', 'index.html'),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

module.exports = function handler(req, res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const file = findIndex();
  if (!file) {
    res.statusCode = 500;
    res.end('index.html missing');
    return;
  }

  const html = fs.readFileSync(file, 'utf8').replace(
    '<!-- SPECTER_BOOT -->',
    '<script>\n' + buildConfigJs(process.env) + '</script>'
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(html);
};
