'use strict';

var panelState = require('./panel-state');

var dispatchDedup = new Set();
var formatCache = new Map();

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

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
  var userConfig = panelState.getState().userConfig;
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
      message = message.replace(/<\/?[a-z]+>/gi, '');
      message = message.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/u, '').trim();
      var cut = message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);
      if(cut > 0) message = message.substring(0, cut).trim();
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
    message = message.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/u, '').trim();
    var cut2 = message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);
    if(cut2 > 0) message = message.substring(0, cut2).trim();
  }
  if(message && message.length < 2) message = null;
  if(number && number.length < 10) number = null;
  return { number: number, message: message, valid: !!(number && message) };
}

function passesRestriction(sender, message, msgObj){
  var userConfig = panelState.getState().userConfig;
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

function isChannelMatch(msg){
  var userConfig = panelState.getState().userConfig;
  var chatId = String((msg.chat && msg.chat.id) || '');
  var chatUser = String((msg.chat && msg.chat.username) || '').toLowerCase();
  var cfg = String(userConfig.channelId || ''); if(!cfg) return false;
  if(cfg.startsWith('@')) return chatUser === cfg.slice(1).toLowerCase();
  var cfgNum = cfg.replace(/[^\-\d]/g, '');
  return chatId === cfgNum || chatId === cfg;
}

function getActiveDevice(){
  var st = panelState.getState();
  if(!st.activeDeviceUid) return null;
  var p = st.activeDeviceUid.split('|||');
  var fbId = p[0] || 'primary';
  var devId = p[1];
  return st.devices.find(function(x){ return x.id === devId && (x._fbId || 'primary') === fbId; })
    || st.devices.find(function(x){ return x.id === devId; })
    || null;
}

async function tryPut(url, body){
  var r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.ok;
}

async function dispatchSms(dev, sim, to, message){
  if(!dev) return false;
  var fbUrl = dev._fbUrl || panelState.getState().fbUrl;
  var fbKey = dev._fbKey != null ? dev._fbKey : panelState.getState().fbKey;
  if(!fbUrl) return false;

  var base = fbUrl + '/clients/' + dev.id + '/webhookEvent/sendSms.json'
    + (fbKey ? '?auth=' + fbKey : '');

  var formats = [
    { from: sim, to: to, message: message, isSended: false },
    { from: String(sim), to: String(to), message: String(message), isSended: false, isSendedNew: false },
    { sim: sim, to: to, message: message, isSended: false }
  ];

  var cacheKey = (dev._fbId || 'primary') + ':' + dev.id;
  var cached = formatCache.get(cacheKey);
  if(cached != null && cached >= 0 && cached < formats.length){
    if(await tryPut(base, formats[cached])) return true;
  }

  var results = await Promise.all(formats.map(function(body, idx){
    return tryPut(base, body).then(function(ok){ return ok ? idx : -1; });
  }));
  for(var r=0; r<results.length; r++){
    if(results[r] >= 0){
      formatCache.set(cacheKey, results[r]);
      return true;
    }
  }
  return false;
}

function dedupeKey(msg){ return msg.chat.id + '::' + msg.message_id; }

async function routeChannelSms(number, message, msgObj){
  var key = dedupeKey(msgObj);
  if(dispatchDedup.has(key)) return { ok: false, reason: 'dup' };
  dispatchDedup.add(key);
  if(dispatchDedup.size > 3000){
    dispatchDedup = new Set(Array.from(dispatchDedup).slice(-1500));
  }

  if(!passesRestriction(number, message, msgObj)) return { ok: false, reason: 'restricted' };

  var st = panelState.getState();
  var dev = getActiveDevice();
  if(!dev){
    dev = st.devices.find(function(d){ return d.status; }) || null;
    if(dev) st.activeDeviceUid = (dev._fbId || 'primary') + '|||' + dev.id;
  }
  if(!dev) return { ok: false, reason: 'no_device' };
  if(!dev.status) return { ok: false, reason: 'offline', device: dev.name };

  var sim = st.deviceSimMap[dev.id] || 1;
  panelState.pushCapture(number, message);
  var sent = await dispatchSms(dev, sim, number, message);
  return { ok: sent, device: dev.name, number: number };
}

module.exports = {
  parseTelegramMessage: parseTelegramMessage,
  isChannelMatch: isChannelMatch,
  routeChannelSms: routeChannelSms,
  passesRestriction: passesRestriction
};
