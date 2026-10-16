'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Database}=require('../db/sqlite-driver');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
const menu=()=>({schema:'fil-menu-v1',title:'Türkçe test menüsü',theme:{primary:'#237c94'},items:[{id:'services',label:'Hizmetler',type:'category'},{id:'detail',label:'Çözüm',type:'page',parent:'services',description:'Güvenli açıklama'}]});
test('real HTTP: editor/viewer and workspace boundaries, publishing, authenticated bundle and delete safety',async()=>{
 const s=await startServer('fil-managed');let database;
 try{
 const page=await s.api('POST','/kiosk',{name:'Test menüsü',config:menu()});
 const display=await s.webPlayerDisplay('Eşleşmemiş test cihazı');
 database=new Database(path.join(s.dataDir,'db','remote_display.db'));
 const deviceToken=crypto.randomBytes(32).toString('hex');database.prepare('UPDATE devices SET device_token=? WHERE id=?').run(deviceToken,display.id);
 const d=database.prepare('SELECT * FROM devices WHERE id=?').get(display.id);
 async function raw(p,method='GET',body,token=s.token,workspace){return fetch(s.base+'/api'+p,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(workspace?{'X-Workspace-Id':workspace}:{})},...(body?{body:JSON.stringify(body)}:{})})}
 assert.equal((await raw(`/fil-kiosk/devices/${d.id}/profile`,'PUT',{mode:'hybrid_kiosk',page_id:page.id})).status,400,'unpublished menu refused');
 const p=await s.api('POST',`/fil-kiosk/${page.id}/publish`,{});assert.equal(p.version,1);
 assert.equal((await s.api('POST',`/fil-kiosk/${page.id}/publish`,{})).version,1);
 const profile=await s.api('PUT',`/fil-kiosk/devices/${d.id}/profile`,{mode:'hybrid_kiosk',page_id:page.id,idle_sec:60,warning_sec:10});
 const url=`/kiosk/${page.id}/render?fil_version=${p.version}&device=${d.id}`;
 assert.equal((await raw(url)).status,403,'admin bearer is not a device credential');
 const r=await raw(url,'GET',null,deviceToken);assert.equal(r.status,200);const html=await r.text();assert.equal(crypto.createHash('sha256').update(html).digest('hex'),profile.sha256);
 const reg=await raw('/auth/register','POST',{email:'other@fil.invalid',password:'Another-Test-12345',name:'Viewer'});const other=await reg.json();assert.ok(other.token);
 assert.equal((await raw(`/fil-kiosk/${page.id}/managed`,'PUT',menu(),other.token)).status,404);
 database.prepare('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,?)').run(d.workspace_id,other.user.id,'workspace_viewer');
 assert.equal((await raw(`/fil-kiosk/${page.id}/managed`,'PUT',menu(),other.token,d.workspace_id)).status,403);
 assert.equal((await raw(`/fil-kiosk/devices/${d.id}/profile`,'PUT',{mode:'signage_only'},other.token,d.workspace_id)).status,403);
 database.prepare("UPDATE workspace_members SET role='workspace_editor' WHERE workspace_id=? AND user_id=?").run(d.workspace_id,other.user.id);
 assert.equal((await raw(`/fil-kiosk/${page.id}/managed`,'PUT',menu(),other.token,d.workspace_id)).status,200);
 assert.equal((await raw(`/kiosk/${page.id}`,'DELETE')).status,409);
 assert.equal((await raw(`/fil-kiosk/devices/${d.id}/profile`,'PUT',{mode:'hybrid_kiosk',page_id:page.id,idle_sec:0})).status,400);
 const png=path.join(s.dataDir,'fixture.png');fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64'));
 const media=await s.upload(png,'image/png');const m=menu();m.items[1].media=[media.id];await s.api('PUT',`/fil-kiosk/${page.id}/managed`,m);
 assert.equal((await raw(`/content/${media.id}`,'DELETE')).status,409);
 assert.equal((await raw('/content/batch/delete','POST',{ids:[media.id]})).status,409);
 const draft=await s.api('GET',`/kiosk/${page.id}`);assert.equal(JSON.parse(draft.config).items[1].media[0],media.id);
 console.log('FIL HTTP integration: tenant/editor/viewer, publish, private SHA bundle, draft and deletion guards PASS');
 }finally{database?.close();s.stop()}
});
test('real headless browser: login, managed editor, publish, hierarchy, narrow/wide and offline bundled menu', {skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-browser');let browser;
 try{
 const user=await s.api('GET','/auth/me');const page=await s.api('POST','/kiosk',{name:'Tarayıcı test menüsü',config:menu()});
 browser=await launch();const tab=await browser.newPage();const errors=[];tab.on('pageerror',e=>errors.push(e.message));
 await tab.setViewport({width:1366,height:900});await tab.goto(s.base+'/app');await tab.waitForSelector('#loginEmail');
 await tab.type('#loginEmail',user.email);await tab.click('#loginBtn');await tab.waitForFunction(()=>getComputedStyle(document.getElementById('loginPassword')).display!=='none');
 await tab.type('#loginPassword','Passw0rd123');await tab.click('#loginBtn');
 await tab.waitForFunction(()=>!!localStorage.getItem('token'));await tab.goto(s.base+'/app#/kiosk/'+page.id);await tab.waitForSelector('#filTitle');
 await tab.$eval('#filTitle',e=>{e.value='Güncel Türkçe menü'});await tab.click('#filSave');await tab.waitForFunction(()=>document.getElementById('filStatus').textContent.includes('Taslak kaydedildi'));
 assert.equal(JSON.parse((await s.api('GET',`/kiosk/${page.id}`)).config).title,'Güncel Türkçe menü');
 await tab.click('#filPublish');await tab.waitForFunction(()=>document.getElementById('filStatus').textContent.includes('Menü yayınlandı'));
 await tab.setViewport({width:390,height:844});assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone layout has no horizontal overflow');
 await tab.setViewport({width:1366,height:900});const artifact=process.env.FIL_TEST_ARTIFACTS;if(artifact){fs.mkdirSync(artifact,{recursive:true});await tab.screenshot({path:path.join(artifact,'managed-menu.png'),fullPage:true})}
 await tab.waitForFunction(()=>document.getElementById('filPreview').contentWindow!==null);const preview=await (await tab.$('#filPreview')).contentFrame();assert.ok(preview);await preview.waitForSelector('.tile');await preview.click('.tile');assert.equal(await preview.$eval('#title',e=>e.textContent),'Hizmetler');await preview.click('.tile');assert.equal(await preview.$eval('#detail',e=>e.textContent),'Güvenli açıklama');
 await tab.setOfflineMode(true);await preview.click('#home');assert.equal(await preview.$eval('#title',e=>e.textContent),'Güncel Türkçe menü');await tab.setOfflineMode(false);
 assert.deepEqual(errors,[],'no uncaught browser errors');console.log('FIL browser workflow, persisted draft/publish, 390/1366 viewports, offline navigation PASS');
 }finally{await browser?.close();s.stop()}
});
