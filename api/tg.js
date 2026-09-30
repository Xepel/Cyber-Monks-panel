'use strict';

var core = require('../lib/server-core');
var session = require('../lib/session');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return core.sendJson(res, 405, { error: 'Method not allowed' });
  session.ensurePanelSession(req, res);
  if(!core.rk().BOT_TOKEN) return core.sendJson(res, 503, { ok: false, description: 'Bot not configured on server' });

  var body = await core.readJsonBody(req);
  var method = String((body && body.method) || 'getMe');
  var query = String((body && body.query) || '').replace(/^\?/, '');
  var payload = body && body.payload;

  try{
    var data = await core.tgDirect(method, query, payload != null ? payload : undefined);
    core.sendJson(res, 200, data);
  }catch(e){
    core.sendJson(res, 502, { ok: false, description: e.message || 'Telegram proxy failed' });
  }
};
