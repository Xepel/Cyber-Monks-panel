'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'script.src.js');
var out = path.join(root, 'script.js');

if(!fs.existsSync(src)) process.exit(0);
if(process.env.VERCEL === '1') process.exit(0);
if(fs.existsSync(out)) process.exit(0);

fs.copyFileSync(src, out);
console.log('[dev] copied script.src.js → script.js (readable for local npm start)');
