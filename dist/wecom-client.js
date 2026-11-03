const CONNECTION_KEY='deposit-wecom-connection-v1';
export const DEFAULT_RELAY='http://127.0.0.1:4288';
export function normalizeRelay(value=DEFAULT_RELAY){
 let url;try{url=new URL(String(value).trim());}catch{throw Error('请填写本机发送服务地址');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('请使用本机地址，例如 http://127.0.0.1:4288');
 return url.origin;
}
export function connection(){try{const value=JSON.parse(sessionStorage.getItem(CONNECTION_KEY));return value?.token?{endpoint:normalizeRelay(value.endpoint),token:value.token}:null;}catch{return null;}}
export function saveConnection(endpoint,token){const value={endpoint:normalizeRelay(endpoint),token:String(token).trim()};if(!/^[a-f0-9]{64}$/.test(value.token))throw Error('连接码格式不正确，请从本机设置页面复制');sessionStorage.setItem(CONNECTION_KEY,JSON.stringify(value));return value;}
export function clearConnection(){sessionStorage.removeItem(CONNECTION_KEY);}
export async function relayRequest(path,{method='GET',body,settings=connection(),timeout=30000}={}){
 if(!settings?.token)throw Error('请先连接本机企微发送服务');
 let response;try{response=await fetch(normalizeRelay(settings.endpoint)+path,{method,body,headers:{Authorization:'Bearer '+settings.token,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeout)});}catch{throw Error('未能连接本机发送服务。请保持服务开启，并允许浏览器访问本地网络；已提交的发送请先查询结果，勿重复新建。');}
 let data;try{data=await response.json();}catch{throw Error('发送服务返回了无法读取的结果，请先查询发送记录');}
 if(!response.ok)throw Object.assign(Error(data.error||'发送服务暂不可用'),{status:response.status});return data;
}
export const relayTargets=settings=>relayRequest('/api/wecom/targets',{settings});
export const relayJob=id=>relayRequest('/api/wecom/jobs/'+encodeURIComponent(id));
export const resolveRelayJob=(id,data)=>relayRequest('/api/wecom/jobs/'+encodeURIComponent(id)+'/resolve',{method:'POST',body:JSON.stringify(data)});
export async function submitRelayJob(meta,files){const form=new FormData();form.set('metadata',JSON.stringify(meta));files.forEach((f,i)=>form.set('file'+i,f.blob,f.name));return relayRequest('/api/wecom/jobs',{method:'POST',body:form});}
export async function sha256(value){const buffer=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');}
