import { message as t, getLanguage, setLanguage, subscribe } from '../i18n.js';
import { api } from '../api.js';
import { showToast } from './toast.js';
const valid = value => value === 'tr' || value === 'en';
let accountId = null, queue = Promise.resolve(), revision = 0;
export const getLanguageRevision = () => revision;
const desired = new Map();
function read(key) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } catch { /* in-memory UI remains usable */ } }
function cachedUser() { try { return JSON.parse(read('user') || 'null'); } catch { return null; } }
const initialUser=cachedUser();
let legacy=initialUser?.id && !Object.hasOwn(initialUser,'ui_language') && read('token') && valid(read('rd_lang')) ? {id:initialUser.id,language:read('rd_lang')} : null;
function preloginChoice() { try { return sessionStorage.getItem('fil_prelogin_language'); } catch { return null; } }
function clearPrelogin() { try { sessionStorage.removeItem('fil_prelogin_language'); } catch { /* storage blocked */ } }
function cacheAccount(id, language) {
  write('fil_language:'+id,language);
  const user=cachedUser();if(user?.id===id) write('user',JSON.stringify({...user,ui_language:language}));
}
function persist(id, language) {
  const token=read('token');desired.set(id,language);write('fil_language_pending:'+id,language);cacheAccount(id,language);
  const task=queue.catch(()=>{}).then(async()=>{
    // Never send a queued preference under another person's subsequently opened session.
    if(cachedUser()?.id!==id||read('token')!==token) return false;
    try {
      await api.updateMe({ui_language:language});
      if(desired.get(id)===language){revision++;desired.delete(id);write('fil_language_pending:'+id,null);cacheAccount(id,language);}
      return true;
    } catch {
      showToast(t('locale.preference_failed'),'error');return false;
    }
  });queue=task;return task;
}
export async function applyAccountLanguage(user, { fresh = false, requestRevision } = {}) {
  if(!user?.id||!read('token')) { accountId=null;return; }
  const changed=accountId!==user.id;
  if(!changed&&fresh&&requestRevision!==undefined&&requestRevision!==revision){cacheAccount(user.id,getLanguage());return;}
  if(!changed&&!fresh)return;
  accountId=user.id;
  const selected=changed?preloginChoice():null;
  const pending=desired.get(user.id)||read('fil_language_pending:'+user.id);
  const legacyChoice=legacy?.id===user.id&&!valid(user.ui_language)?legacy.language:null;
  const language=valid(selected)?selected:valid(pending)?pending:valid(user.ui_language)?user.ui_language:valid(legacyChoice)?legacyChoice:read('fil_language:'+user.id)||'tr';
  setLanguage(valid(language)?language:'tr',{source:'account'});cacheAccount(user.id,getLanguage());
  if(valid(selected)){clearPrelogin();await persist(user.id,selected);}
  else if(valid(pending)&&!desired.has(user.id)) await persist(user.id,pending);
  else if(fresh&&valid(legacyChoice)){legacy=null;await persist(user.id,legacyChoice);}
}
export function installAdminLanguage() {
  const select=document.getElementById('adminLanguage');if(!select)return;
  const update=()=>{
    document.querySelectorAll('#adminLanguage, [data-admin-language]').forEach(control=>{control.value=getLanguage();control.setAttribute('aria-label',t('settings.language'));});
    document.getElementById('adminLanguageLabel').textContent=t('settings.language');
    select.setAttribute('aria-label',t('settings.language'));
    document.getElementById('adminLanguageStatus').textContent=t('locale.active',{language:getLanguage()==='tr'?'Türkçe':'English'});
  };
  document.addEventListener('change',event=>{
    if(event.target.matches?.('#adminLanguage, [data-admin-language]'))setLanguage(event.target.value);
  });
  // Dialogs make the page behind them inert. Put a language control INSIDE the dialog so
  // keyboard focus and aria-modal remain correct while an unsaved form stays open.
  const dialogSelector='[role="dialog"], .modal-overlay > div, .lib-dialog';
  const mountDialog=dialog=>{
    if(dialog.parentElement?.closest('[data-fil-language-dialog]') || dialog.dataset.filLanguageDialog || dialog.querySelector('[data-admin-language]'))return;
    dialog.dataset.filLanguageDialog='1';
    const control=document.createElement('select');control.dataset.adminLanguage='';
    control.className='dialog-language';control.setAttribute('aria-label',t('settings.language'));
    for(const [value,name] of [['tr','Türkçe'],['en','English']]){const option=document.createElement('option');option.value=value;option.lang=value;option.textContent=name;control.append(option);}
    control.value=getLanguage();
    const header=dialog.querySelector('.modal-header,.lib-dialog-head');
    if(header)header.append(control);else{const row=document.createElement('div');row.className='dialog-language-row';row.append(control);dialog.prepend(row);}
  };
  document.querySelectorAll(dialogSelector).forEach(mountDialog);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1)continue;if(node.matches(dialogSelector))mountDialog(node);node.querySelectorAll(dialogSelector).forEach(mountDialog);}}).observe(document.body,{childList:true,subtree:true});
  subscribe((language,{source}={})=>{
    update();if(source!=='user')return;revision++;
    // This is only the signed-out UI choice, never another account's stored preference.
    write('fil_login_language',language);
    const user=cachedUser();
    if(user?.id&&read('token')) { accountId=user.id;persist(user.id,language); }
    else try { sessionStorage.setItem('fil_prelogin_language',language); } catch { /* in-memory choice still works */ }
  });
  update();
}
