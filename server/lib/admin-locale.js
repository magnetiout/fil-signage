'use strict';
// Optional display/search locale; never changes stored names, identifiers, times or enum values.
function requestLocale(req) { return /^tr(?:-|,|;|$)/i.test(String(req.get('Accept-Language') || '')) ? 'tr-TR' : 'en-US'; }
function turkishFilenameSql() {
  let expression = 'c.filename';
  for (const [upper, lower] of Object.entries({'İ':'i','I':'ı','Ş':'ş','Ğ':'ğ','Ü':'ü','Ö':'ö','Ç':'ç','Â':'â','Î':'î','Û':'û'})) expression = `replace(${expression}, '${upper}', '${lower}')`;
  return `lower(${expression})`;
}
// Only matching ids and names are sorted, before pagination. Large media/draft bodies are not
// loaded to sort a page; the ordinary bounded query fetches just the selected ids afterwards.
function localizedNamePage(db, sql, params, locale, descending, limit, offset) {
  const collator = new Intl.Collator(locale, {numeric:true, sensitivity:'base'});
  const rows = db.prepare('SELECT c.id,c.filename' + sql).all(...params);
  rows.sort((a,b)=>(descending ? -1 : 1)*collator.compare(a.filename,b.filename)||a.id.localeCompare(b.id));
  const ids=rows.slice(offset,offset+limit).map(x=>x.id);
  if(!ids.length)return [];
  const found=db.prepare('SELECT c.*' + sql + ` AND c.id IN (${ids.map(()=>'?').join(',')})`).all(...params,...ids);
  const byId=new Map(found.map(x=>[x.id,x]));return ids.map(id=>byId.get(id));
}
module.exports={requestLocale,turkishFilenameSql,localizedNamePage};
