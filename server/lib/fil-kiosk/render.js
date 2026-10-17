'use strict';
const fs = require('fs');
const path = require('path');
// One self-contained immutable document: preview and native player use identical bytes.
module.exports = function render(menu, assets = {}) {
  const data = JSON.stringify({ menu, assets }).replace(/</g, '\\u003c');
  return fs.readFileSync(path.join(__dirname, menu.presentation === 'catalog' ? 'catalog-shell.html' : 'shell.html'), 'utf8').replace('/*FIL_DATA*/null', data);
};
