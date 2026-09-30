'use strict';

var crypto = require('crypto');

function sessionSecret(){
  return process.env.SESSION_SECRET || process.env.CLOAK || 'fbi-panel-session';
}

function signSid(sid){
  var sig = crypto.createHmac('sha256', sessionSecret()).update(sid).digest('hex');
  return sid + '.' + sig;
}

function verifySignedSid(raw){
  if(!raw || raw.indexOf('.') === -1) return null;
  var parts = raw.split('.');
  if(parts.length !== 2) return null;
  var sid = parts[0];
  var expected = crypto.createHmac('sha256', sessionSecret()).update(sid).digest('hex');
  try{
    if(!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return null;
  }catch(e){ return null; }
  return sid;
}

function parseCookies(header){
  var out = {};
  if(!header) return out;
  header.split(';').forEach(function(part){
    var i = part.indexOf('=');
    if(i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function ensurePanelSession(req, res, next){
  var cookies = parseCookies(req.headers.cookie);
  var sid = verifySignedSid(cookies.panel_sid);
  if(!sid){
    sid = crypto.randomBytes(24).toString('hex');
    var signed = signSid(sid);
    var secure = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', 'panel_sid=' + encodeURIComponent(signed)
      + '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : ''));
  }
  if(typeof next === 'function') next();
  return sid;
}

module.exports = { ensurePanelSession: ensurePanelSession, parseCookies: parseCookies };
