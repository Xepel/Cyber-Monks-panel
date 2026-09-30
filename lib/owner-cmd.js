'use strict';

var panelState = require('./panel-state');

function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function createOwnerHandlers(api){
  async function tgSend(chatId, text){
    return api.tgCall('sendMessage', '', { chat_id: chatId, text: text, parse_mode: 'HTML' });
  }

  return async function handleOwnerCommand(msg){
    var txt = String(msg.text || '').trim();
    var cmd = txt.toLowerCase();
    var chatId = msg.chat.id;
    var actorUid = String((msg.from && msg.from.id) || chatId);
    var st = panelState.getState();

    if(cmd === '/backup' || cmd === '/bk'){
      if(api.runBackupFull) await api.runBackupFull(chatId, actorUid);
      else await tgSend(chatId, '⛔ Backup module unavailable');
      return;
    }
    if(cmd === '/backup_new' || cmd === '/bkn'){
      if(api.runBackupNew) await api.runBackupNew(chatId, actorUid);
      else await tgSend(chatId, '⛔ Backup module unavailable');
      return;
    }
    if(cmd === '/status' || cmd === '/st'){
      var online = st.devices.filter(function(d){ return d.status; }).length;
      var uids = api.getAllUserIds ? await api.getAllUserIds(actorUid) : [];
      var txt2 = '📊 <b>Status</b> (server)\n\n📱 ' + st.devices.length + ' (' + online + ' 🟢)\n👥 Pending: ' + (uids.length || 0)
        + '\n🤖 ' + (api.getWorkerStatus && api.getWorkerStatus().running ? '✅' : '⛔')
        + '\n📢 ' + (st.userConfig.channelId || '—') + '\n🕐 ' + new Date().toLocaleString();
      await tgSend(chatId, txt2);
      return;
    }
    if(cmd === '/devices' || cmd === '/dev'){
      var t = '📱 Devices (' + st.devices.length + ' · ' + st.devices.filter(function(d){ return d.status; }).length + ' online)\n\n';
      st.devices.slice(0, 50).forEach(function(d, i){
        t += '#' + (d.deviceOrder || i + 1) + ' ' + (d.status ? '🟢' : '🔴') + ' ' + esc(d.name) + ' · ' + (d.mobNo || '—') + '\n';
      });
      await tgSend(chatId, t);
      return;
    }
    if(cmd === '/help' || cmd === '/start'){
      await tgSend(chatId, '🤖 <b>Owner Commands</b> (server)\n\n/backup · /backup_new\n/status · /devices\n/broadcast &lt;msg&gt;');
      return;
    }
    if(cmd.startsWith('/broadcast ') || cmd === '/broadcast'){
      var t3 = txt.replace(/^\/broadcast\s*/i, '').trim();
      if(!t3){ await tgSend(chatId, 'Usage: <code>/broadcast message</code>'); return; }
      var body = '📢 <b>Broadcast</b>\n\n' + esc(t3);
      if(st.userConfig.channelId){
        try{ await api.tgCall('sendMessage', '', { chat_id: st.userConfig.channelId, text: body, parse_mode: 'HTML' }); }catch(e){}
      }
      if(!api.getAllUserIds) return;
      var uids2 = await api.getAllUserIds(actorUid);
      var s2 = 0, f2 = 0;
      for(var bj=0; bj<uids2.length; bj++){
        if(String(uids2[bj]) === String(chatId)) continue;
        try{
          var rr = await api.tgCall('sendMessage', '', { chat_id: uids2[bj], text: body, parse_mode: 'HTML' });
          if(rr && rr.ok) s2++; else f2++;
        }catch(e){ f2++; }
      }
      await tgSend(chatId, '✅ Done\n👥 ' + s2 + ' ✔ · ' + f2 + ' ✖');
    }
  };
}

module.exports = { createOwnerHandlers: createOwnerHandlers };
