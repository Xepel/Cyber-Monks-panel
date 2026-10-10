'use strict';

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SRC_JS = path.join(ROOT, 'script.js');

function copyFile(name) {
  fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
}

if (!fs.existsSync(SRC_JS)) {
  console.error('Missing script.js');
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const source = fs.readFileSync(SRC_JS, 'utf8');
const result = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  splitStrings: true,
  splitStringsChunkLength: 8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  selfDefending: false,
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal',
  target: 'browser',
});

fs.writeFileSync(path.join(DIST, 'script.js'), result.getObfuscatedCode(), 'utf8');
copyFile('index.html');
copyFile('style.css');

const distScript = fs.readFileSync(path.join(DIST, 'script.js'), 'utf8');
if (distScript.includes('fbi panel v1') || distScript.includes('AUTO-BOT · ALWAYS-POLL')) {
  console.warn('Warning: recognizable header strings still present in output');
}

console.log('Built obfuscated dist/script.js (' + distScript.length + ' bytes)');
console.log('Copied index.html and style.css → dist/');
