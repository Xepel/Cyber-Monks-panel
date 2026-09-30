'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'script.js');
var out = path.join(root, 'script.js');

if(process.env.SKIP_OBFUSCATE === '1'){
  console.log('[build] SKIP_OBFUSCATE=1 — script left readable');
  process.exit(0);
}

var JavaScriptObfuscator;
try{
  JavaScriptObfuscator = require('javascript-obfuscator');
}catch(e){
  console.warn('[build] javascript-obfuscator not installed — run npm install');
  process.exit(0);
}

var code = fs.readFileSync(src, 'utf8');
var result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  simplify: true,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  renameGlobals: false,
  target: 'browser'
});

fs.writeFileSync(out, result.getObfuscatedCode(), 'utf8');
console.log('[build] script.js obfuscated for production deploy');
