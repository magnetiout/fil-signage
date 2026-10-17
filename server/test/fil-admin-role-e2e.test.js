'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Database=require('better-sqlite3');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
test('workspace, organization and platform operator roles retain localized labels and server authorization',{skip:SKIP,timeout:120000},async()=>{
 const s=await startServer('fil-language-roles');let browser,db;
 try{
  const owner=await s.api('GET','/auth/me');db=new Database(path.join(s.dataDir,'db','remote_display.db'));
  const org=db.prepare('SELECT organization_id FROM workspaces WHERE id=?').get(owner.current_workspace_id).organization_id;
  browser=await launch();
  for(const role of ['workspace_admin','workspace_editor','workspace_viewer','org_owner','org_admin','platform_operator']){
   const created=await s.api('POST','/admin/users',{email:role+'@isolated.example.test',name:'İzole '+role,password:'Passw0rd123',workspaceId:owner.current_workspace_id,role:role.startsWith('workspace_')?role:'workspace_viewer'});
   if(role.startsWith('org_'))db.prepare('INSERT OR REPLACE INTO organization_members(organization_id,user_id,role) VALUES(?,?,?)').run(org,created.id,role);
   if(role==='platform_operator')db.prepare('UPDATE users SET role=? WHERE id=?').run(role,created.id);
   const session=await fetch(s.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:created.email,password:'Passw0rd123'})}).then(r=>r.json());assert(session.token);
   const headers={Authorization:'Bearer '+session.token,'Content-Type':'application/json'};
   await fetch(s.base+'/api/auth/me',{method:'PUT',headers,body:JSON.stringify({ui_mode:'advanced',onboarded:true})});
   const user=await fetch(s.base+'/api/auth/me',{headers}).then(r=>r.json());
   const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('rd_onboarded','1');},session.token,user);
   await page.goto(s.base+'/app#/members');await page.waitForSelector('#app h1');
   for(const language of ['tr','en']){await page.select('#adminLanguage',language);assert.equal(await page.$eval('html',e=>e.lang),language);assert((await page.$eval('#app',e=>e.innerText)).includes(language==='tr'?'Çalışma alanı üyeleri':'Workspace members'));const labels=await page.$$eval('.member-role,.member-role-select',nodes=>nodes.map(n=>n.textContent).join(' '));assert(!/workspace_admin|workspace_editor|workspace_viewer/.test(labels));}
   if(role==='workspace_viewer'){const denied=await fetch(s.base+'/api/playlists',{method:'POST',headers,body:JSON.stringify({name:'MUST NOT CREATE'})});assert.equal(denied.status,403);await page.goto(s.base+'/app#/platform/users');await page.waitForSelector('#app .empty-state h3');await page.select('#adminLanguage','tr');assert((await page.$eval('#app',e=>e.innerText)).includes('Erişim reddedildi'));}
   assert.deepEqual(errors,[],role);await context.close();
  }
 }finally{db?.close();await browser?.close();s.stop();}
});
