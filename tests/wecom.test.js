import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createRelayServer} from '../server/wecom-relay.mjs';
import {webhookKey,uploadFile,sendUploadedFile,MAX_FILE_BYTES} from '../server/wecom-transport.mjs';
import {seed,clone,createIssue} from '../dist/core.js';
import {saveNotice,noticeConfig,noticeDocument} from '../dist/notice-model.js';
import {buildPosterModel} from '../dist/poster-model.js';
import {beginWecomDelivery,applyWecomReceipt} from '../dist/wecom-model.js';
import {isIssueEditable,canCancelIssue,issueDeliveryLabel,cancelIssue} from '../dist/issue-lifecycle.js';

const WEBHOOK='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key-1234567890';
const ORIGIN='https://deep-dai.github.io';
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const digest=value=>createHash('sha256').update(value).digest('hex');
const file=(kind='notice')=>({kind,name:kind==='notice'?'发行通知.docx':'发行海报.jpg',bytes:new Uint8Array(kind==='notice'?[80,75,3,4,1,2,3,4,5,6]:[255,216,255,1,2,3,4,5,6,7])});
async function relay(t,fetchImpl){
 const dataDir=mkdtempSync(join(tmpdir(),'deposit-wecom-test-'));
 const server=createRelayServer({dataDir,fetchImpl});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dataDir,{recursive:true,force:true});});
 const page=await (await fetch(base)).text(),nonce=page.match(/script nonce="([^"]+)"/)[1];
 const setup=await fetch(base+'/api/setup',{method:'POST',headers:{Origin:base,'X-Relay-Setup':nonce,'Content-Type':'application/json'},body:JSON.stringify({name:'测试接收群',webhook:WEBHOOK})});assert.equal(setup.status,200);
 const config=JSON.parse(readFileSync(join(dataDir,'config.json'),'utf8'));
 const headers={Origin:ORIGIN,Authorization:'Bearer '+config.token};
 const request=async(path,options={})=>{const r=await fetch(base+path,{...options,headers:{...headers,...options.headers}});return {http:r.status,data:await r.json()};};
 return {base,server,dataDir,headers,config,request};
}
function multipart({id='WC-'+randomUUID(),issueId='FX-test-001',revision='a'.repeat(64),retryFailed=false,files=[file()],...extra}={}){
 files=files.map(f=>f.bytes?f:{...file(f.kind),name:f.name});
 const form=new FormData();const meta={id,issueId,title:'测试发行',revision,targetId:'main',retryFailed,files:files.map(f=>({kind:f.kind,name:f.name,sha256:digest(f.bytes)})),...extra};
 form.set('metadata',JSON.stringify(meta));files.forEach((f,i)=>form.set('file'+i,new Blob([f.bytes]),f.name));return {form,meta};
}
async function completed(r,id){for(let i=0;i<150;i++){const {data}=await r.request('/api/wecom/jobs/'+id);if(data.status!=='pending')return data;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('发送任务未结束');}

test('企微地址限制固定官方域名和路径，禁止任意目标及异常文件',async()=>{
 assert.equal(webhookKey(WEBHOOK),'test-key-1234567890');
 for(const value of ['http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key-1234567890',WEBHOOK+'&other=1',WEBHOOK.replace('qyapi.weixin.qq.com','attacker.example'),WEBHOOK.replace('/send','/other'),WEBHOOK+'#secret',WEBHOOK.replace('https://','https://user:pass@')])assert.throws(()=>webhookKey(value));
 let calls=0;await assert.rejects(uploadFile(WEBHOOK,{...file(),bytes:new Uint8Array(MAX_FILE_BYTES+1)},{fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);
});
test('先上传再发送，HTTP成功但errcode失败不视为已发送，不回显Webhook',async()=>{
 const seen=[];const upstream=async(url,options)=>{seen.push({url,options});return url.includes('upload_media')?json({errcode:0,media_id:'unit-media'}):json({errcode:0});};
 const uploaded=await uploadFile(WEBHOOK,file(),{fetchImpl:upstream});assert.equal(uploaded.mediaId,'unit-media');
 assert.equal((await sendUploadedFile(WEBHOOK,uploaded.mediaId,{fetchImpl:upstream})).status,'sent');assert.equal(seen.length,2);assert.equal(seen[0].options.body.get('media').name,'发行通知.docx');assert.deepEqual(JSON.parse(seen[1].options.body),{msgtype:'file',file:{media_id:'unit-media'}});assert.equal(seen[1].options.redirect,'error');
 assert.equal((await sendUploadedFile(WEBHOOK,'x',{fetchImpl:async()=>json({errcode:93000,errmsg:WEBHOOK})})).status,'failed');
 assert.ok(!JSON.stringify(await sendUploadedFile(WEBHOOK,'x',{fetchImpl:async()=>json({errcode:93000,errmsg:WEBHOOK})})).includes('test-key'));
 assert.equal((await sendUploadedFile(WEBHOOK,'x',{fetchImpl:async()=>{throw Error(WEBHOOK);}})).status,'unknown');
 assert.equal((await uploadFile(WEBHOOK,file(),{fetchImpl:async()=>{throw Error(WEBHOOK);}})).status,'failed');
});
test('本机服务须验证来源和连接码；网页不能读取或修改Webhook',async t=>{
 let calls=0;const r=await relay(t,async()=>{calls++;return json({errcode:0});});
 const targets=await r.request('/api/wecom/targets');assert.equal(targets.http,200);assert.deepEqual(targets.data.targets,[{id:'main',name:'测试接收群'}]);assert.ok(!JSON.stringify(targets.data).includes('test-key'));
 assert.equal((await r.request('/api/wecom/targets',{headers:{Origin:'https://evil.example'}})).http,403);
 assert.equal((await r.request('/api/wecom/targets',{headers:{Authorization:'Bearer wrong'}})).http,401);
 assert.equal((await fetch(r.base+'/api/wecom/targets')).status,401);
 assert.equal((await r.request('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).http,403);
 assert.equal((await r.request('/api/wecom/targets?token=secret')).http,400);
 const preflight=await fetch(r.base+'/api/wecom/jobs',{method:'OPTIONS',headers:{Origin:ORIGIN,'Access-Control-Request-Private-Network':'true'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),ORIGIN);assert.equal(preflight.headers.get('Access-Control-Allow-Private-Network'),'true');assert.equal(calls,0);
});
test('文件内容校验失败不上传；单批重复请求与同版本新请求不重复发送',async t=>{
 let uploads=0,sends=0;const r=await relay(t,async url=>url.includes('upload_media')?(uploads++,json({errcode:0,media_id:'m'})):(sends++,json({errcode:0})));
 const bad=multipart({sha256:'bad'});const meta={...bad.meta,files:[{...bad.meta.files[0],sha256:'0'.repeat(64)}]};bad.form.set('metadata',JSON.stringify(meta));assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:bad.form})).http,400);assert.equal(uploads,0);
 const batch=multipart();assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:batch.form})).http,202);
 const result=await completed(r,batch.meta.id);assert.equal(result.status,'sent');
 await r.request('/api/wecom/jobs',{method:'POST',body:multipart({...batch.meta}).form});
 const duplicate=await r.request('/api/wecom/jobs',{method:'POST',body:multipart().form});assert.equal(duplicate.data.id,batch.meta.id);assert.equal(sends,1);assert.equal(uploads,1);
 assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:multipart({revision:'b'.repeat(64)}).form})).http,409);
 const journal=readFileSync(join(r.dataDir,'jobs.json'),'utf8');assert.ok(!journal.includes('test-key'));assert.ok(!journal.includes('base64'));assert.ok(!JSON.stringify(result).includes('test-key'));
});
test('部分成功只重试明确失败的文件，成功文件不重复发送',async t=>{
 let uploads=0,sends=0;const r=await relay(t,async url=>url.includes('upload_media')?(uploads++,json({errcode:0,media_id:'m'+uploads})):(sends++,json({errcode:sends===2?93000:0})));
 const batch=multipart({files:[file(),file('poster')]});await r.request('/api/wecom/jobs',{method:'POST',body:batch.form});assert.equal((await completed(r,batch.meta.id)).status,'partial');assert.equal(sends,2);
 const retry=multipart({...batch.meta,retryFailed:true,files:[file(),file('poster')]});assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:retry.form})).http,202);const result=await completed(r,batch.meta.id);assert.equal(result.status,'sent');assert.equal(sends,3);assert.equal(uploads,3);
});
test('发送超时保留待核实状态；重复请求、重试及重启均不会自动重发',async t=>{
 let sends=0;const r=await relay(t,async url=>{if(url.includes('upload_media'))return json({errcode:0,media_id:'m'});sends++;throw Error('network timeout');});
 const batch=multipart();await r.request('/api/wecom/jobs',{method:'POST',body:batch.form});assert.equal((await completed(r,batch.meta.id)).status,'unknown');
 assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:multipart({...batch.meta,retryFailed:true}).form})).http,409);
 await r.request('/api/wecom/jobs',{method:'POST',body:multipart({...batch.meta}).form});assert.equal(sends,1);
 // Simulate a process interrupted at the pre-send journal boundary.
 const dataDir=mkdtempSync(join(tmpdir(),'deposit-wecom-restart-'));t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
 writeFileSync(join(dataDir,'config.json'),readFileSync(join(r.dataDir,'config.json')));const journal=JSON.parse(readFileSync(join(r.dataDir,'jobs.json')));journal.jobs[batch.meta.id].items[0].status='sending';writeFileSync(join(dataDir,'jobs.json'),JSON.stringify(journal));
 const restarted=createRelayServer({dataDir,fetchImpl:async()=>{throw Error('must not send');}});restarted.close();assert.equal(JSON.parse(readFileSync(join(dataDir,'jobs.json'))).jobs[batch.meta.id].items[0].status,'unknown');
});
test('上传失败可以重试，接收群地址改变后拒绝向新群重试旧批次',async t=>{
 let calls=0;const r=await relay(t,async()=>{calls++;return json({errcode:93000});});
 const batch=multipart();await r.request('/api/wecom/jobs',{method:'POST',body:batch.form});assert.equal((await completed(r,batch.meta.id)).status,'failed');assert.equal(calls,1);
 const changed=JSON.parse(readFileSync(join(r.dataDir,'config.json'),'utf8'));assert.ok(changed.webhook);
 const page=await (await fetch(r.base)).text(),nonce=page.match(/script nonce="([^"]+)"/)[1];await fetch(r.base+'/api/setup',{method:'POST',headers:{Origin:r.base,'X-Relay-Setup':nonce},body:JSON.stringify({name:'新群',webhook:WEBHOOK.replace('test-key','other-key')})});
 assert.equal((await r.request('/api/wecom/jobs',{method:'POST',body:multipart({...batch.meta,retryFailed:true}).form})).http,409);assert.equal(calls,1);
});
test('待核实文件须人工逐项确认，核实不发送消息，未收到项才可重试',async t=>{
 let sends=0,mode='unknown';const r=await relay(t,async url=>{if(url.includes('upload_media'))return json({errcode:0,media_id:'m'});sends++;if(mode==='unknown')throw Error('response lost');return json({errcode:0});});
 const batch=multipart();await r.request('/api/wecom/jobs',{method:'POST',body:batch.form});assert.equal((await completed(r,batch.meta.id)).status,'unknown');
 const path='/api/wecom/jobs/'+batch.meta.id+'/resolve',data={revision:batch.meta.revision,confirmed:true,items:[{kind:'notice',received:false}]};
 assert.equal((await r.request(path,{method:'POST',body:JSON.stringify({...data,confirmed:false})})).http,400);
 const resolved=await r.request(path,{method:'POST',body:JSON.stringify(data)});assert.equal(resolved.data.status,'failed');assert.equal(resolved.data.items[0].verified,'manual');assert.equal(sends,1);
 mode='success';await r.request('/api/wecom/jobs',{method:'POST',body:multipart({...batch.meta,retryFailed:true}).form});const result=await completed(r,batch.meta.id);assert.equal(result.status,'sent');assert.equal(result.items[0].verified,undefined);assert.equal(sends,2);
 const journal=JSON.parse(readFileSync(join(r.dataDir,'jobs.json')));assert.deepEqual(journal.jobs[batch.meta.id].resolutions.map(({kind,received})=>({kind,received})),[{kind:'notice',received:false}]);
});
test('一分钟发送上限作用于群，多批次也不能绕过',async t=>{
 let sends=0;const r=await relay(t,async url=>url.includes('upload_media')?json({errcode:0,media_id:'m'}):(sends++,json({errcode:0})));
 for(let i=0;i<21;i++){const b=multipart({issueId:'FX-rate-'+i});await r.request('/api/wecom/jobs',{method:'POST',body:b.form});const result=await completed(r,b.meta.id);assert.equal(result.status,i<20?'sent':'failed');}assert.equal(sends,20);
});

