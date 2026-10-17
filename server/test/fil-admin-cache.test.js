'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('admin cache upgrades invalidate old labels while preserving player/media caches and keep offline lookup in the current release',async()=>{
 const events={},deleted=[],opened=[],assets=[];const cache={addAll:async files=>assets.push(...files),match:async request=>({request,current:true})};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../frontend/sw-admin.js'),'utf8'),{
  self:{addEventListener:(name,fn)=>events[name]=fn,skipWaiting(){},clients:{claim(){}}},
  caches:{keys:async()=>['rd-admin-v4','rd-admin-fil-i18n-v1','rd-content-v1','rd-site-cache-v1'],delete:async name=>deleted.push(name),open:async name=>{opened.push(name);return cache}},
  fetch:async()=>{throw Error('offline')}
 });
 let pending;events.install({waitUntil:p=>pending=p});await pending;
 for(const file of ['/js/i18n/en.js','/js/i18n/tr.js','/js/i18n.js','/js/lib/i18n-bindings.js'])assert(assets.includes(file));
 events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['rd-admin-v4']);
 events.fetch({request:{method:'GET',url:'https://example.test/js/i18n/tr.js',headers:{has:()=>false}},respondWith:p=>pending=p});assert.equal((await pending).current,true);assert(opened.every(name=>name==='rd-admin-fil-i18n-v1'));
 for(const url of ['/api/auth/me','/uploads/example.mp4','/player','/socket.io/']){let intercepted=false;events.fetch({request:{method:'GET',url,headers:{has:()=>false}},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);}
});
