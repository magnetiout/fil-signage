'use strict';
const router = require('express').Router();
const { db } = require('../db/database');
const { denyReadOnly, resourceAccess } = require('../lib/tenancy');
const store = require('../lib/fil-kiosk/store');
function access(req,res,table,id,write=false) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const ws = row && db.prepare('SELECT * FROM workspaces WHERE id = ?').get(row.workspace_id);
  const ctx = ws && resourceAccess(req,ws);
  if (!ctx || row.workspace_id !== req.workspaceId) { res.status(404).json({error:'Kayıt bulunamadı.'}); return null; }
  if (write && denyReadOnly(req,res)) return null;
  if (write && !ctx.actingAs && ctx.workspaceRole==='workspace_viewer') {res.status(403).json({error:'Salt okuma yetkisi.'});return null;}
  return row;
}
router.get('/devices/:deviceId/profile', (req,res)=>{
  const d=access(req,res,'devices',req.params.deviceId);if(!d)return;
  store.init();res.json({...(db.prepare('SELECT * FROM fil_device_profiles WHERE device_id = ?').get(d.id)||{mode:'signage_only',idle_sec:60,warning_sec:10}),applied:store.state(d.id)});
});
router.put('/devices/:deviceId/profile',(req,res)=>{
  const d=access(req,res,'devices',req.params.deviceId,true);if(!d)return;
  const {mode,page_id=null,idle_sec=60,warning_sec=10}=req.body;
  if(!['signage_only','hybrid_kiosk'].includes(mode)||!Number.isInteger(idle_sec)||idle_sec<15||idle_sec>3600||!Number.isInteger(warning_sec)||warning_sec<0||warning_sec>60)return res.status(400).json({error:'Profil veya süre geçersiz.'});
  if(mode==='hybrid_kiosk') {
    if(!access(req,res,'kiosk_pages',page_id))return;
    store.init();if(!db.prepare('SELECT 1 FROM fil_kiosk_publications WHERE page_id = ?').get(page_id))return res.status(400).json({error:'Önce menüyü yayınlayın.'});
    const effective=require('../ws/deviceSocket').buildPlaylistPayload(d.id);
    if(effective.wall_config||effective.group_sync)return res.status(400).json({error:'Senkron yayın grubunda bağımsız kiosk kullanılamaz.'});
  }
  store.init();const old=db.prepare('SELECT page_id FROM fil_device_profiles WHERE device_id=?').get(d.id);
  if(old?.page_id!==page_id || mode==='signage_only')db.prepare('DELETE FROM fil_device_state WHERE device_id=?').run(d.id);
  db.prepare(`INSERT INTO fil_device_profiles(device_id,mode,page_id,idle_sec,warning_sec) VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET mode=excluded.mode,page_id=excluded.page_id,idle_sec=excluded.idle_sec,warning_sec=excluded.warning_sec`).run(d.id,mode,mode==='hybrid_kiosk'?page_id:null,idle_sec,warning_sec);
  require('../services/activity').logActivity(req.user.id,'fil_device_profile',JSON.stringify({mode,page_id,idle_sec,warning_sec}),d.id,req.ip,req.workspaceId);
  notify(req,d.id);res.json(store.payload(d.id));
});
function notify(req,id) {const io=req.app.get('io');if(io)require('../lib/command-queue').queueOrEmitPlaylistUpdate(io.of('/device'),id,require('../ws/deviceSocket').buildPlaylistPayload);}
router.get('/:id/managed-preview',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id);if(!p)return;
 try{const html=store.build(p);res.setHeader('Cache-Control','no-store');res.removeHeader('X-Frame-Options');res.type('html').send(html);}catch(e){res.status(400).json({error:e.message});}
});
router.get('/:id/preview-link',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id);if(!p)return;
 const token=require('jsonwebtoken').sign({page_id:p.id},require('../config').jwtSecret,{algorithm:'HS256',audience:'fil-menu-preview',expiresIn:'5m'});
 res.setHeader('Cache-Control','no-store');res.json({url:`/api/kiosk/${p.id}/render?preview_token=${encodeURIComponent(token)}`});
});
router.get('/:id/versions',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id);if(!p)return;store.init();
 res.json(db.prepare(`SELECT p.version,p.created_at,(a.version=p.version) AS active FROM fil_kiosk_publications p LEFT JOIN fil_kiosk_active a ON a.page_id=p.page_id WHERE p.page_id=? ORDER BY p.version DESC LIMIT 30`).all(p.id));
});
router.post('/:id/activate',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id,true);if(!p)return;
 if(!Number.isInteger(req.body.version))return res.status(400).json({error:'Geçersiz sürüm.'});
 try{const version=store.activate(p.id,req.body.version);
 require('../services/activity').logActivity(req.user.id,'fil_kiosk_activate',JSON.stringify({page_id:p.id,version:version.version}),null,req.ip,req.workspaceId);
 for(const d of db.prepare('SELECT device_id FROM fil_device_profiles WHERE page_id=?').all(p.id))notify(req,d.device_id);
 res.json({version:version.version});}catch(e){res.status(400).json({error:e.message});}
});
router.put('/:id/managed',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id,true);if(!p)return;
 try{const menu=store.validate(p,req.body);db.prepare("UPDATE kiosk_pages SET config=?, updated_at=unixepoch() WHERE id=?").run(JSON.stringify(menu),p.id);require('../services/activity').logActivity(req.user.id,'fil_kiosk_draft',JSON.stringify({page_id:p.id}),null,req.ip,req.workspaceId);res.json({saved:true});}catch(e){res.status(400).json({error:e.message});}
});
router.post('/:id/publish',(req,res)=>{
 const p=access(req,res,'kiosk_pages',req.params.id,true);if(!p)return;
 try{const publication=store.publish(p);require('../services/activity').logActivity(req.user.id,'fil_kiosk_publish',JSON.stringify({page_id:p.id,version:publication.version}),null,req.ip,req.workspaceId);
 for(const d of db.prepare('SELECT device_id FROM fil_device_profiles WHERE page_id=?').all(p.id))notify(req,d.device_id);
 res.json(publication);}catch(e){res.status(400).json({error:e.message});}
});
module.exports=router;
