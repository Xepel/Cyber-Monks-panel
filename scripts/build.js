'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'script.src.js');
var out = path.join(root, 'script.js');

if(!fs.existsSync(src)){
  console.error('[build] missing script.src.js');
  process.exit(1);
}

function copyStaticToPublic(){
  var publicDir = path.join(root, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  ['index.html', 'style.css', 'script.js'].forEach(function(name){
    var from = path.join(root, name);
    if(!fs.existsSync(from)) throw new Error('missing ' + name + ' for deploy');
    fs.copyFileSync(from, path.join(publicDir, name));
  });
  console.log('[build] static files → public/');
}

if(process.env.SKIP_OBFUSCATE === '1'){
  fs.copyFileSync(src, out);
  copyStaticToPublic();
  console.log('[build] SKIP_OBFUSCATE=1 — copied script.src.js → script.js');
  process.exit(0);
}

var JavaScriptObfuscator = require('javascript-obfuscator');
var code = fs.readFileSync(src, 'utf8');
var result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  simplify: true,
  stringArray: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayThreshold: 0.85,
  stringArrayEncoding: ['base64'],
  splitStrings: true,
  splitStringsChunkLength: 8,
  unicodeEscapeSequence: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  renameGlobals: false,
  identifierNamesGenerator: 'hexadecimal',
  target: 'browser'
});

fs.writeFileSync(out, result.getObfuscatedCode(), 'utf8');
var kb = Math.round(fs.statSync(out).size / 1024);
console.log('[build] obfuscated script.src.js → script.js (' + kb + ' KB)');
copyStaticToPublic();
