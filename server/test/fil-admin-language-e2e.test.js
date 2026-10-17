'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
test('admin language switch preserves DOM identity, unsaved login fields and keyed attributes', {skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-admin-language');let browser;
 try {
  browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(s.base+'/app');await page.waitForSelector('#loginEmail');
  assert.equal(await page.$eval('html',e=>e.lang),'tr');
  await page.type('#loginEmail','localization-isolated@example.test');
  await page.evaluate(()=>{window.savedEmailNode=document.getElementById('loginEmail');});
  await page.select('#adminLanguage','en');
  assert.equal(await page.$eval('html',e=>e.lang),'en');
  assert.equal(await page.$eval('#loginEmail',e=>e.value),'localization-isolated@example.test');
  assert(await page.evaluate(()=>savedEmailNode===document.getElementById('loginEmail')),'the router did not recreate the form');
  assert.equal(await page.$eval('#loginBtn',e=>e.textContent.trim()),'Next');
  await page.select('#adminLanguage','tr');
  assert.equal(await page.$eval('#loginBtn',e=>e.textContent.trim()),'Devam');
  await page.reload();await page.waitForSelector('#loginEmail');assert.equal(await page.$eval('#adminLanguage',e=>e.value),'tr');
  // Render bound text and attributes containing hostile user data; switching never executes it.
  await page.evaluate(async()=>{
   const {ht,binding,renderValue}=await import('/js/lib/i18n-bindings.js');
   const {displayValue}=await import('/js/i18n.js');
   const el=document.createElement('div');el.id='languageBindingFixture';
   el.innerHTML=`<button title="initial" data-fil-i18n-title="${binding('kiosk.confirm_delete',{name:'<img src=x onerror=window.translationXSS=1>'})}">${ht('kiosk.confirm_delete',{name:'<img src=x onerror=window.translationXSS=1>'})}</button><select><option>${ht('common.save')}</option></select><p id=fixtureDate>${renderValue(displayValue(new Date('2026-10-17T09:30:00Z'),'toLocaleDateString',{timeZone:'UTC'}))}</p><p id=fixtureCount>${ht('common.minutes_ago',{n:1234})}</p><p id=fixturePercent>${renderValue(displayValue(.25,'toLocaleString',{style:'percent'}))}</p>`;
   document.body.append(el);
  });
  await page.select('#adminLanguage','en');
  assert.equal(await page.$eval('#languageBindingFixture option',e=>e.textContent),'Save');
  assert.equal(await page.$eval('#languageBindingFixture button',e=>e.querySelector('img')),null);
  assert.equal(await page.evaluate(()=>window.translationXSS),undefined);
  assert((await page.$eval('#languageBindingFixture button',e=>e.title)).includes('<img src=x'));
  assert.equal(await page.$eval('#fixtureDate',e=>e.textContent),'10/17/2026');
  assert.equal(await page.$eval('#fixtureCount',e=>e.textContent),'1,234m ago');
  assert.equal(await page.$eval('#fixturePercent',e=>e.textContent),'25%');
  await page.select('#adminLanguage','tr');
  assert.equal(await page.$eval('#fixtureDate',e=>e.textContent),'17.10.2026');
  assert.equal(await page.$eval('#fixtureCount',e=>e.textContent),'1.234 dk önce');
  assert.equal(await page.$eval('#fixturePercent',e=>e.textContent),'%25');
  // Exercise the production destructive dialog, not a synthetic translation template.
  const expected='İÇERİK & <img src=x onerror=window.translationXSS=1>';
  await page.evaluate(async expected=>{const {openTypeToConfirmModal}=await import('/js/components/type-to-confirm-modal.js');openTypeToConfirmModal({title:'İzole onay',expected,onConfirm:()=>{window.confirmedIsolated=1}})},expected);
  await page.waitForSelector('#ttcInput');
  assert((await page.$eval('label[for=ttcInput]',e=>e.textContent)).includes(expected));
  assert.equal(await page.$('label[for=ttcInput] img'),null);
  assert.equal(await page.$eval('#ttcConfirm',e=>e.disabled),true);
  await page.type('#ttcInput',expected);
  await page.waitForSelector('.modal-overlay [data-admin-language]');
  await page.select('.modal-overlay [data-admin-language]','en');
  assert((await page.$eval('label[for=ttcInput]',e=>e.textContent)).includes(expected));
  assert.equal(await page.$eval('#ttcInput',e=>e.value),expected);
  assert.equal(await page.$eval('#ttcConfirm',e=>e.disabled),false);
  assert.equal(await page.evaluate(()=>window.translationXSS),undefined);
  await page.click('#ttcConfirm');assert.equal(await page.evaluate(()=>window.confirmedIsolated),1);
  assert.deepEqual(errors,[]);
 } finally {await browser?.close();s.stop()}
});

