'use strict';
const TYPES = new Set(['category', 'page', 'gallery', 'image', 'video', 'url']);
function validateMenu(input, lookup) {
  if (!input || input.schema !== 'fil-menu-v1' || !Array.isArray(input.items) || input.items.length > 150) throw new Error('Geçersiz menü; en fazla 150 öğe.');
  const menu = JSON.parse(JSON.stringify(input));
  if (typeof menu.title !== 'string' || !menu.title.trim() || menu.title.length > 120) throw new Error('Menü başlığı gerekli.');
  const ids = new Map();
  for (const item of menu.items) {
    if (!item || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('Öğe kimliği geçersiz veya tekrarlanmış.');
    if (!TYPES.has(item.type) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) throw new Error('Öğe adı ve türü gerekli.');
    if ((item.description || '').length > 6000) throw new Error('Açıklama çok uzun.');
    item.active = item.active !== false;
    item.order = Number.isFinite(Number(item.order)) ? Number(item.order) : 0;
    item.media = Array.isArray(item.media) ? [...new Set(item.media)] : [];
    if (item.media.length > 12) throw new Error('En fazla 12 medya.');
    if (['image','gallery','video'].includes(item.type) && !item.media.length) throw new Error('Medya hedefi gerekli.');
    for (const id of item.media) {
      const c = lookup(id);
      if (!c || !c.filepath || c.remote_url || !/^(image|video)\//.test(c.mime_type)) throw new Error('Medya bulunamadı veya bu çalışma alanına ait değil.');
      if (item.type === 'video' && !c.mime_type.startsWith('video/')) throw new Error('Video dosyası gerekli.');
      if (['image','gallery'].includes(item.type) && !c.mime_type.startsWith('image/')) throw new Error('Görsel dosyası gerekli.');
    }
    if (item.type === 'url') {
      let url; try { url = new URL(item.url); } catch { throw new Error('Geçerli HTTPS adresi gerekli.'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Yalnızca HTTPS adresi.');
      const allow = menu.allowedHosts || [];
      if (!Array.isArray(allow) || !allow.includes(url.hostname)) throw new Error('Web adresinin alan adı izin listesinde değil.');
    }
    ids.set(item.id, item);
  }
  for (const item of menu.items) {
    const seen = new Set([item.id]); let parent = item.parent || null;
    while (parent) {
      const p = ids.get(parent);
      if (!p || p.type !== 'category' || seen.has(parent)) throw new Error('Geçersiz veya döngüsel kategori.');
      seen.add(parent); parent = p.parent;
    }
  }
  menu.theme ||= {};
  for (const key of ['primary','background','text']) if (menu.theme[key] && !/^#[0-9a-f]{6}$/i.test(menu.theme[key])) throw new Error('Geçersiz tema rengi.');
  return menu;
}
module.exports = { validateMenu };
