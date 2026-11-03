import http from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,chmodSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {webhookKey,validateFile,uploadFile,sendUploadedFile,MAX_FILE_BYTES} from './wecom-transport.mjs';
import {setupPage} from './setup-page.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const stamp=()=>new Date().toISOString();
const fail=(status,message)=>Object.assign(Error(message),{status});
const aggregate=items=>items.every(x=>x.status==='sent')?'sent':items.some(x=>['pending','uploading','sending'].includes(x.status))?'pending':items.some(x=>x.status==='unknown')?'unknown':items.some(x=>x.status==='sent')?'partial':'failed';
function atomicJSON(path,value){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});chmodSync(tmp,0o600);let fd=openSync(tmp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(tmp,path);if(process.platform!=='win32'){fd=openSync(dirname(path),'r');try{fsyncSync(fd);}finally{closeSync(fd);}}}
function loadJSON(path,fallback){if(!existsSync(path))return fallback;try{return JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('本机配置或发送记录无法读取。为避免重复发送，服务已停止，请先保留并检查原文件。');}}
const publicJob=job=>({id:job.id,issueId:job.issueId,revision:job.revision,targetId:job.targetId,targetName:job.targetName,status:aggregate(job.items),created:job.created,updated:job.updated,items:job.items.map(({kind,name,status,message,time,verified})=>({kind,name,status,message,time,...(verified?{verified}:{})}))});
function safeToken(given,token){const a=Buffer.from(String(given||'')),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}

