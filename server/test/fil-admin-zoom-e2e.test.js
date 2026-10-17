'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {startServer,SKIP}=require('./helpers/web-player-e2e');
test('admin language selector and unsaved dialog remain usable at actual Chrome 200% zoom and on a narrow screen',{skip:SKIP||(!process.env.CHROME?'set CHROME to run native browser zoom acceptance':false),timeout:90000},async()=>{
 const s=await startServer('fil-native-zoom'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fil-zoom-'));let browser;
 try{
  // Local test-only extension uses Chrome's own tab zoom, not CSS zoom or a screenshot scale.
  fs.writeFileSync(tmp+'/manifest.json',JSON.stringify({manifest_version:3,name:'FIL local zoom acceptance',version:'1.0',permissions:['tabs'],background:{service_worker:'background.js'}}));fs.writeFileSync(tmp+'/background.js','chrome.runtime.onInstalled.addListener(()=>{});');
  await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});const user=await s.api('GET','/auth/me');
  browser=await require('puppeteer-core').launch({executablePath:process.env.CHROME,headless:'new',defaultViewport:null,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--window-size=1366,900','--disable-extensions-except='+tmp,'--load-extension='+tmp]});
  const target=await browser.waitForTarget(t=>t.type()==='service_worker',{timeout:10000}),worker=await target.worker(),page=await browser.newPage();await page.goto(s.base+'/app');await page.evaluate((token,user)=>{localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user))},s.token,user);await page.goto(s.base+'/app#/playlists');await page.waitForSelector('#createPlaylistBtn');
  const tabId=await worker.evaluate(async base=>(await chrome.tabs.query({})).find(t=>t.url?.startsWith(base)).id,s.base);await worker.evaluate(id=>chrome.tabs.setZoom(id,2),tabId);await page.waitForFunction(()=>devicePixelRatio===2);
  assert.equal(await worker.evaluate(id=>chrome.tabs.getZoom(id),tabId),2);
  for(const language of ['tr','en']){
   await page.select('#adminLanguage',language);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.click('#createPlaylistBtn');await page.waitForSelector('[role=dialog] [data-admin-language]');await page.type('#newPlaylistName','Özgün taslak');
   await page.focus('[role=dialog] [data-admin-language]');await page.keyboard.press(language==='tr'?'ArrowDown':'ArrowUp');await page.keyboard.press('Enter');assert.equal(await page.$eval('#newPlaylistName',e=>e.value),'Özgün taslak');
   const rect=await page.$eval('#confirmCreateBtn',e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}});assert(rect.left>=0&&rect.right<=rect.width);
   if(process.env.FIL_I18N_ARTIFACTS){fs.mkdirSync(process.env.FIL_I18N_ARTIFACTS,{recursive:true});await page.screenshot({path:path.join(process.env.FIL_I18N_ARTIFACTS,'dialog-200-'+await page.$eval('html',e=>e.lang)+'.png')});}
   await page.click('#cancelCreateBtn');
  }
  await worker.evaluate(id=>chrome.tabs.setZoom(id,1),tabId);await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.focus('#adminLanguage');await page.keyboard.press('Home');await page.keyboard.press('Enter');assert.equal(await page.$eval('#adminLanguage',e=>e.value),'tr');
 }finally{await browser?.close();s.stop();fs.rmSync(tmp,{recursive:true,force:true})}
});
