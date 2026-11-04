import {CLOUD_WECOM} from './wecom-config.js';
const OWNER_KEY='deposit-wecom-cloud-owner-v1';
let database;
function db(){return database||(database=new Promise((resolve,reject)=>{const request=indexedDB.open('deposit-wecom-files',1);request.onupgradeneeded=()=>request.result.createObjectStore('packs',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('未能打开待发送文件存储'));}));}
async function savedPack(id){const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction('packs').objectStore('packs').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('未能读取待发送文件'));});}
async function savePack(pack){const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('packs','readwrite');tx.objectStore('packs').put(pack);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('待发送文件未能保存，尚未提交云端发送，请检查浏览器存储空间'));});return pack;}
export function cloudOwner(){let value=localStorage.getItem(OWNER_KEY);if(!/^[a-f0-9-]{36}$/.test(value||'')){value=crypto.randomUUID();localStorage.setItem(OWNER_KEY,value);}return value;}
export async function cloudRequest(path,{method='GET',body,timeout=12000,fetchImpl=fetch}={}){
 let response;
 const binary=body instanceof Blob;
 try{response=await fetchImpl(CLOUD_WECOM.endpoint+path,{method,...(body?{body:binary?body:JSON.stringify(body)}:{}),headers:{'X-Wecom-Owner':cloudOwner(),...(body?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeout)});}
 catch{throw Error('未能取得云端结果，请稍后查询原发送记录，勿重复新建发送');}
 let result;try{result=await response.json();}catch{throw Error('云端结果无法读取，请查询原发送记录');}
 if(!response.ok)throw Object.assign(Error(result.error||`云端请求未完成（HTTP ${response.status}），请查询原发送记录`),{status:response.status});return result;
}
export async function submitCloudJob(meta,files,{read=savedPack,write=savePack,request=cloudRequest}={}){
 let pack=await read(meta.id);
 if(pack&&pack.revision!==meta.revision)throw Error('缓存文件与本次材料版本不一致');
 if(!pack)pack=await write({id:meta.id,revision:meta.revision,files:files.map(({kind,name,sha256,blob})=>({kind,name,sha256,blob}))});
 const result=await request('/api/wecom/jobs',{method:'POST',body:{...meta,files:pack.files.map(({kind,name,sha256,blob})=>({kind,name,sha256,size:blob.size}))}});
 if(result.id!==meta.id&&!await read(result.id))await write({...pack,id:result.id});
 return result;
}
export async function advanceCloudJob(id,{read=savedPack,request=cloudRequest}={}){
 const receipt=await request('/api/wecom/jobs/'+encodeURIComponent(id));
 if(receipt.status!=='pending'||!receipt.next)return receipt;
 const {action,kind}=receipt.next;
 if(action==='send')return request('/api/wecom/jobs/'+encodeURIComponent(id)+'/send',{method:'POST',body:{kind}});
 if(action!=='upload')throw Error('云端发送步骤无法识别，请查询记录');
 const pack=await read(id),file=pack?.files.find(x=>x.kind===kind);
 if(!file)throw Error('当前浏览器未保存这份待发文件。已完成步骤不会重发，请回到原发送浏览器继续处理');
 // CloudBase permits 6MB binary requests; JSON/text requests are limited to 100KB.
 return request('/api/wecom/jobs/'+encodeURIComponent(id)+'/upload/'+kind,{method:'POST',body:file.blob});
}
