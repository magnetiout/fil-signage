'use strict';
const fs = require('fs');
const path = require('path');
// One self-contained immutable document: preview and native player use identical bytes.
module.exports = function render(menu, assets = {}) {
  const data = JSON.stringify({ menu, assets }).replace(/</g, '\\u003c');
  return fs.readFileSync(path.join(__dirname, menu.presentation === 'catalog' ? 'catalog-shell.html' : 'shell.html'), 'utf8').replace('/*FIL_DATA*/null', () => data);
};

// Two bounded passes avoid retaining all base64 strings and a second full
// document allocation. The entry factory must yield the same ordered assets.
// A changed size during the second pass fails before a publication is written.
module.exports.entries = function renderEntries(menu, entries) {
  const template = fs.readFileSync(path.join(__dirname, menu.presentation === 'catalog' ? 'catalog-shell.html' : 'shell.html'), 'utf8');
  const marker = '/*FIL_DATA*/null', at = template.indexOf(marker);
  if (at < 0) throw new Error('Menu data marker missing');
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const prefix = template.slice(0, at) + '{"menu":' + json(menu) + ',"assets":{';
  const suffix = '}}' + template.slice(at + marker.length);
  function* parts() {
    yield prefix;
    let first = true;
    for (const [id, asset] of entries()) {
      yield (first ? '' : ',') + json(id) + ':' + json(asset);
      first = false;
    }
    yield suffix;
  }
  let size = 0;
  for (const part of parts()) size += Buffer.byteLength(part);
  const buffer = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const part of parts()) {
    const length = Buffer.byteLength(part);
    if (offset + length > size) throw new Error('Menu assets changed during render');
    offset += buffer.write(part, offset, length, 'utf8');
  }
  if (offset !== size) throw new Error('Menu assets changed during render');
  return buffer;
};
module.exports.buffer = (menu, assets = {}) => module.exports.entries(menu, () => Object.entries(assets));
