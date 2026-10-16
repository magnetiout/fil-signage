#!/usr/bin/env node
'use strict';
// Explicit target workspace and owner only; never reset a database or create fake online devices.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {db}=require('../db/database');
const config=require('../config');
const workspace=process.env.FIL_DEMO_WORKSPACE;
const source=process.env.FIL_DEMO_ASSETS;
const ws=db.prepare('SELECT * FROM workspaces WHERE id=?').get(workspace||'');
if(!ws||!source)throw Error('Set FIL_DEMO_WORKSPACE and FIL_DEMO_ASSETS explicitly.');
const owner=db.prepare('SELECT owner_user_id AS id FROM organizations WHERE id=?').get(ws.organization_id);
if(!owner)throw Error('Workspace owner required.');
const id=label=>{const h=crypto.createHash('sha256').update(workspace+':fil-demo:'+label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`};
const files=['karsilama.png','hizmetler.png','duyuru.png','karsilama-portrait.png','hizmetler-portrait.png','duyuru-portrait.png','tanitim.mp4','kesfet.mp4'];
fs.mkdirSync(config.contentDir,{recursive:true});
for(const name of files){const src=path.join(source,name);const key=id(name);const dest=key+path.extname(name);if(!fs.existsSync(path.join(config.contentDir,dest)))fs.copyFileSync(src,path.join(config.contentDir,dest));const video=name.endsWith('.mp4');
 db.prepare(`INSERT OR IGNORE INTO content(id,user_id,workspace_id,filename,filepath,mime_type,file_size,duration_sec,width,height) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(key,owner.id,workspace,'ÖRNEK · '+name,dest,video?'video/mp4':'image/png',fs.statSync(src).size,video?6:10,name.includes('portrait')?1080:1920,name.includes('portrait')?1920:1080);
}
for(const portrait of [false,true]){
 const key=id(portrait?'tablet-playlist':'tv-playlist');db.prepare('INSERT OR IGNORE INTO playlists(id,user_id,workspace_id,name) VALUES(?,?,?,?)').run(key,owner.id,workspace,portrait?'ÖRNEK · Tablet yayını':'ÖRNEK · TV yayını');
 const names=portrait?files.slice(3,6).concat(files.slice(6)):files.slice(0,3).concat(files.slice(6));
 names.forEach((name,i)=>{if(!db.prepare('SELECT 1 FROM playlist_items WHERE playlist_id=? AND content_id=?').get(key,id(name)))db.prepare('INSERT INTO playlist_items(playlist_id,content_id,sort_order,duration_sec) VALUES(?,?,?,?)').run(key,id(name),i,name.endsWith('.mp4')?6:10)});
 require('../routes/playlists').publishPlaylist(key,null);
}
const pageId=id('menu');
const item=(key,type,label,parent=null,media=[],description='')=>({id:key,type,label,parent,media,description,order:0,active:true});
const menu={schema:'fil-menu-v1',title:'FIL Signage Demo',theme:{primary:'#237c94',background:'#102230',text:'#ffffff'},allowedHosts:[],items:[
 item('services','category','Hizmetler'),item('consulting','category','Danışmanlık','services'),item('service-detail','page','Dijital deneyim','consulting',[id('hizmetler.png')],'İçerikleri tek merkezden yönetin. Bu sayfa sentetik örnektir.'),
 item('products','page','Ürünler',null,[id('duyuru.png')],'TV yayını ve tablet menüsü aynı merkezden yönetilir.'),item('gallery','gallery','Galeri',null,files.slice(0,3).map(id)),item('about','page','Hakkımızda',null,[],'FIL Signage Demo · Tamamı sentetik tanıtım içeriği.'),item('contact','page','İletişim Bilgileri',null,[],'Bu bir örnek sayfadır. Gerçek kişi bilgisi veya iletişim formu içermez.'),item('video','video','Tanıtım videosu','services',[id('tanitim.mp4')]) ]};
db.prepare('INSERT OR IGNORE INTO kiosk_pages(id,user_id,workspace_id,name,config) VALUES(?,?,?,?,?)').run(pageId,owner.id,workspace,'ÖRNEK · FIL tablet menüsü',JSON.stringify(menu));
const store=require('../lib/fil-kiosk/store');store.publish(db.prepare('SELECT * FROM kiosk_pages WHERE id=?').get(pageId));
// First-party brand only in this explicitly selected synthetic workspace.
if(!db.prepare('SELECT 1 FROM white_labels WHERE workspace_id=?').get(workspace))db.prepare('INSERT INTO white_labels(id,user_id,workspace_id,brand_name,primary_color) VALUES(?,?,?,?,?)').run(id('brand'),owner.id,workspace,'FIL Signage','#237c94');
console.log(JSON.stringify({workspace,media:files.length,playlists:2,menu:pageId,devices:'none; pair physical hardware before assigning a profile'}));
db.close();
