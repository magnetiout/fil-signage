#!/usr/bin/env node
'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
(async()=>{
 const [base,file]=process.argv.slice(2);if(!base||!file)throw Error('Usage: bootstrap-admin.js http://127.0.0.1:PORT /private/admin.json');
 const url=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Bootstrap must use loopback (an SSH tunnel is supported).');
 if(fs.existsSync(file)){console.log('Credential file already exists; refusing to overwrite.');return}
 const credentials={email:'admin@fil-signage.invalid',name:'FIL Yönetici',password:crypto.randomBytes(24).toString('base64url')};
 const r=await fetch(url.origin+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 if(!r.ok)throw Error('Administrator bootstrap refused (HTTP '+r.status+'). Existing accounts are preserved.');
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});
 console.log('Administrator created. Read the private credential file locally; no password was logged.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
