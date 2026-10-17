'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../../frontend/js/i18n.js'),api=require('../../frontend/js/api.js');
const {READ_CATEGORIES,WRITE_CATEGORIES}=require('../lib/mesh/grants');
test('owned backend permission summaries, fields and consequences retain exact English and reactive Turkish, without translating user data',()=>{
 global.document={documentElement:{setAttribute(){}}};global.window={dispatchEvent(){}};global.CustomEvent=class{};
 api.setErrorTranslator(m.message,m.isMessage);const old=m.getLanguage();
 try{
  for(const meta of [...Object.values(READ_CATEGORIES),...Object.values(WRITE_CATEGORIES)])for(const field of ['summary','fields','consequence']){
   if(!meta[field])continue;m.setLanguage('en');const value=api.systemMessage(meta[field]);assert.equal(String(value),meta[field],field);
   m.setLanguage('tr');assert.notEqual(String(value),meta[field],field);assert.notEqual(String(value),m.t('system.details_unavailable'),meta[field]);
  }
  const warning=api.systemMessage(WRITE_CATEGORIES['device-command'].consequence);assert.match(String(warning),/komut.*ÇALIŞTIRAMAZ/i);assert.match(String(warning),/YÜKLEYEMEZ/i);
  assert.equal(String(api.systemMessage('INTERNAL_UNKNOWN_DETAIL')),m.t('system.details_unavailable'));
  assert.equal(api.storedErrorMessage(null),'');const typed=m.message('common.save');assert.equal(api.storedErrorMessage(typed),typed);
  assert.equal(String(api.storedErrorMessage('SECRET_SQL_DETAIL',500)),m.t('common.request_failed'));
  const pattern=api.systemMessage('It may use up to 1234.5 GB of storage on this server.');assert.match(String(pattern),/1\.234,5/);m.setLanguage('en');assert.match(String(pattern),/1,234\.5/);
 }finally{m.setLanguage(old);api.setErrorTranslator(null)}
});
