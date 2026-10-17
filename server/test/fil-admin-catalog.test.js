'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../../frontend/js/i18n');
const en=require(dir+'/en.js').default,tr=require(dir+'/tr.js').default;
const placeholders=value=>(value.match(/\{\w+\}/g)||[]).sort();
test('the complete TR/EN admin catalogs have non-empty UTF-8 text and identical keys and placeholders',()=>{
 assert.deepEqual(Object.keys(tr).sort(),Object.keys(en).sort());assert(Object.keys(en).length>10000);
 for(const [key,value] of Object.entries(en)){
  assert.equal(typeof tr[key],'string',key);assert(tr[key].trim(),key+' is empty');
  assert(!/[\uFFFD\u0000]/.test(tr[key]),key+' has broken encoding');
  assert.deepEqual(placeholders(tr[key]),placeholders(value),key+' placeholder multiplicity');
  assert(!/FILPH\d|FILNEWLINE|\[100\d\d\]/.test(tr[key]),key+' contains an editorial marker');
 }
 for(const lang of ['tr','en']){const source=fs.readFileSync(dir+'/'+lang+'.js','utf8');const keys=[...source.matchAll(/^\s*['"]([\w.]+)['"]\s*:/gm)].map(m=>m[1]);assert.equal(new Set(keys).size,keys.length,lang+' contains duplicate definitions');}
});
test('safe English fallback and escaping do not expose a key or interpret hostile variables as markup',()=>{
 global.localStorage={getItem:()=>null};const m=require('../../frontend/js/i18n.js');
 assert.equal(m.getLanguage(),'tr');assert.equal(m.t('this.key.does.not.exist'),en['common.request_failed']);
 const value='<img src=x onerror="window.pwned=1">';
 const html=m.tHtml('kiosk.confirm_delete',{name:value});assert(!html.includes('<img'));assert(html.includes('&lt;img'));
 assert.equal(m.t('gs.progress',{done:1234,total:5678}),'5.678 adımdan 1.234 tanesi tamamlandı');
});
test('built-in template localization changes only display metadata, preserving defaults and user edits',()=>{
 const m=require('../../frontend/js/lib/template-i18n.js');const manifest=require('../../catalog/templates/weather-html/manifest.json');
 const label=m.localName(manifest,'tr');assert.notEqual(String(label),manifest.name);
 const params=m.localParams(manifest,'tr');for(let i=0;i<params.length;i++){assert.equal(params[i].name,manifest.params[i].name);assert.equal(params[i].default,manifest.params[i].default);if(params[i].options)assert.deepEqual(params[i].options.map(o=>o.value),manifest.params[i].options.map(o=>o.value));}
 assert.equal(m.localName({...manifest,name:'Özel kullanıcı adı'},'tr'),'Özel kullanıcı adı');
 assert.deepEqual(m.initialFormValues(params,{locale:'en-GB',location:'IĞDIR kullanıcının içeriği'}),{...m.initialFormValues(params,{}),locale:'en-GB',location:'IĞDIR kullanıcının içeriği'});
});

test('display-only localization preserves seed identities, user edits and technical examples',()=>{
 const {builtinLayoutName,builtinZoneName}=require('../../frontend/js/lib/builtin-layout-labels.js');
 const seed={id:'tpl-fullscreen',name:'Fullscreen',is_template:1,user_id:null};
 assert.equal(String(builtinLayoutName(seed)),'Tam ekran');assert.equal(String(builtinZoneName(seed,{id:'z-fs-1',name:'Main'})),'Ana');
 assert.equal(builtinLayoutName({...seed,name:'Benim Fullscreen adım'}),'Benim Fullscreen adım');assert.equal(builtinLayoutName({...seed,is_template:0}),'Fullscreen');
 assert.equal(builtinZoneName(seed,{id:'z-fs-1',name:'My own zone'}),'My own zone');
 const tokens=['Upload-Offset','X-API-Key','-----BEGIN CERTIFICATE-----','-----BEGIN PUBLIC KEY-----','us-east-1','llama3.1:8b','Systran/faster-whisper-small','now-6h','ReportSection1','Superstore/Overview','mastodon.social','data.items'];
 for(const token of tokens){const entries=Object.entries(en).filter(([k,v])=>v.includes(token));assert(entries.length,token+' has a fixture');for(const [key]of entries)assert(tr[key].includes(token),key+' must preserve '+token);}
 for(const [key,value]of Object.entries(en)){
  if(!key.includes('placeholder_')||!/^\[?\{/.test(value)||value.includes('…'))continue;
  let source;try{source=JSON.parse(value)}catch{continue}const target=JSON.parse(tr[key]);
  const keys=o=>Array.isArray(o)?o.map(keys):o&&typeof o==='object'?Object.keys(o).sort().map(k=>[k,keys(o[k])]):typeof o;
  assert.deepEqual(keys(target),keys(source),key+' JSON example schema');
 }
});

test('explicit lists retain nested label locale and escape hostile content after a language switch',()=>{
 const m=require('../../frontend/js/i18n.js'),binding=require('../../frontend/js/lib/i18n-bindings.js');
 global.document={documentElement:{setAttribute(){}},querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>false})};global.NodeFilter={SHOW_COMMENT:128};global.window={dispatchEvent(){}};global.CustomEvent=class{};
 const value=m.displayList([m.message('common.save'),'<img onerror=bad()>']);
 assert.equal(String(value),'Kaydet, <img onerror=bad()>');m.setLanguage('en');assert.equal(String(value),'Save, <img onerror=bad()>');assert(!binding.uiText(value).includes('<img'));m.setLanguage('tr');
});
