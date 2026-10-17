'use strict';

// #214 server-side search / type filter / sort on GET /api/content. Mounts the real
// router behind a stub that injects a workspace, so the SQL query building is exercised
// end-to-end over HTTP (the whitelisted sort + escaped LIKE are the parts worth guarding).

const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
process.env.DATA_DIR = path.join(os.tmpdir(), 'st-search-' + crypto.randomBytes(4).toString('hex'));
process.env.SELF_HOSTED = 'true';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { db } = require('../db/database');

const WS = 'ws-search';
let server, base;

function get(qs, language) {
  return new Promise((resolve, reject) => {
    http.get(`${base}/${qs}`, { headers: language ? {'Accept-Language':language} : {} }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}
const names = (rows) => rows.map((r) => r.filename);

before(async () => {
  // Content with workspace_id NULL is visible to any workspace via the GET's
  // "workspace_id = ? OR workspace_id IS NULL" clause — enough to exercise the query
  // building without standing up a full workspace/org row.
  const mk = (name, mime, size, remote) =>
    db.prepare('INSERT INTO content (id, filename, mime_type, file_size, remote_url) VALUES (?,?,?,?,?)')
      .run(crypto.randomBytes(6).toString('hex'), name, mime, size, remote);
  // created_at defaults to now for all; insert in a known order and lean on id/size/name for assertions.
  mk('alpha-logo.png', 'image/png', 100, null);
  mk('beta clip.mp4', 'video/mp4', 900, null);
  mk('gamma-100%-off.png', 'image/png', 300, null);   // literal % — must survive LIKE escaping
  mk('promo short', 'video/youtube', 0, 'https://youtu.be/aaaaaaaaaaa');
  mk('news feed', 'text/html', 0, 'https://example.com/feed');

  const app = express();
  app.use((req, _res, next) => { req.workspaceId = WS; req.user = { id: 'u', role: 'admin' }; next(); });
  app.use('/', require('../routes/content'));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

test('text search matches filename substring across the workspace', async () => {
  const r = await get('?q=logo');
  assert.deepEqual(names(r), ['alpha-logo.png']);
});

test('LIKE metacharacters in the query are matched literally, not as wildcards', async () => {
  // A naive %q% would make "100%" match everything; the escape keeps it literal.
  const r = await get('?q=' + encodeURIComponent('100%'));
  assert.deepEqual(names(r), ['gamma-100%-off.png']);
});

test('type filter buckets: video excludes youtube; youtube and web are their own', async () => {
  assert.deepEqual(names(await get('?type=image')).sort(), ['alpha-logo.png', 'gamma-100%-off.png']);
  assert.deepEqual(names(await get('?type=video')), ['beta clip.mp4']);
  assert.deepEqual(names(await get('?type=youtube')), ['promo short']);
  assert.deepEqual(names(await get('?type=web')), ['news feed']);
});

test('sort=name is case-insensitive A-Z; sort=size is largest-first', async () => {
  const byName = names(await get('?sort=name'));
  assert.deepEqual(byName, [...byName].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  const bySize = await get('?sort=size');
  assert.equal(bySize[0].filename, 'beta clip.mp4'); // 900, the largest
});

test('unknown sort falls back to the default ordering (no SQL injection into ORDER BY)', async () => {
  const r = await get('?sort=filename;DROP TABLE content');
  assert.ok(Array.isArray(r) && r.length === 5); // table intact, request succeeded
});

test('combining search + type + sort works together', async () => {
  const r = await get('?type=image&sort=name&q=' + encodeURIComponent(''));
  assert.deepEqual(names(r), ['alpha-logo.png', 'gamma-100%-off.png']);
});

test('#tag search matches content.tags JSON', async () => {
  db.prepare("UPDATE content SET tags = ? WHERE filename = 'alpha-logo.png'").run(JSON.stringify(['promo']));
  const r = await get('?q=' + encodeURIComponent('#promo'));
  assert.deepEqual(names(r), ['alpha-logo.png']);
});

test('Turkish filename search distinguishes dotted/dotless I and locale sorting happens before pagination', async()=>{
 const inserted=[];
 try {
  for(const name of ['fil-tr-locale-İZMİR.png','fil-tr-locale-IŞIK.png','fil-tr-locale-Çınar.png','fil-tr-locale-Cihaz 10.png','fil-tr-locale-Cihaz 2.png']){
   const id=crypto.randomBytes(6).toString('hex');inserted.push(id);
   db.prepare('INSERT INTO content(id,filename,mime_type,file_size) VALUES(?,?,?,?)').run(id,name,'image/png',1);
  }
  assert.deepEqual(names(await get('?q='+encodeURIComponent('fil-tr-locale-izmir'),'tr-TR')),['fil-tr-locale-İZMİR.png']);
  assert.deepEqual(names(await get('?q='+encodeURIComponent('fil-tr-locale-ışık'),'tr-TR')),['fil-tr-locale-IŞIK.png']);
  assert.deepEqual(names(await get('?q='+encodeURIComponent('fil-tr-locale-işik'),'tr-TR')),[]);
  const all=await get('?q=fil-tr-locale-&sort=name','tr-TR');
  const expected=['fil-tr-locale-Cihaz 2.png','fil-tr-locale-Cihaz 10.png','fil-tr-locale-Çınar.png','fil-tr-locale-IŞIK.png','fil-tr-locale-İZMİR.png'];
  assert.deepEqual(names(all),expected);
  assert.deepEqual(names(await get('?q=fil-tr-locale-&sort=name&limit=2&offset=2','tr-TR')),expected.slice(2,4));
  assert.deepEqual(names(await get('?q=fil-tr-locale-&sort=name_desc&limit=2','tr-TR')),expected.slice().reverse().slice(0,2));
  assert.equal(db.prepare('SELECT filename FROM content WHERE id=?').get(inserted[0]).filename,'fil-tr-locale-İZMİR.png','stored user names unchanged');
 }finally{for(const id of inserted)db.prepare('DELETE FROM content WHERE id=?').run(id)}
});