test('managed editor retains unsaved nested menu and profile values while labels switch; publish stays explicit', {skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-admin-language-editor');let browser;
 try {
  const user=await s.api('GET','/auth/me');
  const menu=await s.api('POST','/kiosk',{name:'İzole menü',config:{schema:'fil-menu-v1',title:'Değişmeyen yayın içeriği',theme:{primary:'#237c94'},items:[]}});
  browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));},s.token,user);
  await page.goto(s.base+'/app#/kiosk/'+menu.id);await page.waitForSelector('#filTitle');
  await page.$eval('#filTitle',e=>{e.value='Kaydedilmemiş İÇERİK & <test>';});await page.click('#filAdd');
  await page.waitForSelector('[data-field="label"]');await page.$eval('[data-field="label"]',e=>{e.value='Özel kullanıcı öğesi';e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.$eval('#filIdle',e=>{e.value='125'});
  await page.evaluate(()=>{window.savedTitleNode=document.getElementById('filTitle');window.savedLabelNode=document.querySelector('[data-field="label"]');window.savedPreview=document.getElementById('filPreview');});
  await page.waitForSelector('#connectionStatus .status-dot.online');
  await page.select('#adminLanguage','en');
  assert.equal(await page.$eval('#connectionStatus span:last-child',e=>e.textContent),'Connected');
  await page.select('#adminLanguage','tr');
  assert.equal(await page.$eval('#connectionStatus span:last-child',e=>e.textContent),'Bağlı');
  await page.select('#adminLanguage','en');
  assert.equal(await page.$eval('#filSave',e=>e.textContent),'Save draft');
  assert.equal(await page.$eval('#filTitle',e=>e.value),'Kaydedilmemiş İÇERİK & <test>');
  assert.equal(await page.$eval('[data-field="label"]',e=>e.value),'Özel kullanıcı öğesi');
  assert.equal(await page.$eval('#filIdle',e=>e.value),'125');
  assert(await page.evaluate(()=>savedTitleNode===document.getElementById('filTitle')&&savedLabelNode===document.querySelector('[data-field="label"]')&&savedPreview===document.getElementById('filPreview')));
  let stored=JSON.parse((await s.api('GET','/kiosk/'+menu.id)).config);assert.equal(stored.items.length,0,'language switching did not save or publish');
  await page.click('#filSave');await page.waitForFunction(()=>document.getElementById('filStatus').textContent.includes('Draft saved'));
  stored=JSON.parse((await s.api('GET','/kiosk/'+menu.id)).config);assert.equal(stored.items[0].label,'Özel kullanıcı öğesi');assert.equal(stored.title,'Kaydedilmemiş İÇERİK & <test>');
  await page.select('#adminLanguage','tr');assert((await page.$eval('#filStatus',e=>e.textContent)).includes('Taslak kaydedildi'));
  await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const box=await page.$eval('#adminLanguage',e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right}});assert(box.left>=0&&box.right<=390);
  await page.focus('#adminLanguage');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('#adminLanguage',e=>e.value),'en');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();s.stop()}
});

