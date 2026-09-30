'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return core.sendJson(res, 405, { error: 'Method not allowed' });
  session.ensurePanelSession(req, res);
  var body = await core.readJsonBody(req);
  core.sendJson(res, 200, { isOwner: core.isOwner(String((body && body.uid) || '')) });
};
