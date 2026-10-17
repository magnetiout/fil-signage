'use strict';
// FILSign replaces the upstream hosted sales/pricing page with the instance's public product entry.
// Pricing calculation remains covered by billing tests; the instance does not advertise upstream offers.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../../frontend/landing.html'),'utf8');
test('public landing has honest product identity and a local panel route, without hosted-sale claims',()=>{assert.match(html,/<html lang="tr">/);assert.match(html,/<title>FILSign/);assert.match(html,/href="\/app"/);assert.match(html,/Dijital yayın ve etkileşimli kiosk/);assert.doesNotMatch(html,/Flat price|14-day|Stripe|Most Popular|screentinker\.com|<script/i);});
test('share preview is server readable and canonical with no private customer or credential data',()=>{for(const tag of ['og:title','og:description','og:image','og:url','og:site_name','twitter:card'])assert.ok(html.includes(tag));assert.match(html,/rel="canonical" href="https:\/\/signage\.filteknoloji\.com\/"/);assert.doesNotMatch(html,/Etili|token=|Bearer |password/i);assert.match(html,/https:\/\/signage\.filteknoloji\.com\/assets\/fil-share\.png/);});
