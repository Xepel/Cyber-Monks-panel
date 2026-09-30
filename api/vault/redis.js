'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return core.sendJson(res, 405, { error: 'Method not allowed' });
  session.ensurePanelSession(req, res);
  var body = await core.readJsonBody(req);
  var uid = String((body && body.uid) || '');
  var cmd = body && body.cmd;
  var out = await core.redisCmdVault(uid, cmd);
  if(!out.ok) return core.sendJson(res, 403, out);
  core.sendJson(res, 200, out);
};
