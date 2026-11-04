import {createHash,randomUUID} from 'node:crypto';
import {webhookKey,validateFile,uploadFile,sendUploadedFile} from './transport.mjs';

export const CLOUD_SERVICE_ID='cloud-wecom-free-probe-v1';
export const CLOUD_MAX_FILE_BYTES=3_000_000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});
const aggregate=items=>items.every(x=>x.status==='sent')?'sent':items.some(x=>['pending','uploading','sending'].includes(x.status))?'pending':items.some(x=>x.status==='unknown')?'unknown':items.some(x=>x.status==='sent')?'partial':'failed';
const stamp=()=>new Date().toISOString();
const clone=value=>structuredClone(value);
const nameOK=value=>typeof value==='string'&&value.length>0&&value.length<=180&&!/[\\/\r\n\0]/.test(value);
const idOK=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,90}$/.test(value);
const hashOK=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export class PGStore {
 constructor({envId,apiKey,fetchImpl=fetch}){
  if(!/^[a-z0-9-]{5,100}$/.test(envId||'')||!apiKey)throw fail(503,'云端发送记录尚未配置');
  this.base=`https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/`;
  this.key=apiKey;this.fetch=fetchImpl;
 }
 async request(path,{method='GET',body}={}){
  let response,data;
  try{
   response=await this.fetch(this.base+path,{method,headers:{Authorization:'Bearer '+this.key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(850)});
   data=await response.json();
  }catch{throw fail(503,'云端记录暂时无法读取，请稍后查询，勿重复新建发送');}
  if(!response.ok){
   const text=JSON.stringify(data);
   if(text.includes('WECOM_MINUTE_SEND_LIMIT'))throw fail(429,'接收群一分钟内已发起20条消息，请稍后继续');
   throw fail(503,'云端记录未能保存，请查询发送结果，勿重复新建');
  }
  return data;
 }
 async get(id){return (await this.request('wecom_relay_jobs?id=eq.'+encodeURIComponent(id)+'&select=*'))[0]||null;}
 async write(row,expected,{sending=false}={}){
  return this.request('rpc/wecom_relay_write',{method:'POST',body:{p_id:row.id,p_expected:expected,p_issue_key:row.issue_key,p_fingerprint:row.fingerprint,p_data:row.data,p_send:sending}});
 }
}

export function publicReceipt(row){
 const j=row.data,status=aggregate(j.items);
 const next=status==='pending'?j.items.find(x=>x.status==='pending'):null;
 return {id:row.id,issueId:j.issueId,revision:j.revision,targetId:'main',targetName:j.targetName,status,created:j.created,updated:j.updated,
  items:j.items.map(({kind,name,status,message,time,verified})=>({kind,name,status,message,time,...(verified?{verified}:{})})),
  ...(next?{next:{kind:next.kind,action:next.mediaId?'send':'upload'}}:{})};
}

export function createCloudHandler({env=process.env,store,fetchImpl=fetch,now=Date.now}={}){
 const allowed=new Set(['https://deep-dai.github.io','http://127.0.0.1:4287','http://127.0.0.1:4299']);
 let database=store;
 const db=()=>database||(database=new PGStore({envId:env.TCB_ENV||env.WECOM_ENV_ID,apiKey:env.CLOUDBASE_APIKEY,fetchImpl}));
 const configured=()=>{try{webhookKey(env.WECOM_WEBHOOK);return env.WECOM_ENABLED==='true'&&(!!database||!!env.CLOUDBASE_APIKEY);}catch{return false;}};
 const group=()=>String(env.WECOM_GROUP_NAME||'结构性存款测试群').slice(0,80);
 const targetRef=()=>digest(env.WECOM_WEBHOOK||'');
 async function load(id,owner){
  let row=await db().get(id);
  if(!row||row.data.owner!==owner)throw fail(404,'未找到本次发送记录，请先查询，勿重复发送');
  let stale=false;
  const data=clone(row.data);
  for(const item of data.items)if(['sending','uploading'].includes(item.status)&&now()-item.startedAt>8000){
   const sending=item.status==='sending';
   Object.assign(item,{status:sending?'unknown':'failed',message:sending?'发送结果未能确认，请在群内核实，暂不自动重发':'上传未能完成，尚未向群发送，可重试',time:stamp()});
   stale=true;
  }
  if(data.items.some(x=>x.status==='unknown'))for(const item of data.items)if(item.status==='pending'){
   Object.assign(item,{status:'failed',message:'同批其他文件结果待核实，本文件尚未发送',time:stamp()});stale=true;
  }
  if(stale){data.updated=stamp();const changed=await db().write({...row,data},row.version);row=changed||await db().get(id);}
  return row;
 }
 const parse=event=>{
  if(typeof event.body!=='string'||event.body.length>(event.isBase64Encoded?5_500_000:4_100_000))throw fail(413,'发送文件过大，请使用压缩海报或本机发送');
  try{return JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body);}catch{throw fail(400,'请求内容无法读取');}
 };
 function validMeta(meta){
  if(!idOK(meta.id)||!/^[A-Za-z0-9_-]{1,100}$/.test(meta.issueId||'')||!hashOK(meta.revision)||meta.targetId!=='main'||typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>200||typeof meta.retryFailed!=='boolean'||!Array.isArray(meta.files)||meta.files.length<1||meta.files.length>2)throw fail(400,'发送批次信息无效');
  if(meta.files.filter(x=>x.kind==='notice').length!==1||new Set(meta.files.map(x=>x.kind)).size!==meta.files.length||meta.files.some(x=>!['notice','poster'].includes(x.kind)||!nameOK(x.name)||!hashOK(x.sha256)||!Number.isInteger(x.size)||x.size<=5||x.size>CLOUD_MAX_FILE_BYTES))throw fail(400,'请发送一份发行通知及最多一份海报，每份不超过3MB');
 }
 return async function main(event={}){
  const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const origin=headers.origin;
  const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(allowed.has(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Wecom-Owner','Access-Control-Max-Age':'600'}:{})},body:JSON.stringify(data),isBase64Encoded:false});
  try{
   if(!allowed.has(origin))throw fail(403,'当前网页来源未获准使用云端发送');
   if(event.httpMethod==='OPTIONS')return reply(204,null);
   const path=String(event.path||'').replace(/^\/wecom(?=\/|$)/,'')||'/';
   if(event.httpMethod==='GET'&&path==='/api/wecom/targets')return reply(200,{serviceId:CLOUD_SERVICE_ID,mode:'cloud',targets:configured()?[{id:'main',name:group()}]:[],maxFiles:2,maxFileBytes:CLOUD_MAX_FILE_BYTES,configured:configured()});
   if(!configured())throw fail(503,'云端接收群尚未配置完成，请联系维护人员');
   const rawOwner=String(headers['x-wecom-owner']||'');
   if(!/^[a-f0-9-]{36}$/.test(rawOwner))throw fail(400,'缺少本次浏览器的发送标识');
   const owner=digest(rawOwner);
   const match=path.match(/^\/api\/wecom\/jobs\/([A-Za-z0-9_-]{16,90})(?:\/(upload|send|resolve)(?:\/(notice|poster))?)?$/);
   if(event.httpMethod==='GET'&&match&&!match[2])return reply(200,publicReceipt(await load(match[1],owner)));
   if(event.httpMethod==='POST'&&path==='/api/wecom/jobs'){
    const meta=parse(event);validMeta(meta);
    const fingerprint=digest(JSON.stringify({issueId:meta.issueId,title:meta.title,revision:meta.revision,files:meta.files.map(({kind,name})=>({kind,name}))}));
    const issueKey=digest(owner+'|'+meta.issueId+'|'+targetRef());
    let row=await db().get(meta.id);
    if(!row){
     if(meta.retryFailed)throw fail(409,'未找到待重试记录');
     const data={owner,issueId:meta.issueId,title:meta.title,revision:meta.revision,targetName:group(),targetRef:targetRef(),created:stamp(),updated:stamp(),items:meta.files.map(f=>({...f,status:'pending',message:'等待上传'}))};
     row=await db().write({id:meta.id,issue_key:issueKey,fingerprint,data},-1);
    }
    if(row.data.owner!==owner||row.fingerprint!==fingerprint||row.data.targetRef!==targetRef())throw fail(409,'该发行已登记其他发送内容或接收群，请查询原记录，勿重复新建');
    row=await load(row.id,owner);
    if(row.issue_key!==issueKey)throw fail(409,'此失败批次已有新版本，请处理当前版本的发送记录');
    if(meta.retryFailed){
     if(row.data.items.some(x=>x.status==='unknown'))throw fail(409,'发送结果尚待核实，不能自动重发');
     if(!row.data.items.some(x=>['sending','uploading','pending'].includes(x.status))){
      const data=clone(row.data);for(const item of data.items)if(item.status==='failed'){item.status='pending';item.message='等待重试';delete item.verified;if(item.uploadedAt&&now()-item.uploadedAt>172800000)delete item.mediaId;}
      data.updated=stamp();row=await db().write({...row,data},row.version)||await db().get(row.id);
     }
    }
    return reply(200,publicReceipt(row));
   }
   if(event.httpMethod==='POST'&&match&&match[2]){
    let row=await load(match[1],owner);const action=match[2],binary=action==='upload'&&!!match[3],input=binary?{kind:match[3]}:parse(event);
    if(row.data.targetRef!==targetRef())throw fail(409,'接收群配置已改变，请联系维护人员核对原发送记录');
    if(row.issue_key!==digest(owner+'|'+row.data.issueId+'|'+targetRef()))throw fail(409,'该批次已由新版本替代，不能重发旧版');
    if(action==='resolve'){
     const unknown=row.data.items.filter(x=>x.status==='unknown');
     if(row.data.items.some(x=>['sending','uploading'].includes(x.status))||!unknown.length||input.confirmed!==true||input.revision!==row.data.revision||!Array.isArray(input.items)||input.items.length!==unknown.length||new Set(input.items.map(x=>x.kind)).size!==unknown.length||input.items.some(x=>!unknown.some(u=>u.kind===x.kind)||typeof x.received!=='boolean'))throw fail(400,'请在群内逐份核实待确认文件');
     const data=clone(row.data);
     for(const item of data.items)if(item.status==='unknown'){
      const answer=input.items.find(x=>x.kind===item.kind);
      Object.assign(item,{status:answer.received?'sent':'failed',message:answer.received?'经办人已在群内核实收到':'经办人已核实未收到，可重试',verified:'manual',time:stamp()});
      (data.resolutions||=[]).push({kind:item.kind,received:answer.received,time:stamp()});
     }
     data.updated=stamp();row=await db().write({...row,data},row.version)||await db().get(row.id);return reply(200,publicReceipt(row));
    }
    const item=row.data.items.find(x=>x.kind===input.kind);
    if(!item)throw fail(400,'文件类型无效');
    if(row.data.items.some(x=>['sending','uploading','unknown'].includes(x.status))||item.status!=='pending')return reply(200,publicReceipt(row));
    let bytes;
    if(action==='upload'){
     if(item.mediaId)return reply(200,publicReceipt(row));
     if(binary){
      if(!/^application\/octet-stream(?:;|$)/i.test(headers['content-type']||'')||event.isBase64Encoded!==true||typeof event.body!=='string'||event.body.length>4_000_000)throw fail(400,'二进制上传格式无效，请重新查询并上传');
      bytes=Buffer.from(event.body,'base64');
     }else{
      if(typeof input.base64!=='string'||input.base64.length>4_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))throw fail(400,'上传内容无效');
      bytes=Buffer.from(input.base64,'base64');
     }
     if(bytes.length!==item.size||digest(bytes)!==item.sha256)throw fail(400,'文件与已登记版本不一致，请恢复原发送文件');
     try{validateFile({...item,bytes});}catch(error){throw fail(400,error.message);}
    }else if(!item.mediaId)throw fail(409,'请先完成文件上传');
    const data=clone(row.data),index=data.items.findIndex(x=>x.kind===input.kind),attempt=randomUUID();
    Object.assign(data.items[index],{status:action==='send'?'sending':'uploading',message:action==='send'?'正在发送':'正在上传',startedAt:now(),attempt});data.updated=stamp();
    const claimed=await db().write({...row,data},row.version,{sending:action==='send'});
    if(!claimed)return reply(200,publicReceipt(await db().get(row.id)));
    row=claimed;
    const result=action==='upload'?await uploadFile(env.WECOM_WEBHOOK,{...item,bytes},{fetchImpl,timeout:1250}):await sendUploadedFile(env.WECOM_WEBHOOK,item.mediaId,{fetchImpl,timeout:1100});
    const updated=clone(row.data),current=updated.items[index];
    if(current.attempt!==attempt)throw fail(409,'发送状态已更新，请查询结果');
    if(result.status==='uploaded')Object.assign(current,{status:'pending',mediaId:result.mediaId,uploadedAt:now(),message:'已上传，等待发送'});
    else Object.assign(current,result,{time:stamp()});
    if(result.status==='unknown')for(const other of updated.items)if(other.status==='pending')Object.assign(other,{status:'failed',message:'同批其他文件结果待核实，本文件尚未发送',time:stamp()});
    // Retain pre-send state if saving the reply fails. A later GET converts it to unknown.
    updated.updated=stamp();row=await db().write({...row,data:updated},row.version)||await db().get(row.id);
    return reply(200,publicReceipt(row));
   }
   throw fail(404,'接口不存在');
  }catch(error){return reply(error.status||500,{error:error.status?error.message:'云端发送暂不可用，请查询原记录，勿重复新建'});}
 };
}
