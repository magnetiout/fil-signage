'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Database=require('better-sqlite3');
const {startServer,launch,SKIP}=require('./helpers/web-player-e2e');
test('report exports localize only owned labels, preserving English wire defaults, user data, CSV safety and UTC values',async()=>{
 const s=await startServer('fil-report-locales');let db;
 try{
  const me=await s.api('GET','/auth/me'),d=await s.webPlayerDisplay('=SUM(1,2)');db=new Database(path.join(s.dataDir,'db','remote_display.db'));
  db.prepare('INSERT INTO play_logs(device_id,content_name,started_at,ended_at,duration_sec,completed,workspace_id) VALUES(?,?,?,?,?,?,?)').run(d.id,'ORIGINAL IĞDIR & <not HTML>',Math.floor(Date.now()/1000)-60,Math.floor(Date.now()/1000)-50,10,1,me.current_workspace_id);
  const paths=['/reports/export','/energy/export','/energy/export?by=day','/energy/org/export','/audience/export.csv','/corporate/reports/slots?format=csv'];
  const firstTr=['Cihaz,İçerik','Ekran,Gruplar','Tarih,kWh','Çalışma alanı,Ekran sayısı','Dakika (UTC),Ölçüm aralığı','Oynatma listesi,Yerel içerik alanı'];
  for(let i=0;i<paths.length;i++){
   const request=async language=>{const r=await fetch(s.base+'/api'+paths[i],{headers:{Authorization:'Bearer '+s.token,...(language?{'Accept-Language':language}:{})}});assert.equal(r.status,200,paths[i]);return {text:Buffer.from(await r.arrayBuffer()).toString('utf8'),headers:r.headers}};
   const original=await request(null),en=await request('en-US'),tr=await request('tr-TR');assert.equal(en.text,original.text,'default English API contract: '+paths[i]);assert(!en.text.startsWith('\ufeff'));assert(tr.text.startsWith('\ufeff'+firstTr[i]),paths[i]+' Turkish header');assert.equal(tr.headers.get('content-language'),'tr');assert.match(tr.headers.get('vary'),/Accept-Language/i);
   if(i===0){assert(en.text.includes("\"'=SUM(1,2)\""),'CSV formula is neutralized');assert(tr.text.includes('ORIGINAL IĞDIR & <not HTML>'));assert.equal(en.text.slice(en.text.indexOf('\n')+1).replace(/,Yes$/,''),tr.text.slice(tr.text.indexOf('\n')+1).replace(/,Evet$/,''),'only completion label differs; user data and UTC/numbers unchanged');}
  }
  const txt=await fetch(s.base+'/api/energy/appendix',{headers:{Authorization:'Bearer '+s.token,'Accept-Language':'tr-TR'}}).then(r=>r.text());assert(txt.startsWith('Dijital yayın ekranlarının enerji kullanımı — Default'));assert(txt.includes('TAHMİNDİR; sayaç ölçümü değildir'));assert(txt.includes('2019/2013'));assert(txt.includes('Ember'));assert(!/\{\w+\}/.test(txt),'all appendix variables filled');
 }finally{db?.close();s.stop()}
});
test('the real browser downloads TR/EN proof-of-play CSV with authorization and the active report locale',{skip:SKIP,timeout:90000},async()=>{
 const s=await startServer('fil-report-download');let browser;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fil-i18n-download-'));
 try{
  await s.api('PUT','/auth/me',{ui_mode:'advanced',onboarded:true});const user=await s.api('GET','/auth/me');browser=await launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument((token,user)=>{if(window.top!==window)return;localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('rd_onboarded','1')},s.token,user);
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await page.goto(s.base+'/app#/reports');await page.waitForSelector('#exportBtn');
  for(const language of ['tr','en']){await page.select('#adminLanguage',language);const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/reports/export');await page.click('#exportBtn');const r=await response;assert(!r.url().includes('token='),'no bearer token in the report URL');assert.equal(r.request().headers()['accept-language'],language==='tr'?'tr-TR':'en-US');const file=path.join(dir,'proof-of-play.csv');let ready=false;for(let i=0;i<100;i++){if(fs.existsSync(file)&&fs.statSync(file).size){ready=true;break;}await new Promise(r=>setTimeout(r,50));}assert(ready,'actual download completed');const text=fs.readFileSync(file,'utf8');assert(text.startsWith(language==='tr'?'\ufeffCihaz,İçerik':'Device,Content'));fs.unlinkSync(file);}
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();s.stop();fs.rmSync(dir,{recursive:true,force:true})}
});
