const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{ const b = await chromium.launch({channel:'chrome'}); const p = await b.newPage({viewport:{width:900,height:640}});
 for (const f of fs.readdirSync('tmp').filter(f=>f.endsWith('.svg'))) { await p.goto('file://'+process.cwd()+'/tmp/'+f); await p.screenshot({path:'tmp/'+f.replace('.svg','.png')}); }
 await b.close(); })();
