'use strict';
// Small shared report catalog, not the full browser dictionaries. Node 22 supports require(ESM).
const catalog=require('../../frontend/js/i18n/reports/catalog.js').default;
function reportLanguage(req,res){
 const header=req?.get?.('Accept-Language')||req?.headers?.['accept-language']||'';
 const language=/^tr(?:-|,|;|$)/i.test(header)?'tr':'en';
 if(res){res.setHeader('Content-Language',language);if(typeof res.vary==='function')res.vary('Accept-Language');}
 return language;
}
function reportText(language,key,vars={}){
 const full=key.startsWith('reports.export.')?key:'reports.export.'+key;
 const value=catalog[language]?.[full]||catalog.en[full]||'';
 return value.replace(/\{(\w+)\}/g,(all,name)=>Object.hasOwn(vars,name)?String(vars[name]):all);
}
function reportLabel(language,label){const key=catalog.labels[label];return key?reportText(language,key):label;}
const reportCsv=(language,text)=>language==='tr'?'\uFEFF'+text:text;
function turkishEnergyAppendix(r,workspace,{wattage,carbon}){
 const n=value=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(value);
 const source=r.watts_sources||{},count=key=>n(source[key]||0),g=carbon.SOURCE;
 const date=value=>new Date(value+'T00:00:00Z').toLocaleDateString('tr-TR',{timeZone:'UTC'});
 const t=(key,vars)=>reportText('tr',key,vars),v=r.totals;
 return [t('appendix_title',{workspace}),t('appendix_period',{start:date(r.period.start),end:date(r.period.end),days:n(r.period.days)}),'',
 t('appendix_screens',{screens:n(v.screens)}),t('appendix_electricity',{kwh:n(v.kwh),on:n(v.kwh_on),standby:n(v.kwh_standby)}),t('appendix_emissions',{kg:n(v.kg_co2e)}),t('appendix_avoided',{kwh:n(v.saved_kwh),kg:n(v.saved_kg_co2e)}),t('appendix_hours',{on:n(v.on_hours),schedule:n(v.sched_off_hours),off:n(v.panel_off_hours),offline:n(v.offline_hours)}),'',
 t('appendix_methodology'),t('appendix_estimates'),t('appendix_on_time',{share:new Intl.NumberFormat('tr-TR',{style:'percent',maximumFractionDigits:0}).format(v.inferred_share)}),
 t('appendix_power',{override:count('override'),datasheet:count('datasheet'),size:count('size'),workspace_default:count('workspace_default'),default:count('default'),snapshot:count('snapshot'),eei:n(wattage.ASSUMED_EEI),samples:n(wattage.CALIBRATION_SAMPLES),diagonal:n(wattage.DEFAULT_DIAGONAL_IN),standby:n(wattage.DEFAULT_STANDBY_W)}),
 t('appendix_carbon',{source:g.name,year:g.year,url:g.url}),t('appendix_savings'),'',t('appendix_generated',{date:date(new Date().toISOString().slice(0,10))})].join('\n');
}
module.exports={reportLanguage,reportText,reportLabel,reportCsv,turkishEnergyAppendix};
