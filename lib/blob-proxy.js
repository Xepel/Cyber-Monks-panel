'use strict';

function blobBase(){
  return (process.env.BLOB_BASE || 'https://jsonblob.com/api/jsonBlob').replace(/\/+$/, '');
}

async function blobCreate(body){
  var r = await fetch(blobBase(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body != null ? body : {})
  });
  var loc = r.headers.get('Location') || r.headers.get('location') || '';
  var id = '';
  if(loc){ var parts = loc.split('/'); id = parts[parts.length - 1]; }
  if(!id && r.ok){
    try{
      var j = await r.json();
      if(j && j.id) id = String(j.id);
    }catch(e){}
  }
  return { ok: r.ok, status: r.status, id: id };
}

async function blobGet(id){
  var r = await fetch(blobBase() + '/' + encodeURIComponent(id));
  var data = null;
  try{ data = await r.json(); }catch(e){}
  return { ok: r.ok, status: r.status, data: data };
}

async function blobPut(id, body){
  var r = await fetch(blobBase() + '/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body != null ? body : {})
  });
  return { ok: r.ok, status: r.status };
}

module.exports = { blobCreate: blobCreate, blobGet: blobGet, blobPut: blobPut };
