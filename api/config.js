'use strict';

var core = require('../lib/server-core');

module.exports = async function handler(req, res){
  if(req.method !== 'GET' && req.method !== 'HEAD'){
    return core.sendJson(res, 405, { error: 'Method not allowed' });
  }
  core.sendJson(res, 200, core.buildPublicConfig());
};
