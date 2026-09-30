'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');
var blob = require('../../lib/blob-proxy');

module.exports = async function handler(req, res){
  session.ensurePanelSession(req, res);
  if(req.method === 'POST'){
    var body = await core.readJsonBody(req);
    var out = await blob.blobCreate(body);
    if(!out.ok) return core.sendJson(res, out.status || 502, { ok: false });
    return core.sendJson(res, 201, { ok: true, id: out.id });
  }
  return core.sendJson(res, 405, { error: 'Method not allowed' });
};
