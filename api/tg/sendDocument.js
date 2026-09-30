'use strict';

var core = require('../../lib/server-core');
var session = require('../../lib/session');

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return core.sendJson(res, 405, { error: 'Method not allowed' });
  session.ensurePanelSession(req, res);
  var keys = core.rk();
  if(!keys.BOT_TOKEN) return core.sendJson(res, 503, { ok: false, description: 'Bot not configured' });

  var body = await core.readJsonBody(req);
  var chatId = body && body.chat_id;
  var caption = String((body && body.caption) || '');
  var filename = String((body && body.filename) || 'report.txt');
  var b64 = String((body && body.contentBase64) || '');
  if(chatId == null || !b64){
    return core.sendJson(res, 400, { ok: false, description: 'Missing chat_id or content' });
  }

  try{
    var content = Buffer.from(b64, 'base64');
    var fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption);
    fd.append('parse_mode', 'HTML');
    fd.append('document', new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
    var r = await fetch(keys.TG_API + '/sendDocument', { method: 'POST', body: fd });
    var data = await r.json();
    core.sendJson(res, 200, data);
  }catch(e){
    core.sendJson(res, 502, { ok: false, description: e.message || 'sendDocument failed' });
  }
};
