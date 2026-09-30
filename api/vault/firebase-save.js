'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return core.sendJson(res, 405, { error: 'Method not allowed' });
  session.ensurePanelSession(req, res);
  var body = await core.readJsonBody(req);
  var out = await core.handleVaultFirebaseSave(body);
  core.sendJson(res, out.status, out.data);
};
