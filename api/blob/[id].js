'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');
var blob = require('../../lib/blob-proxy');

module.exports = async function handler(req, res){
  session.ensurePanelSession(req, res);
  var id = (req.query && req.query.id) || '';
  if(!id) return core.sendJson(res, 400, { ok: false, error: 'missing id' });

  if(req.method === 'GET'){
    var got = await blob.blobGet(id);
    if(!got.ok) return core.sendJson(res, got.status || 502, { ok: false });
    return core.sendJson(res, 200, got.data);
  }
  if(req.method === 'PUT'){
    var body = await core.readJsonBody(req);
    var put = await blob.blobPut(id, body);
    if(!put.ok) return core.sendJson(res, put.status || 502, { ok: false });
    return core.sendJson(res, 200, { ok: true });
  }
  return core.sendJson(res, 405, { error: 'Method not allowed' });
};
