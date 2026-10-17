'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../../frontend/js/lib/admin-locale.js')).href);
test('Turkish letter folding and collation apply to display names, not API identifiers',async()=>{
 const m=await load();assert.equal(m.lowerFor('İZMİR IŞIK','tr'),'izmir ışık');
 assert(m.compareFor('ışık','İzmir','tr')<0);assert(m.compareFor('Cihaz 2','Cihaz 10','tr')<0);
 assert.equal(m.lowerFor('TITLE','en'),'title');
});
test('locale-specific numbers, percentages, dates and input parsing preserve the underlying value',async()=>{
 const m=await load(),n=1234.5,time=Date.parse('2026-10-17T09:30:00Z');
 assert.equal(m.numberFor(n,'tr'),'1.234,5');assert.equal(m.numberFor(n,'en'),'1,234.5');
 assert.equal(m.numberFor(.25,'tr',{style:'percent'}),'%25');
 assert.equal(m.parseNumberFor('1.234,5','tr'),n);assert.equal(m.parseNumberFor('1,234.5','en'),n);
 assert(Number.isNaN(m.parseNumberFor('1,234.5','tr')));assert(Number.isNaN(m.parseNumberFor('1e3','tr')));
 assert.equal(m.dateFor(time,'tr',{dateStyle:'short',timeZone:'Europe/Istanbul'}),'17.10.2026');
 assert.equal(time,Date.parse('2026-10-17T09:30:00Z'));
});
