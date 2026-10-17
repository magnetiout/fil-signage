'use strict';
// The source-evaluation UI tests intentionally stub t() with keys. Supply the REAL escaping,
// binding and display helpers those views now import, rather than replacing them with identities.
// Explicit English fixture locale keeps these capability/security tests deterministic; browser
// acceptance exercises both languages against real accounts and forms.
if(typeof globalThis.localStorage==='undefined')globalThis.localStorage={getItem:key=>key==='rd_lang'?'en':null};
const i18n=require('../../../frontend/js/i18n.js');
const bindings=require('../../../frontend/js/lib/i18n-bindings.js');
const vm=require('node:vm');
const helpers={...bindings,...require('../../../frontend/js/lib/builtin-layout-labels.js'),localizeServerError:require('../../../frontend/js/api.js').localizeServerError,getLocale:i18n.getLocale,displayValue:i18n.displayValue,displayList:i18n.displayList,displayQuantity:i18n.displayQuantity,isMessage:i18n.isMessage,escapeMessage:i18n.escapeMessage,isDisplay:i18n.isDisplay,escapeDisplay:i18n.escapeDisplay};
function runInViewContext(source,context={},options){
 for(const[key,value]of Object.entries(helpers))if(!(key in context))context[key]=value;
 return vm.runInNewContext(source,context,options);
}
module.exports={...helpers,runInViewContext};
