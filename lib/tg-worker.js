'use strict';

var panelState = require('./panel-state');
var tgChannel = require('./tg-channel');

var TG_LONGPOLL = 50;
var running = false;
var useWebhook = false;
var offset = 0;
var status = {
  running: false,
  lastError: '',
  lastUpdate: 0,
  updateCount: 0,
  botInfo: null,
  lastRoute: null,
  mode: 'longpoll'
};

var deps = null;

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

async function tgCall(method, query, payload){
  if(!deps || !deps.tgApiBase) throw new Error('TG not configured');
  var url = deps.tgApiBase + '/' + method + (query ? '?' + query : '');
  var opts = payload != null
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : { method: 'GET' };
  var r = await fetch(url, opts);
  return r.json();
}

function canPoll(){
  return !!(deps && deps.botToken);
}

function channelReady(){
  var st = panelState.getState();
  var uc = st.userConfig || {};
  return !!(uc.channelId && uc.botEnabled !== false);
}

async function processChannelUpdate(u){
  var msg = u.channel_post || u.message;
  if(!msg) return;
  if(!channelReady()) return;
  if(!tgChannel.isChannelMatch(msg)) return;
  var text = String(msg.text || msg.caption || '').trim();
  if(!text) return;
  var parsed = tgChannel.parseTelegramMessage(text);
  if(!parsed.valid) return;
  var route = await tgChannel.routeChannelSms(parsed.number, parsed.message, msg);
  status.lastRoute = { at: Date.now(), route: route, number: parsed.number, ms: 0 };
  if(route.ok) console.log('[TG-Server] ⚡ SMS → ' + route.device + ' → ' + parsed.number);
  else console.warn('[TG-Server] Route fail:', route.reason || '?');
}

async function processUpdate(u){
  var msg = u.channel_post || u.message;
  if(!msg) return;

  if(msg.from && msg.from.is_bot){
    var myId = status.botInfo && status.botInfo.id;
    if(myId && msg.from.id === myId) return;
  }

  if(u.channel_post || (msg.chat && (msg.chat.type === 'channel' || msg.chat.type === 'supergroup'))){
    await processChannelUpdate(u);
    return;
  }

  var isPrivate = msg.chat && msg.chat.type === 'private';
  var fromId = msg.from && String(msg.from.id);
  var text = String(msg.text || msg.caption || '').trim();

  if(isPrivate && /^\//.test(text) && fromId && deps.isOwner(fromId)){
    if(deps.handleOwnerCommand) await deps.handleOwnerCommand(msg);
    return;
  }
  if(isPrivate && !/^\//.test(text) && deps.handleUserPrivate){
    await deps.handleUserPrivate(msg);
  }
}

async function processUpdatesBatch(updates){
  var channelFirst = updates.slice().sort(function(a, b){
    var ac = a.channel_post ? 0 : 1;
    var bc = b.channel_post ? 0 : 1;
    return ac - bc;
  });
  var channelJobs = [];
  var other = [];
  for(var i=0; i<channelFirst.length; i++){
    if(channelFirst[i].channel_post) channelJobs.push(processChannelUpdate(channelFirst[i]));
    else other.push(channelFirst[i]);
  }
  if(channelJobs.length) await Promise.all(channelJobs);
  for(var j=0; j<other.length; j++){
    try{ await processUpdate(other[j]); }catch(e){ console.error('[TG-Server]', e.message); }
  }
}

async function workerLoop(){
  var backoff = 50;
  while(running && !useWebhook){
    if(!canPoll()){
      await sleep(500);
      continue;
    }
    try{
      var q = 'timeout=' + TG_LONGPOLL
        + '&offset=' + offset
        + '&limit=100'
        + '&allowed_updates=' + encodeURIComponent(JSON.stringify(['channel_post', 'message']));

      var data = await tgCall('getUpdates', q, null);
      if(!data.ok){
        status.lastError = data.description || 'getUpdates failed';
        if(data.description && data.description.indexOf('Conflict') !== -1) await sleep(300);
        else await sleep(Math.min(backoff, 2000));
        backoff = Math.min(backoff * 2, 2000);
        continue;
      }
      backoff = 50;
      status.lastError = '';

      if(data.result && data.result.length){
        status.updateCount += data.result.length;
        status.lastUpdate = Date.now();
        var maxId = offset - 1;
        for(var i=0;i<data.result.length;i++){
          if(data.result[i].update_id > maxId) maxId = data.result[i].update_id;
        }
        offset = maxId + 1;
        await processUpdatesBatch(data.result);
      }
    }catch(e){
      status.lastError = e.message || 'worker error';
      await sleep(Math.min(backoff, 2000));
      backoff = Math.min(backoff * 2, 2000);
    }
  }
  if(!useWebhook) status.running = false;
}

async function startWorker(d, opts){
  opts = opts || {};
  deps = d;
  if(!deps.botToken) return;
  if(running && !opts.force) return;

  try{
    var me = await tgCall('getMe', '', null);
    if(!me.ok){
      status.lastError = me.description || 'getMe failed';
      return;
    }
    status.botInfo = me.result;

    if(opts.webhookUrl){
      useWebhook = true;
      status.mode = 'webhook';
      await tgCall('deleteWebhook', 'drop_pending_updates=false', null);
      var wh = await tgCall('setWebhook', '', {
        url: opts.webhookUrl,
        allowed_updates: ['channel_post', 'message'],
        drop_pending_updates: false
      });
      if(!wh.ok){
        status.lastError = wh.description || 'setWebhook failed';
        useWebhook = false;
      } else {
        running = true;
        status.running = true;
        console.log('[TG-Server] Webhook mode → instant channel delivery');
        return;
      }
    }

    useWebhook = false;
    status.mode = 'longpoll';
    await tgCall('deleteWebhook', 'drop_pending_updates=false', null);
    var d2 = await tgCall('getUpdates', 'offset=-1&timeout=0&limit=1', null);
    if(d2.ok && d2.result && d2.result.length) offset = d2.result[d2.result.length - 1].update_id + 1;
    else offset = 0;
  }catch(e){
    status.lastError = e.message;
    return;
  }

  running = true;
  status.running = true;
  status.lastError = '';
  console.log('[TG-Server] Always-on worker (long poll ' + TG_LONGPOLL + 's)');
  workerLoop();
}

function stopWorker(){
  running = false;
  status.running = false;
}

function isRunning(){ return running && status.running; }

function getStatus(){
  var st = panelState.getState();
  return {
    running: status.running,
    lastError: status.lastError,
    lastUpdate: status.lastUpdate,
    updateCount: status.updateCount,
    botInfo: status.botInfo,
    lastRoute: status.lastRoute,
    lastSyncAt: st.lastSyncAt,
    channelConfigured: !!(st.userConfig && st.userConfig.channelId),
    mode: status.mode
  };
}

function onPanelSync(){
  if(canPoll() && !isRunning()) startWorker(deps || {});
}

async function ingestUpdate(u){
  if(!u) return;
  status.updateCount++;
  status.lastUpdate = Date.now();
  try{
    if(u.update_id != null && u.update_id >= offset) offset = u.update_id + 1;
    await processUpdatesBatch([u]);
  }catch(e){ console.error('[TG-Server] webhook', e.message); }
}

module.exports = {
  startWorker: startWorker,
  stopWorker: stopWorker,
  getStatus: getStatus,
  onPanelSync: onPanelSync,
  isRunning: isRunning,
  ingestUpdate: ingestUpdate
};
