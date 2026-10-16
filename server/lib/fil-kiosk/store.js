'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const { db } = require('../../db/database');
const { validateMenu } = require('./model');
const render = require('./render');
let ready = false;
function init() {
  if (ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS fil_kiosk_publications (
    page_id TEXT NOT NULL REFERENCES kiosk_pages(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL, manifest TEXT NOT NULL, sha256 TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(page_id,version));
    CREATE TABLE IF NOT EXISTS fil_kiosk_active (
    page_id TEXT PRIMARY KEY REFERENCES kiosk_pages(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL,
    FOREIGN KEY(page_id,version) REFERENCES fil_kiosk_publications(page_id,version) ON DELETE RESTRICT);
    INSERT OR IGNORE INTO fil_kiosk_active(page_id,version) SELECT page_id,MAX(version) FROM fil_kiosk_publications GROUP BY page_id;
    CREATE TABLE IF NOT EXISTS fil_device_profiles (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'signage_only' CHECK(mode IN ('signage_only','hybrid_kiosk')),
    page_id TEXT REFERENCES kiosk_pages(id) ON DELETE RESTRICT,
    idle_sec INTEGER NOT NULL DEFAULT 60 CHECK(idle_sec BETWEEN 15 AND 3600),
    warning_sec INTEGER NOT NULL DEFAULT 10 CHECK(warning_sec BETWEEN 0 AND 60));
    CREATE TABLE IF NOT EXISTS fil_device_state (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, sha256 TEXT NOT NULL, applied_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_fil_profile_page ON fil_device_profiles(page_id);`);
  ready = true;
}
const bundleDir = path.join(config.dataDir, 'fil-kiosk');
function bundlePath(id, version) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !Number.isSafeInteger(Number(version)) || Number(version)<1) throw new Error('Geçersiz yayın.');
  return path.join(bundleDir, `${id}-${version}.html`);
}
function validate(page, menu) {
  return validateMenu(menu, id => db.prepare('SELECT * FROM content WHERE id = ? AND workspace_id = ?').get(id, page.workspace_id));
}
function build(page) {
  const menu = validate(page, JSON.parse(page.config));
  const assets = {}; let bytes = 0;
  for (const id of new Set(menu.items.flatMap(x => x.media || []))) {
    const c = db.prepare('SELECT * FROM content WHERE id = ? AND workspace_id = ?').get(id, page.workspace_id);
    const file = path.join(config.contentDir, path.basename(c.filepath));
    const stat = fs.statSync(file); bytes += stat.size;
    if (bytes > 20 * 1024 * 1024) throw new Error('Çevrimdışı menü medya sınırı 20 MB. Daha kısa videolar kullanın.');
    const data = fs.readFileSync(file);
    assets[id] = { mime: c.mime_type, data: `data:${c.mime_type};base64,${data.toString('base64')}` };
  }
  return render(menu, assets);
}
function publish(page) {
  init();
  const html = build(page);
  const menu = JSON.parse(page.config);
  const sha = crypto.createHash('sha256').update(html).digest('hex');
  const latest = db.prepare('SELECT * FROM fil_kiosk_publications WHERE page_id = ? ORDER BY version DESC LIMIT 1').get(page.id);
  if (latest?.sha256 === sha) { activate(page.id,latest.version);return latest; }
  const version = (latest?.version || 0) + 1;
  fs.mkdirSync(bundleDir, { recursive: true, mode: 0o700 });
  const dest = bundlePath(page.id, version);
  fs.writeFileSync(dest + '.tmp', html, { mode: 0o600 }); fs.renameSync(dest + '.tmp', dest);
  const manifest = JSON.stringify({ schema: 'fil-menu-v1', version, bytes: Buffer.byteLength(html), media: [...new Set(menu.items.flatMap(x => x.media || []))], allowed_hosts: menu.allowedHosts || [] });
  db.transaction(() => {
    db.prepare('INSERT INTO fil_kiosk_publications(page_id,version,manifest,sha256) VALUES(?,?,?,?)').run(page.id,version,manifest,sha);
    db.prepare('INSERT INTO fil_kiosk_active(page_id,version) VALUES(?,?) ON CONFLICT(page_id) DO UPDATE SET version=excluded.version').run(page.id,version);
  })();
  return { page_id: page.id, version, sha256: sha, manifest };
}
function payload(deviceId) {
  init(); const profile = db.prepare('SELECT * FROM fil_device_profiles WHERE device_id = ?').get(deviceId);
  if (!profile || profile.mode !== 'hybrid_kiosk') return { mode: 'signage_only' };
  const p = db.prepare('SELECT p.* FROM fil_kiosk_publications p JOIN fil_kiosk_active a ON a.page_id=p.page_id AND a.version=p.version WHERE p.page_id=?').get(profile.page_id);
  if (!p) return { mode: 'signage_only' };
  return { schema:'fil-kiosk-v1', ...profile, version:p.version, sha256:p.sha256, bytes:JSON.parse(p.manifest).bytes, allowed_hosts:JSON.parse(p.manifest).allowed_hosts || [],
    bundle_url:`/api/kiosk/${profile.page_id}/render?fil_version=${p.version}` };
}
function activate(pageId,version) {
  init();
  const p=db.prepare('SELECT * FROM fil_kiosk_publications WHERE page_id=? AND version=?').get(pageId,version);
  if (!p) throw new Error('Yayın sürümü bulunamadı.');
  const file=bundlePath(pageId,version);
  const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(sha!==p.sha256)throw new Error('Yayın paketi doğrulanamadı; etkin sürüm korundu.');
  db.prepare('INSERT INTO fil_kiosk_active(page_id,version) VALUES(?,?) ON CONFLICT(page_id) DO UPDATE SET version=excluded.version').run(pageId,version);
  return p;
}
function applied(deviceId, data) {
  init();
  if (!data || !Number.isInteger(data.version) || !/^[a-f0-9]{64}$/.test(data.sha256 || '')) return false;
  const p = db.prepare(`SELECT p.version FROM fil_kiosk_publications p JOIN fil_device_profiles d ON d.page_id=p.page_id
    WHERE d.device_id=? AND d.mode='hybrid_kiosk' AND p.version=? AND p.sha256=?`).get(deviceId,data.version,data.sha256);
  if (!p) return false;
  db.prepare(`INSERT INTO fil_device_state(device_id,version,sha256,applied_at) VALUES(?,?,?,unixepoch())
    ON CONFLICT(device_id) DO UPDATE SET version=excluded.version,sha256=excluded.sha256,applied_at=excluded.applied_at`).run(deviceId,data.version,data.sha256);
  return true;
}
function state(deviceId) { init(); return db.prepare('SELECT version,sha256,applied_at FROM fil_device_state WHERE device_id=?').get(deviceId) || null; }
function references(contentId) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='kiosk_pages'").get()) return false;
  return db.prepare("SELECT config FROM kiosk_pages WHERE json_valid(config) AND json_extract(config,'$.schema') = 'fil-menu-v1'").all()
    .some(p => JSON.parse(p.config).items.some(i => (i.media || []).includes(contentId)));
}
module.exports = { init, validate, build, publish, payload, bundlePath, references, applied, state, activate };
