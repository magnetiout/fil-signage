'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
const {WRITE_CATEGORIES}=require('../lib/mesh/grants');
test('the actual permission screen keeps warnings, nested bindings, attributes and unsaved controls reactive in both languages',{skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-system-messages');let browser;
 try{
  await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});const user=await s.api('GET','/auth/me');browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('rd_onboarded','1')},s.token,user);
  const caps={canMint:false,canEnroll:false,nodeName:'İzole FIL sunucusu',nodeId:'isolated-node',writeCategories:WRITE_CATEGORIES,uplinks:[{edgeId:'isolated-edge',parentNodeId:'isolated-parent',parentName:'IĞDIR & <orijinal kullanıcı adı>',parentUrl:'https://example.invalid',sharing:['health','identity'],sharedWorkspaces:[user.current_workspace_id],lastSyncAt:null,writeGrant:['device-command'],writeGrantExplained:[WRITE_CATEGORIES['device-command'].consequence],writeWorkspaces:[user.current_workspace_id],writeBytesBudget:1073741824,writeBytesUsed:0,writeBytesRemaining:1073741824,shareUpward:false,revoked:false}]};
  await page.setRequestInterception(true);page.on('request',r=>{if(new URL(r.url()).pathname==='/api/mesh/capabilities')r.respond({status:200,contentType:'application/json',body:JSON.stringify(caps)});else r.continue()});
  await page.goto(s.base+'/app#/servers');await page.waitForSelector('[data-wbudget]');await page.$eval('[data-wbudget]',e=>{e.value='7';window.budgetNode=e});await page.$eval('[data-wcat="content-push"]',e=>{e.checked=true;window.checkNode=e});
  await page.evaluate(async()=>{
   const i=await import('/js/i18n.js'),b=await import('/js/lib/i18n-bindings.js'),a=await import('/js/api.js');
   const el=document.createElement('div');el.id='nestedBindingFixture';el.hidden=true;const inner=i.message('common.minutes_ago',{n:1234});const list=i.displayList([i.message('common.save'),i.displayList([inner,'<img onerror=window.translationXSS=1>'],' / ')],' · ');
   el.innerHTML=`<p>${b.uiText(list)}</p><button title="initial"${b.attributeBinding('title',list)}>fixture</button><span>${b.uiText(a.systemMessage('The file is 100x200; it must be at least 300 pixels wide'))}</span>`;document.body.append(el);
  });
  for(const lang of ['en','tr']){
   await page.select('#adminLanguage',lang);const text=await page.$eval('.mesh-write-grant',e=>e.textContent);
   assert(text.includes(lang==='tr'?'YÜKLEYEMEZ':'install software'),text.slice(0,500));if(lang==='tr')assert(!text.includes('nothing'),'zero storage is localized');assert(!text.includes('<span'),'badge renders as markup, not a translation variable');
   assert.equal(await page.$eval('[data-wbudget]',e=>e.value),'7');assert(await page.evaluate(()=>budgetNode===document.querySelector('[data-wbudget]')&&checkNode===document.querySelector('[data-wcat="content-push"]')&&checkNode.checked));
   const binding=await page.$eval('#nestedBindingFixture',e=>({text:e.querySelector('p').textContent,title:e.querySelector('button').title,file:e.querySelector('span').textContent,html:e.querySelector('p img')!==null}));
   assert(binding.text.startsWith(lang==='tr'?'Kaydet · 1.234 dk önce':'Save · 1,234m ago'));assert.equal(binding.title,binding.text);assert.equal(binding.html,false);assert.match(binding.file,lang==='tr'?/piksel/:/pixels/);assert.equal(await page.evaluate(()=>window.translationXSS),undefined);
   if(process.env.FIL_I18N_SCREENSHOTS)await page.screenshot({path:process.env.FIL_I18N_SCREENSHOTS+'/permissions-'+lang+'.png',fullPage:true});
  }
  assert((await page.$eval('body',e=>e.textContent)).includes(caps.uplinks[0].parentName));assert.deepEqual(errors,[]);
 }finally{await browser?.close();s.stop()}
});

test('localized unsigned-template confirmation preserves exact-match safety and the canonical backend phrase',{skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-localized-security-confirmation');let browser;
 try{
  await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});const user=await s.api('GET','/auth/me');browser=await launch();const page=await browser.newPage();
  await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('rd_onboarded','1')},s.token,user);
  await page.goto(s.base+'/app#/templates');await page.waitForSelector('#tplSettingsBtn');await page.click('#tplSettingsBtn');await page.waitForSelector('#tplSetUnsigned');await page.click('#tplSetUnsigned');
  const readPhrase=()=>page.$eval('#tplUnsignedConfirm code',e=>e.textContent);const trPhrase=await readPhrase();assert.match(trPhrase,/İmzasız şablonların/);
  await page.type('#tplUnsignedPhrase',trPhrase);assert.equal(await page.$eval('#tplUnsignedGo',e=>e.disabled),false);
  await page.select('.modal-overlay [data-admin-language]','en');assert.equal(await page.$eval('#tplUnsignedPhrase',e=>e.value),trPhrase);assert.equal(await page.$eval('#tplUnsignedGo',e=>e.disabled),true,'switching does not bypass exact-match gate');
  await page.select('.modal-overlay [data-admin-language]','tr');assert.equal(await page.$eval('#tplUnsignedGo',e=>e.disabled),false);
  const sent=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/templates/settings'&&r.method()==='PUT');await page.click('#tplUnsignedGo');const req=await sent;assert.equal(JSON.parse(req.postData()).confirm,'I understand unsigned templates run unreviewed code on my screens');
  await page.waitForFunction(()=>document.getElementById('tplUnsignedConfirm').style.display==='none');const saved=await s.api('GET','/templates/settings');assert.equal(saved.unsigned_code_allowed,true);
 }finally{await browser?.close();s.stop()}
});