export function createRelayServer({dataDir=resolve(fileURLToPath(new URL('../.local/wecom/',import.meta.url))),fetchImpl=fetch,allowedOrigins=['https://deep-dai.github.io'],upstreamTimeout=20000}={}){
 mkdirSync(dataDir,{recursive:true,mode:0o700});chmodSync(dataDir,0o700);
 const configPath=join(dataDir,'config.json'),journalPath=join(dataDir,'jobs.json');
 const config=loadJSON(configPath,{version:1,serviceId:randomBytes(16).toString('hex'),token:randomBytes(32).toString('hex'),name:'',webhook:''});
 if(config.version!==1||typeof config.token!=='string'||config.token.length<32||!config.serviceId)throw Error('本机发送配置格式异常，服务已停止。');
 if(config.webhook)webhookKey(config.webhook);
 atomicJSON(configPath,config);
 const journal=loadJSON(journalPath,{version:1,jobs:{},sendTimes:[]});
 if(journal.version!==1||!journal.jobs||!Array.isArray(journal.sendTimes))throw Error('本机发送记录格式异常，服务已停止。');
 // A restarted process must never blindly repeat a request whose reply was lost.
 for(const job of Object.values(journal.jobs))for(const item of job.items){
  if(item.status==='sending'){item.status='unknown';item.message='服务中断前已发起发送，请在群内核实，暂不自动重发。';}
  else if(['pending','uploading'].includes(item.status)){item.status='failed';item.message='服务中断，尚未向群发送此文件，可重试。';}
 }
 atomicJSON(journalPath,journal);
 const persist=()=>atomicJSON(journalPath,journal),setupNonce=randomBytes(24).toString('hex');
 const running=new Set();let queue=Promise.resolve();
 async function run(job,files,webhook){
  try{
   for(const item of job.items){
    if(item.status!=='pending')continue;
    const file=files.find(f=>f.kind===item.kind);item.status='uploading';job.updated=stamp();persist();
    const upload=await uploadFile(webhook,file,{fetchImpl,timeout:upstreamTimeout});
    if(upload.status!=='uploaded'){Object.assign(item,upload,{time:stamp()});job.updated=stamp();persist();continue;}
    journal.sendTimes=journal.sendTimes.filter(x=>Date.now()-x.time<60000);
    if(journal.sendTimes.filter(x=>x.targetRef===job.targetRef).length>=20){Object.assign(item,{status:'failed',message:'本群一分钟内已发起20条消息，请稍后重试。',time:stamp()});persist();continue;}
    // Persist the uncertain boundary before the irreversible upstream request.
    item.status='sending';journal.sendTimes.push({targetRef:job.targetRef,time:Date.now()});persist();
    Object.assign(item,await sendUploadedFile(webhook,upload.mediaId,{fetchImpl,timeout:upstreamTimeout}),{time:stamp()});job.updated=stamp();persist();
   }
  }catch{
   for(const item of job.items){if(item.status==='sending')Object.assign(item,{status:'unknown',message:'发送结果未能保存，请在群内核实，暂不自动重发。'});else if(['pending','uploading'].includes(item.status))Object.assign(item,{status:'failed',message:'本机发送服务发生错误，尚未向群发送此文件。'});}
   try{persist();}catch{/* The journal already contains the conservative pre-send state. */}
  }finally{running.delete(job.id);}
 }
 async function body(req,max){const buffers=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw fail(413,'文件过大，请减少发送文件或使用压缩海报');buffers.push(chunk);}return Buffer.concat(buffers);}
 async function intake(req){
  const type=req.headers['content-type']||'';if(!/^multipart\/form-data;/.test(type))throw fail(415,'发送文件格式无效');
  const buffer=await body(req,MAX_FILE_BYTES*2+65536);
  let form,meta;try{form=await new Request('http://127.0.0.1/',{method:'POST',headers:{'Content-Type':type},body:buffer}).formData();meta=JSON.parse(form.get('metadata'));}catch{throw fail(400,'发送文件信息无法读取');}
  if(!meta||!/^[A-Za-z0-9_-]{16,90}$/.test(meta.id||'')||!/^[A-Za-z0-9_-]{1,100}$/.test(meta.issueId||'')||!/^[a-f0-9]{64}$/.test(meta.revision||'')||meta.targetId!=='main'||typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>200||!Array.isArray(meta.files)||meta.files.length<1||meta.files.length>2||typeof meta.retryFailed!=='boolean')throw fail(400,'发送批次信息无效');
  const allowed=new Set(['metadata',...meta.files.map((_,i)=>'file'+i)]);
  if([...form.keys()].some(k=>!allowed.has(k))||[...allowed].some(k=>form.getAll(k).length!==1))throw fail(400,'发送文件数量不一致');
  const files=[];for(const [i,m]of meta.files.entries()){
   const upload=form.get('file'+i);if(!upload||typeof upload.arrayBuffer!=='function'||m.name!==upload.name)throw fail(400,'发送文件名称不一致');
   const file={kind:m.kind,name:m.name,bytes:new Uint8Array(await upload.arrayBuffer())};try{validateFile(file);}catch(e){throw fail(400,e.message);}
   if(m.sha256!==hash(file.bytes))throw fail(400,'发送文件校验未通过，请重新生成');files.push(file);
  }
  if(files.filter(f=>f.kind==='notice').length!==1||new Set(files.map(f=>f.kind)).size!==files.length)throw fail(400,'须包含一份发行通知，海报最多一份');
  return {meta,files};
 }
 const server=http.createServer(async(req,res)=>{
  const port=req.socket.localPort,own=`http://127.0.0.1:${port}`,origin=req.headers.origin;
  const localOrigin=origin===own,originAllowed=localOrigin||allowedOrigins.includes(origin);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const answer=(status,data)=>{res.writeHead(status,{...headers,'Content-Type':'application/json;charset=utf-8'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.host!==`127.0.0.1:${port}`)throw fail(403,'请通过本机127.0.0.1地址连接');
   const url=new URL(req.url,own);if(url.search)throw fail(400,'接口地址不接受查询参数');
   if(origin&&!originAllowed)throw fail(403,'当前网页未获准连接本机发送服务');
   if(originAllowed){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';headers['Access-Control-Allow-Private-Network']='true';}
   if(req.method==='OPTIONS'){if(!originAllowed)throw fail(403,'网页来源无效');res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Relay-Setup','Access-Control-Max-Age':'600'});res.end();return;}
   if(req.method==='GET'&&url.pathname==='/'){
    res.writeHead(200,{...headers,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${setupNonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`});res.end(setupPage(setupNonce));return;
   }
   if(url.pathname==='/api/setup'){
    if(origin&&!localOrigin||!safeToken(req.headers['x-relay-setup'],setupNonce))throw fail(403,'请在本机设置页面修改接收群');
    if(req.method==='GET'){answer(200,{name:config.name,configured:!!config.webhook,token:config.token});return;}
    if(req.method==='POST'){
     let data;try{data=JSON.parse(await body(req,4096));}catch(e){throw e.status?e:fail(400,'设置内容无效');}
     const name=String(data.name||'').trim(),webhook=String(data.webhook||'').trim()||config.webhook;
     if(!name||name.length>80||/[\r\n\0]/.test(name))throw fail(400,'请填写不超过80字的接收群名称');
     try{webhookKey(webhook);}catch(e){throw fail(400,e.message);}
     atomicJSON(configPath,{...config,name,webhook});Object.assign(config,{name,webhook});answer(200,{saved:true});return;
    }
    throw fail(405,'此操作不受支持');
   }
   if(!originAllowed||!safeToken(String(req.headers.authorization||'').replace(/^Bearer /,''),config.token))throw fail(401,'连接码无效，请从本机设置页面复制后重新连接');
   if(req.method==='GET'&&url.pathname==='/api/wecom/targets'){answer(200,{serviceId:config.serviceId,targets:config.webhook?[{id:'main',name:config.name}]:[],maxFiles:2,maxFileBytes:MAX_FILE_BYTES});return;}
   const match=url.pathname.match(/^\/api\/wecom\/jobs\/([A-Za-z0-9_-]{16,90})$/);
   if(req.method==='GET'&&match){const job=journal.jobs[match[1]];if(!job)throw fail(404,'未找到本次发送记录，请勿直接重复发送');answer(200,publicJob(job));return;}
   const resolution=url.pathname.match(/^\/api\/wecom\/jobs\/([A-Za-z0-9_-]{16,90})\/resolve$/);
   if(req.method==='POST'&&resolution){
    const job=journal.jobs[resolution[1]];if(!job)throw fail(404,'未找到本次发送记录');
    if(running.has(job.id)||aggregate(job.items)==='pending')throw fail(409,'本次发送仍在处理，请稍后查询');
    let data;try{data=JSON.parse(await body(req,4096));}catch(e){throw e.status?e:fail(400,'核实结果格式无效');}
    const unknown=job.items.filter(x=>x.status==='unknown');
    if(!unknown.length||data.confirmed!==true||data.revision!==job.revision||!Array.isArray(data.items)||data.items.length!==unknown.length||new Set(data.items.map(x=>x.kind)).size!==unknown.length||data.items.some(x=>!unknown.some(u=>u.kind===x.kind)||typeof x.received!=='boolean'))throw fail(400,'请在企微群中逐份核实所有待确认文件');
    for(const item of unknown){const result=data.items.find(x=>x.kind===item.kind);(job.resolutions ||= []).push({kind:item.kind,received:result.received,time:stamp()});Object.assign(item,{status:result.received?'sent':'failed',message:result.received?'经办人已在目标群核实收到此文件':'经办人已在目标群核实未收到，可重试',verified:'manual',time:stamp()});}
    job.updated=stamp();persist();answer(200,publicJob(job));return;
   }
   if(req.method==='POST'&&url.pathname==='/api/wecom/jobs'){
    if(!config.webhook)throw fail(409,'请先在本机设置接收群');
    const {meta,files}=await intake(req),targetRef=hash(config.webhook);
    const fingerprint=hash(JSON.stringify({issueId:meta.issueId,title:meta.title,revision:meta.revision,targetId:meta.targetId,files:files.map(({kind,name})=>({kind,name}))}));
    let job=journal.jobs[meta.id];
    if(job){
     if(job.fingerprint!==fingerprint)throw fail(409,'发送批次内容与已保存版本不一致');
     if(job.targetRef!==targetRef)throw fail(409,'接收群地址已变化，请恢复原群配置后查询或重试');
     if(running.has(job.id)||!meta.retryFailed){answer(200,publicJob(job));return;}
     if(job.items.some(x=>x.status==='unknown'))throw fail(409,'部分文件发送结果不明确，请在群内核实，不能自动重发');
     if(!job.items.some(x=>x.status==='failed')){answer(200,publicJob(job));return;}
     for(const item of job.items)if(item.status==='failed'){item.status='pending';item.message='等待重试';delete item.verified;}
     job.updated=stamp();
    }else{
     if(meta.retryFailed)throw fail(409,'未找到待重试的发送记录');
     const prior=Object.values(journal.jobs).find(j=>j.issueId===meta.issueId&&j.targetRef===targetRef&&aggregate(j.items)!=='failed');
     if(prior){if(prior.fingerprint!==fingerprint)throw fail(409,'该发行已有其他版本正在发送或已发送，请查询原发送记录，勿重复新建');answer(200,publicJob(prior));return;}
     job={id:meta.id,issueId:meta.issueId,title:meta.title,revision:meta.revision,targetId:meta.targetId,targetName:config.name,targetRef,fingerprint,created:stamp(),updated:stamp(),items:files.map(f=>({kind:f.kind,name:f.name,status:'pending',message:'等待发送'}))};journal.jobs[job.id]=job;
    }
    persist();running.add(job.id);const webhook=config.webhook;queue=queue.then(()=>run(job,files,webhook));answer(202,publicJob(job));return;
   }
   throw fail(404,'接口不存在');
  }catch(error){if(!res.headersSent)answer(error.status||500,{error:error.status?error.message:'本机发送服务暂不可用，请保留当前记录后重试'});else res.end();}
 });
 server.requestTimeout=60000;server.headersTimeout=15000;
 return server;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const port=Number(process.env.WECOM_PORT||4288);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('发送服务端口无效');
  const server=createRelayServer({...(process.env.WECOM_DATA_DIR?{dataDir:resolve(process.env.WECOM_DATA_DIR)}:{}),...(process.env.WECOM_ALLOWED_ORIGINS?{allowedOrigins:process.env.WECOM_ALLOWED_ORIGINS.split(',').map(s=>s.trim())}:{})});
  server.on('error',()=>{console.error('本机发送服务无法启动，请检查端口是否已被占用。');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`企微发送服务已启动。请打开 http://127.0.0.1:${port}/ 配置接收群。配置不会自动发送消息。`));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
