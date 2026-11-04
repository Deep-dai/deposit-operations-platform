import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createCloudHandler,CLOUD_MAX_FILE_BYTES,PGStore} from '../server/cloud-wecom/handler.mjs';
import {submitCloudJob,advanceCloudJob} from '../dist/wecom-cloud-client.js';
import {connection,saveConnection,clearConnection,useCloudConnection} from '../dist/wecom-client.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const copy=x=>structuredClone(x);
const env={TCB_ENV:'env-test',WECOM_ENABLED:'true',WECOM_GROUP_NAME:'合成测试群',WECOM_WEBHOOK:'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=unit-test-key-123456'};
class MemoryStore{
 rows=new Map();attempts=0;broken=false;
 async get(id){return copy(this.rows.get(id)||null);}
 async write(row,version,{sending=false}={}){
  if(this.broken)throw Error('database unavailable');
  if(version===-1){
   if(this.rows.has(row.id))return this.get(row.id);
   const previous=[...this.rows.values()].find(x=>x.issue_key===row.issue_key);
   if(previous){if(previous.fingerprint===row.fingerprint||previous.data.items.some(x=>x.status!=='failed'))return copy(previous);previous.issue_key+=':archived:'+previous.id;}
  }else if(this.rows.get(row.id)?.version!==version)return null;
  if(sending)this.attempts++;
  const result={...copy(row),version:version===-1?1:version+1};this.rows.set(row.id,result);return copy(result);
 }
}
function fixture(upstream){
 let time=Date.now(),uploads=0,sends=0;
 const store=new MemoryStore(),owner=randomUUID();
 const fetchImpl=async(url,options)=>{const type=url.includes('upload_media')?'upload':'send';type==='upload'?uploads++:sends++;return upstream?upstream({type,url,options,store}):new Response(JSON.stringify(type==='upload'?{errcode:0,media_id:'media-'+uploads}:{errcode:0}));};
 const handler=createCloudHandler({env,store,fetchImpl,now:()=>time});
 const call=async(path,{method='GET',body}={},who=owner)=>{
  const binary=body instanceof Blob;
  const response=await handler({httpMethod:method,path:'/wecom'+path,headers:{Origin:'https://deep-dai.github.io','X-Wecom-Owner':who,...(binary?{'Content-Type':'application/octet-stream'}:{})},...(body?{body:binary?Buffer.from(await body.arrayBuffer()).toString('base64'):JSON.stringify(body),isBase64Encoded:binary}:{})});
  const data=JSON.parse(response.body);if(response.statusCode>=400)throw Object.assign(Error(data.error),{status:response.statusCode});return data;
 };
 const files=['notice','poster'].map(kind=>{const bytes=Buffer.from(kind==='notice'?[80,75,3,4,1,2,3,4,5,6]:[255,216,255,1,2,3,4,5,6,7]);return {kind,name:kind==='notice'?'合成通知.docx':'合成海报.jpg',sha256:hash(bytes),blob:new Blob([bytes])};});
 const meta={id:'WC-'+randomUUID(),issueId:'FX-unit-1',title:'合成测试',revision:'a'.repeat(64),targetId:'main',retryFailed:false};
 const cache=new Map(),read=async id=>cache.get(id),write=async pack=>{cache.set(pack.id,pack);return pack;};
 return {store,handler,call,meta,files,owner,cache,options:{read,write,request:call},advance:()=>advanceCloudJob(meta.id,{read,request:call}),tick:()=>{time+=9000;},counts:()=>({uploads,sends})};
}
test('云端分开上传与发送，两份材料完成后只返回回执，不返回密钥或media_id',async()=>{
 const f=fixture();let r=await submitCloudJob(f.meta,f.files,f.options);assert.equal(r.status,'pending');assert.deepEqual(f.counts(),{uploads:0,sends:0});
 for(let i=0;i<4;i++)r=await f.advance();assert.equal(r.status,'sent');assert.deepEqual(f.counts(),{uploads:2,sends:2});
 await f.advance();await submitCloudJob(f.meta,f.files,f.options);assert.equal(f.counts().sends,2);
 assert.ok(!JSON.stringify(r).includes('unit-test-key'));assert.ok(!JSON.stringify(r).includes('media-'));
 assert.ok(!JSON.stringify([...f.store.rows.values()]).includes('base64'));
});
test('并发发送同一文件只能成功认领一次，重复批次复用原记录',async()=>{
 const f=fixture();await submitCloudJob(f.meta,f.files.slice(0,1),f.options);await f.advance();
 await Promise.all([f.advance(),f.advance()]);assert.equal(f.counts().sends,1);
 const duplicate=await submitCloudJob({...f.meta,id:'WC-'+randomUUID()},f.files.slice(0,1),f.options);assert.equal(duplicate.id,f.meta.id);
 await assert.rejects(f.call('/api/wecom/jobs/'+f.meta.id,{},randomUUID()),/未找到/);
});
test('发送回复丢失保持待核实状态，关闭后查询和重新创建处理器均不重发',async()=>{
 const f=fixture(({type})=>{if(type==='send')throw Error('reply lost');return new Response(JSON.stringify({errcode:0,media_id:'m'}));});
 await submitCloudJob(f.meta,f.files.slice(0,1),f.options);await f.advance();const result=await f.advance();assert.equal(result.status,'unknown');
 await f.advance();await assert.rejects(submitCloudJob({...f.meta,retryFailed:true},f.files.slice(0,1),f.options),/不能自动重发/);assert.equal(f.counts().sends,1);
 const restarted=createCloudHandler({env,store:f.store,fetchImpl:()=>{throw Error('must not send');}});
 const response=await restarted({httpMethod:'GET',path:'/api/wecom/jobs/'+f.meta.id,headers:{Origin:'https://deep-dai.github.io','X-Wecom-Owner':f.owner}});
 assert.equal(JSON.parse(response.body).status,'unknown');
});
test('上游已成功但结果未保存时，回执仍按不明确处理，避免超时误判后重发',async()=>{
 const f=fixture(({type,store})=>{if(type==='send'){store.broken=true;return new Response('{"errcode":0}');}return new Response('{"errcode":0,"media_id":"m"}');});
 await submitCloudJob(f.meta,f.files.slice(0,1),f.options);await f.advance();await assert.rejects(f.advance(),/云端发送暂不可用/);
 f.store.broken=false;f.tick();assert.equal((await f.advance()).status,'unknown');assert.equal(f.counts().sends,1);
});
test('同批首份发送不明确时停止剩余文件，仍可进入人工核实，不陷入等待',async()=>{
 const f=fixture(({type})=>{if(type==='send')throw Error('lost');return new Response('{"errcode":0,"media_id":"m"}');});
 await submitCloudJob(f.meta,f.files,f.options);await f.advance();let r=await f.advance();
 assert.equal(r.status,'unknown');assert.deepEqual(r.items.map(x=>x.status),['unknown','failed']);
 await f.advance();assert.deepEqual(f.counts(),{uploads:1,sends:1});
 r=await f.call('/api/wecom/jobs/'+f.meta.id+'/resolve',{method:'POST',body:{revision:f.meta.revision,confirmed:true,items:[{kind:'notice',received:true}]}});
 assert.equal(r.status,'partial');assert.equal(f.counts().sends,1);
});
test('部分成功仅重试失败文件，复用原始缓存字节而非重新生成的Word字节',async()=>{
 let sends=0;const f=fixture(({type})=>new Response(JSON.stringify(type==='upload'?{errcode:0,media_id:'m'}:{errcode:++sends===2?93000:0})));
 await submitCloudJob(f.meta,f.files,f.options);let r;for(let i=0;i<4;i++)r=await f.advance();assert.equal(r.status,'partial');
 const changed=f.files.map(file=>({...file,blob:new Blob(['regenerated bytes'])}));
 await submitCloudJob({...f.meta,retryFailed:true},changed,f.options);r=await f.advance();assert.equal(r.status,'sent');assert.equal(f.counts().sends,3);assert.equal(f.counts().uploads,2);
});
test('上传失败可改版，新版本创建后旧失败批次不能恢复发送',async()=>{
 const f=fixture(()=>new Response('{"errcode":93000}'));
 await submitCloudJob(f.meta,f.files.slice(0,1),f.options);assert.equal((await f.advance()).status,'failed');
 const next={...f.meta,id:'WC-'+randomUUID(),revision:'b'.repeat(64)};
 await submitCloudJob(next,f.files.slice(0,1),f.options);
 await assert.rejects(submitCloudJob({...f.meta,retryFailed:true},f.files.slice(0,1),f.options),/已有新版本/);
});
test('云端拒绝异常来源、过大文件和不一致字节；未配置时不宣称连接群成功',async()=>{
 const f=fixture();assert.equal((await f.handler({httpMethod:'GET',path:'/api/wecom/targets',headers:{Origin:'https://evil.example'}})).statusCode,403);
 const empty=createCloudHandler({env:{},store:f.store});const result=await empty({httpMethod:'GET',path:'/api/wecom/targets',headers:{Origin:'https://deep-dai.github.io'}});assert.equal(JSON.parse(result.body).configured,false);
 await assert.rejects(f.call('/api/wecom/jobs',{method:'POST',body:{...f.meta,files:[{kind:'notice',name:'通知.docx',sha256:'c'.repeat(64),size:CLOUD_MAX_FILE_BYTES+1}]}}),/不超过3MB/);
 await submitCloudJob(f.meta,f.files.slice(0,1),f.options);await assert.rejects(f.call('/api/wecom/jobs/'+f.meta.id+'/upload',{method:'POST',body:{kind:'notice',base64:Buffer.from('wrong').toString('base64')}}),/不一致/);assert.equal(f.counts().uploads,0);
});
test('私有记录服务不回显API密钥，限流提示保留可理解的业务含义',async()=>{
 const store=new PGStore({envId:'env-test',apiKey:'must-stay-private',fetchImpl:async()=>new Response('{"message":"WECOM_MINUTE_SEND_LIMIT must-stay-private"}',{status:400})});
 await assert.rejects(store.get('WC-test'),error=>error.status===429&&!error.message.includes('must-stay-private'));
});
test('新用户默认使用云端，旧本机记录继续路由原本机服务',()=>{
 const data=new Map();globalThis.sessionStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 assert.equal(connection().mode,'cloud');assert.equal(connection('old-local-service'),null);
 saveConnection('http://127.0.0.1:4288','a'.repeat(64));assert.equal(connection().mode,'local');assert.equal(connection('old-local-service').mode,'local');
 useCloudConnection();assert.equal(connection().mode,'cloud');assert.equal(connection('old-local-service').mode,'local');clearConnection();delete globalThis.sessionStorage;
});
