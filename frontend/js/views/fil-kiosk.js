import { esc } from '../utils.js';
import { showToast } from '../components/toast.js';
async function api(path,method='GET',body) {
 const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+localStorage.getItem('token'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw Error(data.error||'İşlem başarısız');return data;
}
export const emptyMenu=()=>({schema:'fil-menu-v1',title:'FIL Signage',theme:{primary:'#237c94',background:'#102230',text:'#ffffff'},allowedHosts:[],items:[]});
export async function renderManaged(container,page) {
 let menu=JSON.parse(page.config),selected=null;
 const [library,devices]=await Promise.all([api('/content?limit=200'),api('/devices')]);
 const media=Array.isArray(library)?library:(library.items||library.content||[]);
 const screens=Array.isArray(devices)?devices:(devices.devices||[]);
 container.innerHTML=`<a href="#/kiosk">← Menüler</a><div class="page-header"><h1>${esc(page.name)}</h1><div><button class="btn btn-secondary" id="filSave">Taslağı kaydet</button> <button class="btn btn-primary" id="filPublish">Yayınla</button></div></div>
 <p id="filStatus" role="status">Taslak: Kaydetmek cihazlardaki yayını değiştirmez.</p>
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px">
 <section><label>Menü başlığı<input class="input" id="filTitle" value="${esc(menu.title)}"></label><div style="display:flex;gap:14px;margin:16px 0"><label>Ana renk <input type="color" id="filPrimary" value="${esc(menu.theme?.primary||'#237c94')}"></label><label>Arka plan <input type="color" id="filBackground" value="${esc(menu.theme?.background||'#102230')}"></label></div>
 <label>İzin verilen web alan adları (virgülle)<input class="input" id="filHosts" value="${esc((menu.allowedHosts||[]).join(','))}"></label><button class="btn btn-secondary" id="filAdd" style="margin:16px 0">+ Menü öğesi</button><div id="filItems"></div><div id="filFields"></div></section>
 <section><h2>Yayın geçmişi</h2><div id="filVersions"></div><h2>Önizleme</h2><iframe title="Menü önizleme" id="filPreview" sandbox="allow-scripts" style="width:100%;height:540px;border:1px solid var(--border);border-radius:16px"></iframe>
 <h2>Cihaz davranışı</h2><p>Önce menüyü yayınlayın. Eşleşmemiş örnek cihaz online sayılmaz.</p><label>Cihaz<select class="input" id="filDevice">${screens.map(d=>`<option value="${esc(d.id)}">${esc(d.name||d.id)} · ${esc(d.status||'offline')}</option>`).join('')}</select></label>
 <label>Profil<select class="input" id="filMode"><option value="hybrid_kiosk">Tablet · Dokunmatik menü</option><option value="signage_only">TV · Yalnızca yayın</option></select></label>
 <label>İşlemsizlik süresi (saniye)<input class="input" type="number" min="15" max="3600" id="filIdle" value="60"></label><label>Uyarı süresi (saniye)<input class="input" type="number" min="0" max="60" id="filWarning" value="10"></label><p>Varsayılan toplam dönüş süresi: 70 saniye.</p><button class="btn btn-primary" id="filAssign">Cihaza uygula</button></section></div>`;
 function el(id){return container.querySelector('#'+id)}
 function basics(){menu.title=el('filTitle').value;menu.theme={...menu.theme,primary:el('filPrimary').value,background:el('filBackground').value};menu.allowedHosts=el('filHosts').value.split(',').map(x=>x.trim()).filter(Boolean)}
 function fields(){
 const item=menu.items.find(x=>x.id===selected);if(!item){el('filFields').replaceChildren();return}
 el('filFields').innerHTML=`<h3>Öğe düzenle</h3><label>Ad<input class="input" data-field="label" value="${esc(item.label)}"></label><label>Tür<select class="input" data-field="type">${Object.entries({category:'Kategori',page:'İçerik sayfası',image:'Görsel',gallery:'Galeri',video:'Video',url:'Web adresi'}).map(([k,v])=>`<option value="${k}" ${item.type===k?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Üst kategori<select class="input" data-field="parent"><option value="">Ana menü</option>${menu.items.filter(x=>x.type==='category'&&x.id!==item.id).map(x=>`<option value="${esc(x.id)}" ${x.id===item.parent?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>
 <label>Sıra<input class="input" type="number" data-field="order" value="${Number(item.order)||0}"></label><label>Simge<input class="input" data-field="icon" value="${esc(item.icon||'')}"></label><label>Açıklama<textarea class="input" data-field="description" rows="4">${esc(item.description||'')}</textarea></label><label><input type="checkbox" data-field="active" ${item.active!==false?'checked':''}> Etkin</label>
 <label>Medya (çoklu seçim)<select multiple class="input" data-field="media" style="height:160px">${media.filter(x=>/^(image|video)\//.test(x.mime_type)).map(x=>`<option value="${esc(x.id)}" ${(item.media||[]).includes(x.id)?'selected':''}>${esc(x.filename)}</option>`).join('')}</select></label><label>HTTPS web adresi<input class="input" data-field="url" value="${esc(item.url||'')}"></label><p>Web içeriği internet ister; Yalnızca izin listesindeki HTTPS alan adları açılır.</p><button class="btn btn-danger" id="filDelete">Öğeyi kaldır</button>`;
 el('filFields').querySelectorAll('[data-field]').forEach(input=>{input.onchange=()=>{const k=input.dataset.field;item[k]=k==='media'?Array.from(input.selectedOptions).map(o=>o.value):k==='active'?input.checked:k==='order'?Number(input.value):input.value;list()}});
 el('filDelete').onclick=()=>{if(menu.items.some(x=>x.parent===item.id)){showToast('Önce alt öğeleri taşıyın.','error');return}menu.items=menu.items.filter(x=>x.id!==item.id);selected=null;list();fields()};
 }
 function list(){el('filItems').innerHTML=menu.items.slice().sort((a,b)=>a.order-b.order).map(x=>`<button class="btn btn-secondary" data-item="${esc(x.id)}" style="margin:4px;max-width:100%;overflow-wrap:anywhere">${x.parent?'↳ ':''}${esc(x.label)}${x.active===false?' (kapalı)':''}</button>`).join('');el('filItems').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{selected=b.dataset.item;fields()})}
 async function preview(){const grant=await api(`/fil-kiosk/${page.id}/preview-link`);el('filPreview').referrerPolicy='no-referrer';el('filPreview').src=grant.url}

 async function versions(){const rows=await api(`/fil-kiosk/${page.id}/versions`);el('filVersions').innerHTML=rows.length?rows.map(v=>`<button class="btn btn-secondary" style="margin:4px" data-version="${v.version}" ${v.active?'disabled':''}>Sürüm ${v.version}${v.active?' · Etkin':' · Geri dön'}</button>`).join(''):'Henüz yayınlanmadı';el('filVersions').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>guarded(async()=>{await api(`/fil-kiosk/${page.id}/activate`,'POST',{version:Number(b.dataset.version)});await versions();el('filStatus').textContent='Önceki doğrulanmış yayın etkinleştirildi.'}))}
 async function save(){basics();await api(`/fil-kiosk/${page.id}/managed`,'PUT',menu);el('filStatus').textContent='Taslak kaydedildi; cihazlar yayınlanan sürümde kalır.';await preview()}
 async function guarded(fn){try{await fn()}catch(e){showToast(e.message,'error');el('filStatus').textContent=e.message}}
 el('filAdd').onclick=()=>{const item={id:crypto.randomUUID(),type:'page',label:'Yeni öğe',parent:null,order:menu.items.length,active:true,media:[]};menu.items.push(item);selected=item.id;list();fields()};
 el('filSave').onclick=()=>guarded(save);
 el('filPublish').onclick=()=>guarded(async()=>{await save();const p=await api(`/fil-kiosk/${page.id}/publish`,'POST',{});el('filStatus').textContent=`Menü yayınlandı · Sürüm ${p.version}. Cihaz uygulaması cihaz bağlanınca doğrulanır.`;showToast('Menü yayınlandı');await versions()});
 el('filAssign').onclick=()=>guarded(async()=>{if(!el('filDevice').value)throw Error('Önce cihaz eşleştirin.');await api(`/fil-kiosk/devices/${el('filDevice').value}/profile`,'PUT',{mode:el('filMode').value,page_id:page.id,idle_sec:Number(el('filIdle').value),warning_sec:Number(el('filWarning').value)});showToast('Profil kaydedildi; cihazın bağlanması bekleniyor.')});
 el('filDevice').onchange=()=>guarded(async()=>{const p=await api(`/fil-kiosk/devices/${el('filDevice').value}/profile`);el('filMode').value=p.mode;el('filIdle').value=p.idle_sec;el('filWarning').value=p.warning_sec;el('filStatus').textContent=p.applied?`Cihazın bildirdiği uygulanan menü sürümü: ${p.applied.version}`:'Cihaz henüz uygulanan menü sürümü bildirmedi.'});
 list();await guarded(async()=>{await preview();await versions()});
}
