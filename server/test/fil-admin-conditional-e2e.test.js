'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Database=require('better-sqlite3');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
test('conditional account screens switch both languages without losing password input or granting workspace access',{skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-conditional-language');let browser,db;
 try{
  const owner=await s.api('GET','/auth/me');
  const created=await s.api('POST','/admin/users',{email:'conditional@isolated.example.test',name:'İzole hesap',password:'Passw0rd123',workspaceId:owner.current_workspace_id,role:'workspace_editor'});
  const session=await fetch(s.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:created.email,password:'Passw0rd123'})}).then(r=>r.json());assert(session.token);
  const headers={Authorization:'Bearer '+session.token};
  // This fixture database belongs exclusively to this ephemeral test server.
  db=new Database(path.join(s.dataDir,'db','remote_display.db'));
  db.prepare('UPDATE users SET must_change_password=1 WHERE id=?').run(created.id);
  let user=await fetch(s.base+'/api/auth/me',{headers}).then(r=>r.json());assert.equal(user.must_change_password,1);
  browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));},session.token,user);
  await page.goto(s.base+'/app');await page.waitForSelector('#fpwCurrent');
  await page.type('#fpwCurrent','Unsaved-secret-in-test-only');
  for(const language of ['en','tr']){await page.select('#adminLanguage',language);assert.equal(await page.$eval('html',e=>e.lang),language);assert.equal(await page.$eval('#fpwCurrent',e=>e.value),'Unsaved-secret-in-test-only');assert((await page.$eval('#app',e=>e.innerText)).includes(language==='tr'?'parola':'password'));}
  db.prepare('UPDATE users SET must_change_password=0 WHERE id=?').run(created.id);
  db.prepare('DELETE FROM workspace_members WHERE user_id=?').run(created.id);
  db.prepare('DELETE FROM organization_members WHERE user_id=?').run(created.id);
  user=await fetch(s.base+'/api/auth/me',{headers}).then(r=>r.json());assert.deepEqual(user.accessible_workspaces,[]);
  // Replace the bootstrap fixture for the next document, without changing any production account.
  const context=await browser.createBrowserContext(),empty=await context.newPage();empty.on('pageerror',e=>errors.push(e.message));
  const bootstrap=await empty.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));},session.token,user);
  await empty.goto(s.base+'/app');await empty.waitForSelector('#noWsSignOut');await empty.removeScriptToEvaluateOnNewDocument(bootstrap.identifier);
  for(const language of ['tr','en']){await empty.select('#adminLanguage',language);assert.equal(await empty.$eval('html',e=>e.lang),language);const text=await empty.$eval('#app',e=>e.innerText);assert(text.includes(language==='tr'?'çalışma alanı':'workspace'));assert(await empty.$('a[href="#/delete-account"]'));}
  await empty.click('#noWsSignOut');await empty.waitForSelector('#loginEmail');assert.equal(await empty.evaluate(()=>localStorage.getItem('token')),null);
  assert.deepEqual(errors,[]);
 }finally{db?.close();await browser?.close();s.stop();}
});
