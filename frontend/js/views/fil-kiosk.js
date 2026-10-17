import { uiText, renderHTML, bindAttribute, bindMessage, ht, binding, bindText } from '../lib/i18n-bindings.js';

import { message as t } from '../i18n.js';
import { errorMessage, requestError } from '../api.js';

import { esc } from '../utils.js';
import { showToast } from '../components/toast.js';
async function api(path,method='GET',body) {
 const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw requestError(r.status,data);return data;
}
export const emptyMenu=()=>({schema:'fil-menu-v1',title:'FIL Signage',theme:{primary:'#237c94',background:'#102230',text:'#ffffff'},allowedHosts:[],items:[]});
export async function renderManaged(container,page) {
 let menu=JSON.parse(page.config),selected=null;
 const [library,devices]=await Promise.all([api('/content?limit=200'),api('/devices')]);
 const media=Array.isArray(library)?library:(library.items||library.content||[]);
 const screens=Array.isArray(devices)?devices:(devices.devices||[]);
 container.innerHTML=`<a href="#/kiosk">← ${ht('fil.menus')}</a><div class="page-header"><h1>${uiText(page.name)}</h1><div><button class="btn btn-secondary" id="filSave">${ht('fil.save_draft')}</button> <button class="btn btn-primary" id="filPublish">${ht('fil.publish')}</button></div></div>
 <p id="filStatus" role="status">${ht('fil.draft_hint')}</p>
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px">
 <section><label>${ht('fil.menu_title')}<input class="input" id="filTitle" value="${esc(menu.title)}"></label><div style="display:flex;gap:14px;margin:16px 0"><label>${ht('fil.primary')} <input type="color" id="filPrimary" value="${esc(menu.theme?.primary||'#237c94')}"></label><label>${ht('fil.background')} <input type="color" id="filBackground" value="${esc(menu.theme?.background||'#102230')}"></label></div>
 <label>${ht('fil.hosts')}<input class="input" id="filHosts" value="${esc((menu.allowedHosts||[]).join(','))}"></label><button class="btn btn-secondary" id="filAdd" style="margin:16px 0">${ht('fil.add_item')}</button><div id="filItems"></div><div id="filFields"></div></section>
 <section><h2>${ht('fil.history')}</h2><div id="filVersions"></div><h2>${ht('fil.preview')}</h2><iframe title="${esc(t('fil.preview'))}" data-fil-i18n-title="${binding('fil.preview')}" id="filPreview" sandbox="allow-scripts" style="width:100%;height:540px;border:1px solid var(--border);border-radius:16px"></iframe>
 <h2>${ht('fil.device_behavior')}</h2><p>${ht('fil.device_hint')}</p><label>${ht('fil.device')}<select class="input" id="filDevice">${renderHTML(screens.map(d=>`<option value="${esc(d.id)}">${uiText(d.name||d.id)} · ${ht(d.status==='online'?'dashboard.online':'dashboard.offline')}</option>`).join(''))}</select></label>
 <label>${ht('fil.profile')}<select class="input" id="filMode"><option value="hybrid_kiosk">${ht('fil.hybrid')}</option><option value="signage_only">${ht('fil.signage')}</option></select></label>
 <label>${ht('fil.idle')}<input class="input" type="number" min="15" max="3600" id="filIdle" value="60"></label><label>${ht('fil.warning')}<input class="input" type="number" min="0" max="60" id="filWarning" value="10"></label><p>${ht('fil.return_hint')}</p><button class="btn btn-primary" id="filAssign">${ht('fil.apply')}</button></section></div>`;
 function el(id){return container.querySelector('#'+id)}
 function basics(){bindAttribute(menu, "title", el('filTitle').value);menu.theme={...menu.theme,primary:el('filPrimary').value,background:el('filBackground').value};menu.allowedHosts=el('filHosts').value.split(',').map(x=>x.trim()).filter(Boolean)}
 function fields(){
 const item=menu.items.find(x=>x.id===selected);if(!item){el('filFields').replaceChildren();return}
 el('filFields').innerHTML=`<h3>${ht('fil.edit_item')}</h3><label>${ht('fil.name')}<input class="input" data-field="label" value="${esc(item.label)}"></label><label>${ht('fil.type')}<select class="input" data-field="type">${renderHTML(Object.entries({category:'fil.category',page:'fil.page',image:'fil.image',gallery:'fil.gallery',video:'fil.video',url:'fil.web'}).map(([k,v])=>`<option value="${k}" ${item.type===k?'selected':''}>${ht(v)}</option>`).join(''))}</select></label>
 <label>${ht('fil.parent')}<select class="input" data-field="parent"><option value="">${ht('fil.root')}</option>${renderHTML(menu.items.filter(x=>x.type==='category'&&x.id!==item.id).map(x=>`<option value="${esc(x.id)}" ${x.id===item.parent?'selected':''}>${uiText(x.label)}</option>`).join(''))}</select></label>
 <label>${ht('fil.order')}<input class="input" type="number" data-field="order" value="${Number(item.order)||0}"></label><label>${ht('fil.icon')}<input class="input" data-field="icon" value="${esc(item.icon||'')}"></label><label>${ht('fil.description')}<textarea class="input" data-field="description" rows="4">${uiText(item.description||'')}</textarea></label><label><input type="checkbox" data-field="active" ${item.active!==false?'checked':''}> ${ht('fil.active')}</label>
 <label>${ht('fil.media')}<select multiple class="input" data-field="media" style="height:160px">${renderHTML(media.filter(x=>/^(image|video)\//.test(x.mime_type)).map(x=>`<option value="${esc(x.id)}" ${(item.media||[]).includes(x.id)?'selected':''}>${uiText(x.filename)}</option>`).join(''))}</select></label><label>${ht('fil.url')}<input class="input" data-field="url" value="${esc(item.url||'')}"></label><p>${ht('fil.web_hint')}</p><button class="btn btn-danger" id="filDelete">${ht('fil.remove')}</button>`;
 el('filFields').querySelectorAll('[data-field]').forEach(input=>{input.onchange=()=>{const k=input.dataset.field;item[k]=k==='media'?Array.from(input.selectedOptions).map(o=>o.value):k==='active'?input.checked:k==='order'?Number(input.value):input.value;list()}});
 el('filDelete').onclick=()=>{if(menu.items.some(x=>x.parent===item.id)){showToast(t('fil.move_children'),'error');return}menu.items=menu.items.filter(x=>x.id!==item.id);selected=null;list();fields()};
 }
 function list(){el('filItems').innerHTML=menu.items.slice().sort((a,b)=>a.order-b.order).map(x=>`<button class="btn btn-secondary" data-item="${esc(x.id)}" style="margin:4px;max-width:100%;overflow-wrap:anywhere">${renderHTML(x.parent?'↳ ':'')}${uiText(x.label)}${renderHTML(x.active===false?ht('fil.inactive'):'')}</button>`).join('');el('filItems').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{selected=b.dataset.item;fields()})}
 async function preview(){const grant=await api(`/fil-kiosk/${page.id}/preview-link`);el('filPreview').referrerPolicy='no-referrer';el('filPreview').src=grant.url}

 async function versions(){const rows=await api(`/fil-kiosk/${page.id}/versions`);el('filVersions').innerHTML=rows.length?rows.map(v=>`<button class="btn btn-secondary" style="margin:4px" data-version="${v.version}" ${v.active?'disabled':''}>${ht(v.active?'fil.version_active':'fil.version_restore',{version:v.version})}</button>`).join(''):ht('fil.not_published');el('filVersions').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>guarded(async()=>{await api(`/fil-kiosk/${page.id}/activate`,'POST',{version:Number(b.dataset.version)});await versions();bindText(el('filStatus'),'fil.restored')}))}
 async function save(){basics();await api(`/fil-kiosk/${page.id}/managed`,'PUT',menu);bindText(el('filStatus'),'fil.draft_saved');await preview()}
 async function guarded(fn){try{await fn()}catch(e){showToast(errorMessage(e),'error');bindMessage(el('filStatus'), (errorMessage(e)))}}
 el('filAdd').onclick=()=>{const item={id:crypto.randomUUID(),type:'page',label:String(t('fil.new_item')),parent:null,order:menu.items.length,active:true,media:[]};menu.items.push(item);selected=item.id;list();fields()};
 el('filSave').onclick=()=>guarded(save);
 el('filPublish').onclick=()=>guarded(async()=>{await save();const p=await api(`/fil-kiosk/${page.id}/publish`,'POST',{});bindText(el('filStatus'),'fil.published_status',{version:p.version});showToast(t('fil.published'));await versions()});
 el('filAssign').onclick=()=>guarded(async()=>{if(!el('filDevice').value)throw Error(t('fil.pair_first'));await api(`/fil-kiosk/devices/${el('filDevice').value}/profile`,'PUT',{mode:el('filMode').value,page_id:page.id,idle_sec:Number(el('filIdle').value),warning_sec:Number(el('filWarning').value)});showToast(t('fil.profile_saved'))});
 el('filDevice').onchange=()=>guarded(async()=>{const p=await api(`/fil-kiosk/devices/${el('filDevice').value}/profile`);el('filMode').value=p.mode;el('filIdle').value=p.idle_sec;el('filWarning').value=p.warning_sec;bindText(el('filStatus'),p.applied?'fil.applied':'fil.not_applied',{version:p.applied?.version})});
 list();await guarded(async()=>{await preview();await versions()});
}