function issueFixture(){const state=seed(),product=state.products.find(p=>p.status==='ready'),issue=createIssue(state,[product.id],'测试企微发送');saveNotice(state,issue,{...noticeConfig(issue),date:'2026-11-03'});return {state,product,issue};}
function begin(issue,files=[{kind:'notice',name:'通知.docx'}]){return beginWecomDelivery(issue,{jobId:'WC-'+randomUUID(),revision:'a'.repeat(64),serviceId:'local-service',target:{id:'main',name:'测试群'},files,noticeSnapshot:noticeDocument(issue),posterSnapshot:files.length>1?{test:true}:null});}
function receipt(issue,statuses){const d=issue.wecomDelivery,items=d.items.map((item,index)=>({...item,status:statuses[index],message:'接口结果'}));return {id:d.jobId,issueId:issue.id,revision:d.revision,targetId:d.targetId,items,status:statuses.every(s=>s==='sent')?'sent':statuses.includes('sending')?'pending':statuses.includes('unknown')?'unknown':statuses.includes('sent')?'partial':'failed',updated:'2026-11-03T12:00:00Z'};}
test('发起企微发送即锁定，成功回执才标记已企微下发，普通产品同步发行',()=>{
 const {state,product,issue}=issueFixture();begin(issue);assert.equal(issueDeliveryLabel(issue),'企微发送中');assert.equal(isIssueEditable(issue),false);assert.equal(canCancelIssue(issue),false);assert.throws(()=>cancelIssue(state,issue.id),/锁定/);
 applyWecomReceipt(state,issue,receipt(issue,['sent']));assert.equal(issueDeliveryLabel(issue),'已企微下发');assert.equal(product.status,'issued');assert.equal(issue.recipients.length,0);assert.equal(canCancelIssue(issue),false);assert.throws(()=>saveNotice(state,issue,noticeConfig(issue)),/不能修改/);
 const before=clone(issue);assert.throws(()=>applyWecomReceipt(state,issue,{...receipt(issue,['failed']),status:'sent'}),/不一致/);assert.deepEqual(issue,before);
});
test('全部明确失败仍可修改取消，部分成功和结果不明确继续锁定，回执不能串批次',()=>{
 for(const statuses of [['failed','failed'],['sent','failed'],['sent','unknown']]){
  const {state,issue}=issueFixture();begin(issue,[{kind:'notice',name:'通知.docx'},{kind:'poster',name:'海报.jpg'}]);applyWecomReceipt(state,issue,receipt(issue,statuses));assert.equal(canCancelIssue(issue),statuses.every(s=>s==='failed'));
  if(statuses.every(s=>s==='failed'))assert.equal(issue.noticeSnapshot,undefined);else assert.ok(issue.noticeSnapshot);
  const before=clone(issue);assert.throws(()=>applyWecomReceipt(state,issue,{...receipt(issue,statuses),revision:'b'.repeat(64)}),/不一致/);assert.deepEqual(issue,before);
 }
 const {issue}=issueFixture();assert.throws(()=>beginWecomDelivery(issue,{},'reviewer'),/产品经理/);
});
