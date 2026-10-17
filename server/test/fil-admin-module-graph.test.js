'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../frontend/js');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.js')?[path.join(dir,e.name)]:[])}
test('every local admin ES module import resolves, including nested library components',()=>{
 const missing=[];
 for(const file of files(root)){
  const src=fs.readFileSync(file,'utf8');
  for(const match of src.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/gm)){
   const spec=match[1];if(!spec.startsWith('.'))continue;
   const resolved=path.resolve(path.dirname(file),spec.split('?')[0]);
   if(!fs.existsSync(resolved))missing.push(path.relative(root,file)+' -> '+spec);
  }
 }
 assert.deepEqual(missing,[],'a missing static import prevents the whole panel from starting');
});
