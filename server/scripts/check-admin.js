'use strict';
// Validate the actual ESM dependency graph without changing the deployed source-module architecture.
const path=require('node:path');
require('esbuild').build({entryPoints:[path.resolve(__dirname,'../../frontend/js/app.js')],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'same-origin-vendor',setup(build){build.onResolve({filter:/^\/vendor\//},args=>({path:path.resolve(__dirname,'../../frontend','.'+args.path)}));}}],logLevel:'warning'}).then(result=>{
 console.log('PASS: admin ESM graph, syntax and exports; '+result.outputFiles[0].contents.length+' bytes in validation bundle');
}).catch(()=>{process.exitCode=1});