test('language preference follows its account across browsers and stays isolated from another account, including rapid changes', {skip:SKIP,timeout:120000},async()=>{
 const s=await startServer('fil-language-accounts');let browser,otherContext;
 try {
  const first=await s.api('GET','/auth/me');await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});
  const response=await fetch(s.base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'locale-second@example.test',password:'Passw0rd123',name:'İzole ikinci hesap'})});assert.equal(response.status,201);const second=await response.json();
  await fetch(s.base+'/api/auth/me',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+second.token},body:JSON.stringify({ui_mode:'advanced',onboarded:true})});
  browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function signIn(tab,email){await tab.goto(s.base+'/app#/login');await tab.waitForSelector('#loginEmail');await tab.type('#loginEmail',email);await tab.click('#loginBtn');await tab.waitForFunction(()=>getComputedStyle(document.getElementById('loginPassword')).display!=='none');await tab.type('#loginPassword','Passw0rd123');await tab.click('#loginBtn');await tab.waitForFunction(()=>!!localStorage.getItem('token'));await tab.waitForSelector('#logoutBtn');}
  async function me(tab){return tab.evaluate(async()=>fetch('/api/auth/me',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}}).then(r=>r.json()));}
  await signIn(page,first.email);assert.equal(await page.$eval('html',e=>e.lang),'tr');
  await page.select('#adminLanguage','en');await page.waitForFunction(async()=>{const u=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+localStorage.getItem('token')}}).then(r=>r.json());return u.ui_language==='en'});
  await page.reload();await page.waitForSelector('#logoutBtn');assert.equal(await page.$eval('#adminLanguage',e=>e.value),'en');
  await page.click('#logoutBtn');await page.waitForSelector('#loginEmail');assert.equal(await page.$eval('#adminLanguage',e=>e.value),'en');
  await signIn(page,second.user.email);assert.equal(await page.$eval('#adminLanguage',e=>e.value),'tr','a new account does not inherit the previous account\'s language');
  let responses=0;page.on('response',r=>{if(r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/auth/me')responses++});
  await page.select('#adminLanguage','en');await page.select('#adminLanguage','tr');
  await new Promise((resolve,reject)=>{const until=Date.now()+15000;const timer=setInterval(()=>{if(responses>=2){clearInterval(timer);resolve()}else if(Date.now()>until){clearInterval(timer);reject(Error('language preference writes did not complete'))}},50)});
  assert.equal((await me(page)).ui_language,'tr');
  const firstStill=await s.api('GET','/auth/me');assert.equal(firstStill.ui_language,'en');
  otherContext=await browser.createBrowserContext();const fresh=await otherContext.newPage();await signIn(fresh,first.email);assert.equal(await fresh.$eval('#adminLanguage',e=>e.value),'en','account preference follows to a browser with no local cache');
  assert.deepEqual(errors,[]);
 }finally{await otherContext?.close();await browser?.close();s.stop()}
});

test('Turkish decimal typing and localized paste keep native numeric values, caret edits and validation', {skip:SKIP,timeout:60000},async()=>{
 const s=await startServer('fil-locale-number');let browser;
 try{
  browser=await launch();const page=await browser.newPage();await page.goto(s.base+'/app');await page.waitForSelector('#adminLanguage');await page.select('#adminLanguage','tr');
  await page.evaluate(()=>{const input=document.createElement('input');input.type='number';input.id='localeNumber';input.step='0.1';input.min='0';document.body.append(input)});
  await page.focus('#localeNumber');await page.keyboard.type('1,5');assert.equal(await page.$eval('#localeNumber',e=>e.value),'1.5');
  await page.select('#adminLanguage','en');assert.equal(await page.$eval('#localeNumber',e=>e.valueAsNumber),1.5);
  await page.select('#adminLanguage','tr');await page.$eval('#localeNumber',e=>e.value='12.5');await page.focus('#localeNumber');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Backspace');assert.equal(await page.$eval('#localeNumber',e=>e.value),'1.5');
  await page.$eval('#localeNumber',e=>e.value='');await page.focus('#localeNumber');await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','1.234,5');document.getElementById('localeNumber').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  assert.equal(await page.$eval('#localeNumber',e=>e.value),'1234.5');
  await page.$eval('#localeNumber',e=>{e.max='100';});assert.equal(await page.$eval('#localeNumber',e=>e.validity.rangeOverflow),true,'native constraints still apply');
 }finally{await browser?.close();s.stop()}
});

test('a delayed signed-out configuration cannot overwrite a newer authenticated page',{skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-login-generation');let browser,held;
 try{
  await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});const user=await s.api('GET','/auth/me');browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let captured;const capture=new Promise(resolve=>captured=resolve);await page.setRequestInterception(true);
  page.on('request',request=>{if(!held&&new URL(request.url()).pathname==='/api/auth/config'){held=request;captured()}else request.continue()});
  await page.goto(s.base+'/app');await capture;
  await page.evaluate((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));location.hash='#/content'},s.token,user);
  await page.waitForSelector('#fileInput');await held.continue();await page.waitForNetworkIdle({idleTime:200});
  assert(await page.$('#fileInput'),'the authenticated media page remains mounted');assert.equal(await page.$('#loginEmail'),null);assert.deepEqual(errors,[]);
 }finally{await browser?.close();s.stop()}
});
