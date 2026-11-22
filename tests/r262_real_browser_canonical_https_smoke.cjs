'use strict';
/* R262 synthetic HTTPS browser end-to-end acceptance rehearsal.
 * NEVER deploy this fixture! It issues TEST JWTs on 127.0.0.1 only.
 * No real Google, Drive, Sheets, image files or operational credentials.
 * Use with Playwright Chromium or WebKit:
 *    node tests/r262_real_browser_canonical_https_smoke.cjs chromium
 *    node tests/r262_real_browser_canonical_https_smoke.cjs webkit
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const https=require('node:https'),cp=require('node:child_process'),
 crypto=require('node:crypto');
const {create:openGate,SESSION_COOKIE}=
 require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_server_session_gate.cjs');
const {create:openStore}=
 require('../R255_BO_DURABLE_SESSION_CANDIDATE_NO_DEPLOY/r255_encrypted_sqlite_store.cjs');
const {create:makeVerifier}=
 require('../R253_GOOGLE_OIDC_CANDIDATE_NO_DEPLOY/r253_google_oidc_verifier.cjs');
const {makeHandler}=
 require('../R254_BO_SESSION_CANDIDATE_NO_DEPLOY/r254_http_handler.cjs');
const root=path.resolve(__dirname,'..');
const isolated=path.join(root,'R262_BO_BROWSER_REAL_ENGINES_NO_DEPLOY');
const clientPath=path.join(root,'R261_BO_BROWSER_CANONICAL_CANDIDATE_NO_DEPLOY',
 'r261_bo_browser_session_client.js');
const untrustedWebkit=process.argv[2]==='webkit-untrusted';
const engine=untrustedWebkit?'webkit':process.argv[2];
if(!['chromium','webkit'].includes(engine)){
 console.error('R262: argument must be chromium or webkit');process.exit(2);
}
const playwright=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const BO='PM2026123456',SERVICE='service-r262-123456',
 RSD='rsd-r262-123456',RCO='rco-r262-123456',
 EVENT=SERVICE+'::BO::'+BO,T='2026-11-21T18:30:00.000Z',
 CLIENT='r262-fake-google-client.apps.googleusercontent.com';
const now=()=>T;
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const copy=x=>structuredClone(x);
function cert(tempDir){
 const exe=[process.env.OPENSSL_PATH,
  'C:/Program Files/Git/usr/bin/openssl.exe',
  'C:/Program Files/Git/mingw64/bin/openssl.exe','openssl'].filter(Boolean);
 const command=exe.find(x=>{
  try{cp.execFileSync(x,['version'],{stdio:'ignore',timeout:5000});return true}
  catch(_){return false}
 });
 assert(command,'OpenSSL required for TEST-ONLY ephemeral HTTPS certificate');
 const caKey=path.join(tempDir,'r262-ca.key');
 const caCrt=path.join(tempDir,'r262-ca.crt');
 const key=path.join(tempDir,'r262-server.key');
 const csr=path.join(tempDir,'r262-server.csr');
 const crt=path.join(tempDir,'r262-server.crt');
 const extensions=path.join(tempDir,'r262-server-extensions.cnf');
 const exec=args=>cp.execFileSync(command,args,
  {stdio:'ignore',timeout:20000});
 // All keys and certificates are generated in an OS temporary directory.
 // The CA and leaf expire after one day and are never added to Git.
 exec(['req','-x509','-nodes','-newkey','rsa:2048',
  '-keyout',caKey,'-out',caCrt,'-days','1',
  '-subj','/CN=R262 Synthetic Ephemeral Test CA',
  '-addext','basicConstraints=critical,CA:TRUE',
  '-addext','keyUsage=critical,keyCertSign,cRLSign']);
 exec(['req','-new','-nodes','-newkey','rsa:2048',
  '-keyout',key,'-out',csr,
  '-subj','/CN=127.0.0.1']);
 fs.writeFileSync(extensions,[
  'subjectAltName=IP:127.0.0.1,DNS:localhost',
  'basicConstraints=critical,CA:FALSE',
  'keyUsage=critical,digitalSignature,keyEncipherment',
  'extendedKeyUsage=serverAuth'
 ].join(String.fromCharCode(10))+String.fromCharCode(10),{mode:0o600});
 exec(['x509','-req','-in',csr,'-CA',caCrt,'-CAkey',caKey,
  '-CAcreateserial','-out',crt,'-days','1','-extfile',extensions]);
 // Test certificates are deliberately NEVER added to the operating
 // system's trust store, on the operator notebook or in CI.
 return {key:fs.readFileSync(key),cert:fs.readFileSync(crt)};
}
function localFixture(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'r262-isolated-browser-'));
 const tls=cert(tmp),db=path.join(tmp,'sessions.sqlite');
 const key=crypto.randomBytes(32),rsa=crypto.generateKeyPairSync('rsa',
  {modulusLength:2048});
 const jwk={...rsa.publicKey.export({format:'jwk'}),kid:'r262-fake-rsa',
  alg:'RS256',use:'sig'};
 const state={requestCounts:{},files:new Map(),photos:new Map(),
  requests:new Map(),writeCount:0,lookupCount:0,
  sentTokens:0,locked:false,allowWrite:true};
 const row={email:'r262-fake@gmail.com',idpSubject:'r262-fake-sub',
  matricula:'R262-FAKE-01',status:'ATIVO',boPhotoWrite:true,
  batalhao:'BPRv',companhia:'1 CPRv'};
 const event={eventId:EVENT,tipo:'BO',numeroDocumento:BO,status:'ATIVO',
  serviceId:SERVICE,rsdReportId:RSD,rcoReportId:RCO,
  batalhao:'BPRv',companhia:'1 CPRv',locked:false};
 const assignment={matricula:row.matricula,eventId:EVENT,
  batalhao:'BPRv',companhia:'1 CPRv',status:'ATIVO',
  expiresAt:'2026-11-21T20:00:00.000Z'};
 const authority={
  lookupRosterByEmail:async()=>[copy(row)],
  listAssignmentsByMatricula:async()=>[copy(assignment)],
  readCanonicalEvent:async id=>id===EVENT?copy(event):null
 };
 const store={
  now,decodeJpeg:b64=>Buffer.from(b64,'base64'),
  sha256:bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),
  authenticate:()=>{throw Error('FAKE_STORAGE_CANNOT_AUTHENTICATE')},
  getEvent:()=>{throw Error('FAKE_STORAGE_CANNOT_AUTHORIZE')},
  withExclusiveLock:async(_name,fn)=>{
   if(state.locked)throw Error('FAKE_LOCK_CONFLICT');
   state.locked=true;
   try{return await fn()}finally{state.locked=false}
  },
  getRequest:async id=>copy(state.requests.get(id)||null),
  putRequest:async r=>{state.requests.set(r.requestId,copy(r))},
  getPhoto:async(ev,id)=>copy(state.photos.get(ev+':'+id)||null),
  putPhoto:async p=>{state.photos.set(p.eventId+':'+p.photoId,copy(p))},
  listPhotos:async ev=>[...state.photos.values()]
   .filter(p=>p.eventId===ev).map(copy),
  findFileByStableName:async name=>copy(state.files.get(name)||null),
  writePrivateFile:async item=>{
   assert.equal(state.allowWrite,true);
   const file={fileId:'R262-FAKE-DRIVE-FILE-'+(++state.writeCount),
    eventId:item.eventId,digest:item.digest};
   state.files.set(item.stableName,file);return copy(file);
  },
  deletePrivateFile:async()=>{throw Error('FAKE_NO_DELETE_ALLOWED')}
 };
 const challengeStore=openStore({dbPath:db,encryptionKey:key,now,
  namespace:'challenge'});
 const sessionStore=openStore({dbPath:db,encryptionKey:key,now,
  namespace:'session'});
 const oidcVerifier=makeVerifier({clientIds:[CLIENT],
  getTrustedGoogleJwks:async()=>({keys:[jwk]}),now});
 let origin;
 const lookup=async numeroBO=>{
  state.lookupCount++;
  return numeroBO===BO?[{eventId:EVENT}]:[];
 };
 function sign(nonce){
  const claims={iss:'https://accounts.google.com',aud:CLIENT,
   sub:row.idpSubject,email:row.email,email_verified:true,
   iat:Date.parse(T)/1000-30,exp:Date.parse(T)/1000+650,nonce};
  const input=enc({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+enc(claims);
  return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),
   rsa.privateKey).toString('base64url');
 }
 let server;
 async function start(){
  server=https.createServer(tls,(req,res)=>{
   const pathname=new URL(req.url,'https://127.0.0.1').pathname;
   state.requestCounts[pathname]=(state.requestCounts[pathname]||0)+1;
   const staticFiles={
    '/r262-preview':{file:path.join(isolated,'r262_isolated_preview.html'),
      type:'text/html; charset=utf-8'},
    '/r262-isolated-preview.css':{file:path.join(isolated,
      'r262-isolated-preview.css'),type:'text/css; charset=utf-8'},
    '/r262-preview-ui.js':{file:path.join(isolated,'r262_preview_ui.js'),
      type:'text/javascript; charset=utf-8'},
    '/r261-browser-client.js':{file:clientPath,
      type:'text/javascript; charset=utf-8'}
   };
   res.setHeader('Cache-Control','no-store');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','no-referrer');
   if(Object.hasOwn(staticFiles,pathname)&&req.method==='GET'){
    const info=staticFiles[pathname];
    res.setHeader('Content-Type',info.type);
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; "+
      "connect-src 'self'; img-src 'self' data:; object-src 'none'; "+
      "base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.end(fs.readFileSync(info.file));return;
   }
   if(pathname==='/r262-fixture/issue-token'&&req.method==='POST'){
    // Deliberately NOT a production route; serves only on localhost.
    if(req.headers.origin!==origin||
       req.headers['x-r262-synthetic-only']!=='yes'||
       req.headers['content-type']!=='application/json'){
     res.writeHead(403,{'Content-Type':'application/json'});
     res.end('{"ok":false}');return;
    }
    let content='';
    req.on('data',data=>{
     content+=data.toString('utf8');
     if(content.length>4000)req.destroy();
    });
    req.on('end',()=>{
     try{
      const {nonce}=JSON.parse(content);
      if(typeof nonce!=='string'||nonce.length<16||nonce.length>256)
       throw Error('BAD_NONCE');
      state.sentTokens++;
      res.writeHead(200,{'Content-Type':'application/json',
       'Cache-Control':'no-store'});
      res.end(JSON.stringify({idToken:sign(nonce)}));
     }catch(_){
      res.writeHead(403,{'Content-Type':'application/json'});
      res.end('{"ok":false}');
     }
    });return;
   }
   if(pathname.startsWith('/bo-api/')){
    if(pathname==='/bo-api/login/start')
     console.log('R262_INCOMING_LOGIN',engine,
      JSON.stringify({method:req.method,origin:req.headers.origin||null,
      expectedOrigin:origin,host:req.headers.host,
      encrypted:req.socket.encrypted}));
    return makeHandler(gate)(req,res);
   }
   res.writeHead(404,{'Content-Type':'text/plain'});
   res.end('Not found');
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  origin='https://127.0.0.1:'+server.address().port;
 }
 // The gate requires origin, which is known after binding the HTTPS port.
 let gate;
 async function prepare(){
  await start();
  gate=openGate({allowedOrigin:origin,clientId:CLIENT,
   oidcVerifier,authority,storage:store,now,challengeStore,sessionStore,
   canonicalEventLookup:lookup,
   canonicalMode:'ISOLATED_HOMOLOGATION'});
 }
 async function cleanup(){
  if(server)await new Promise(done=>server.close(done));
  challengeStore.close();sessionStore.close();
  await fs.promises.rm(tmp,{recursive:true,force:true,
   maxRetries:50,retryDelay:100});
  // The synthetic CA was never installed; it disappears with tmp.
 }
 return {state,row,event,assignment,prepare,cleanup,
  get origin(){return origin}};
}
function executable(){
 const candidates=[process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium'].filter(Boolean);
 return candidates.find(fs.existsSync);
}
async function main(){
 const f=localFixture();
 let browser,context;
 const blocked=[],pageErrors=[],pass=[];
 const check=(name,fn)=>fn().then(()=>{
  pass.push(name);console.log('R262_PASS',engine,name);
 });
 try{
  await f.prepare();
  const options=engine==='chromium'?
   {headless:true,executablePath:executable(),
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--disable-extensions','--disable-background-networking',
      '--no-first-run','--disable-sync']}: {headless:true};
  if(engine==='chromium')assert(options.executablePath,
    'Chromium/Chrome binary required');
  browser=await playwright[engine].launch(options);
  context=await browser.newContext({
   ignoreHTTPSErrors:true,
   viewport:engine==='webkit'?{width:375,height:812}:{width:1200,height:900},
   isMobile:engine==='webkit',hasTouch:engine==='webkit',
   deviceScaleFactor:engine==='webkit'?2:1,locale:'pt-BR'
  });
  await context.route('**/*',route=>{
   const u=route.request().url();
   if(u.startsWith(f.origin+'/')||u==='about:blank'||u.startsWith('data:'))
    return route.continue();
   blocked.push(u);return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('requestfailed',r=>console.log('R262_REQUEST_FAILED',engine,
   r.url(),r.failure()?.errorText));
  page.on('response',r=>{
   if(r.url().includes('login')||r.url().includes('fixture'))
    console.log('R262_AUTH_RESPONSE',engine,r.status(),r.url());
  });
  await page.goto(f.origin+'/r262-preview',{
   waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>!!window.R262IsolatedPreview);
  await check('isolated UI has no authenticated session or production wires',async()=>{
   assert.equal(await page.evaluate(()=>R262IsolatedPreview.authenticated),false);
   assert.equal(await page.locator('#r262-upload').isDisabled(),true);
   assert.equal(await page.evaluate(()=>R262IsolatedPreview.releaseAllowed),false);
   assert.equal(f.state.writeCount,0);
   assert.equal(f.state.sentTokens,0);
   assert.equal(f.state.requestCounts['/bo-api/photos/upload']||0,0);
   assert.equal(await page.locator('.warning').count(),1);
  });
  if(untrustedWebkit){
   // Explicit no-referrer with mode=same-origin can yield Origin:null under
   // Fetch/Referrer Policy; the R255 server MUST reject that origin.
   // This negative case does not assume TLS distrust is the root cause.
   const probe=await page.evaluate(async()=>{
    const response=await fetch('/bo-api/login/start',{
     method:'POST',mode:'same-origin',credentials:'same-origin',
     referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},
     body:'{}'
    });
    return {status:response.status,body:await response.json()};
   });
   assert.equal(probe.status,403);
   assert.equal(probe.body.ok,false);
   assert.equal(f.state.sentTokens,0);
   assert.equal(f.state.writeCount,0);
   assert.equal(f.state.photos.size,0);
   assert.equal(await page.evaluate(()=>R262IsolatedPreview.authenticated),false);
   assert.deepEqual(blocked,[]);
   assert.deepEqual(pageErrors,[]);
   console.log('R262_NULL_ORIGIN_FAILS_CLOSED',JSON.stringify({
    engine,syntheticUploads:0,releaseAllowed:false}));
   return;
  }
  await page.locator('#r262-login').click();
  try{
   await page.waitForFunction(()=>R262IsolatedPreview.authenticated&&
    document.getElementById('r262-upload').disabled===false,
    null,{timeout:12000});
  }catch(error){
   const debug=await page.evaluate(()=>({
    status:document.getElementById('r262-status').textContent,
    htmlOrigin:location.origin,
    loaded:!!window.R261BoBrowserPhotoClient
   }));
   console.error('R262_LOGIN_DEBUG',engine,debug,
    'requests',f.state.requestCounts,
    'cookies',await context.cookies(f.origin));
   throw error;
  }
  await check('real browser preserves Secure HttpOnly Strict session cookies',async()=>{
   const cookies=await context.cookies(f.origin);
   const session=cookies.find(x=>x.name===SESSION_COOKIE);
   assert(session,'R255 session cookie was not accepted by browser');
   assert.equal(session.secure,true);
   assert.equal(session.httpOnly,true);
   assert.equal(session.sameSite,'Strict');
   assert.equal(f.state.sentTokens,1);
   assert.equal(await page.locator('#r262-upload').isEnabled(),true);
  });
  await check('CSRF required even when cookie is present',async()=>{
   const out=await page.evaluate(async()=>{
    const response=await fetch('/bo-api/photos/list',{
     method:'POST',credentials:'same-origin',mode:'same-origin',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({numeroBO:'PM2026123456',
      launch:{from:'index',module:'bo'}})
    });
    return {status:response.status,body:await response.json()};
   });
   assert.equal(out.status,403);
   assert.equal(out.body.ok,false);
   assert.equal(f.state.writeCount,0);
  });
  await check('three UI entrypoints upload to same canonical BO',async()=>{
   for(const entry of ['index','rsd','rco']){
    await page.locator('#r262-origin').selectOption(entry);
    await page.locator('#r262-upload').click();
    await page.waitForFunction(n=>R262IsolatedPreview.count===n,
     [ 'index','rsd','rco'].indexOf(entry)+1);
   }
   assert.equal(f.state.writeCount,3);
   assert.equal(f.state.photos.size,3);
   const ids=new Set([...f.state.photos.values()].map(x=>x.eventId));
   assert.deepEqual([...ids],[EVENT]);
  });
  await check('nine photos retained in three groups of four',async()=>{
   for(let i=4;i<=9;i++){
    const from=['index','rsd','rco'][(i-1)%3];
    await page.locator('#r262-origin').selectOption(from);
    await page.locator('#r262-upload').click();
    await page.waitForFunction(n=>R262IsolatedPreview.count===n,i);
   }
   assert.equal(f.state.writeCount,9);
   assert.deepEqual(await page.locator('.annex').evaluateAll(nodes=>
    nodes.map(n=>n.querySelectorAll('li').length)),[4,4,1]);
   assert.equal(await page.evaluate(()=>R262IsolatedPreview.pages),3);
   await page.locator('#r262-origin').selectOption('index');
   await page.locator('#r262-refresh').click();
   assert.equal(await page.evaluate(()=>R262IsolatedPreview.count),9);
  });
  await check('server-side roster revocation denies tenth image',async()=>{
   f.row.boPhotoWrite=false;
   await page.locator('#r262-upload').click();
   await page.waitForFunction(()=>document.getElementById('r262-status')
    .textContent.startsWith('Ação rejeitada'));
   assert.equal(f.state.writeCount,9);
   assert.equal(f.state.photos.size,9);
   // Keep the roster revoked until logout; late requests cannot gain access.
  });
  await check('new browser tab has no CSRF in memory even with cookie',async()=>{
   const next=await context.newPage();
   next.on('pageerror',e=>pageErrors.push(e.message));
   try{
    await next.goto(f.origin+'/r262-preview',{waitUntil:'domcontentloaded'});
    await next.waitForFunction(()=>!!window.R262IsolatedPreview);
    assert.equal(await next.locator('#r262-upload').isDisabled(),true);
    assert.equal(await next.evaluate(()=>R262IsolatedPreview.authenticated),false);
    assert.equal(await next.evaluate(()=>localStorage.length),0);
   }finally{await next.close()}
  });
  await page.locator('#r262-logout').click();
  // R261 clears its in-memory csrf synchronously before awaiting the server.
  // Wait for UI and Set-Cookie completion, not merely the csrf getter.
  await page.waitForFunction(()=>!R262IsolatedPreview.authenticated&&
   document.getElementById('r262-upload').disabled===true&&
   document.getElementById('r262-status').textContent.includes('encerrada'));
  await check('logout revokes browser session and upload controls',async()=>{
   assert.equal(await page.locator('#r262-upload').isDisabled(),true);
   const cookies=await context.cookies(f.origin);
   assert(!cookies.some(x=>x.name===SESSION_COOKIE));
   assert.equal(f.state.writeCount,9);
   assert.equal(f.state.requestCounts['/bo-api/photos/upload'],10,
    'exactly nine accepted uploads plus one revoked attempt');
  });
  assert.deepEqual(blocked,[],'Unexpected external browser requests');
  assert.deepEqual(pageErrors,[],'JavaScript page errors');
  console.log('R262_ALL_PASS',JSON.stringify({
   engine,checks:pass.length,realBrowser:true,httpsLocal:true,
   syntheticTokens:f.state.sentTokens,syntheticUploads:f.state.writeCount,
   externalRequests:blocked.length,releaseAllowed:false}));
 }finally{
  if(context)await context.close();
  if(browser)await browser.close();
  await f.cleanup();
 }
}
main().catch(e=>{console.error('R262_BROWSER_FAIL',engine,e);process.exitCode=1});
