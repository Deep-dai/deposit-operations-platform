// The Webhook is consumed only by the local service. Never return it to a page.
export const MAX_FILE_BYTES=20_000_000;
export function webhookKey(value){
 let url;try{url=new URL(String(value).trim());}catch{throw Error('请填写完整的企微消息推送地址');}
 const key=url.searchParams.get('key');
 if(url.protocol!=='https:'||url.hostname!=='qyapi.weixin.qq.com'||url.port||url.username||url.password||url.hash||url.pathname!=='/cgi-bin/webhook/send'||url.searchParams.size!==1||!key||!/^[A-Za-z0-9_-]{10,200}$/.test(key))throw Error('请使用企微自定义消息推送提供的完整 Webhook 地址');
 return key;
}
export function validateFile(file){
 if(!file||!['notice','poster'].includes(file.kind)||typeof file.name!=='string'||file.name.length>180||/[\\/\r\n\0]/.test(file.name))throw Error('发送文件的信息不完整');
 if(!(file.bytes instanceof Uint8Array)||file.bytes.length<=5||file.bytes.length>MAX_FILE_BYTES)throw Error('每份发送文件须大于5字节，且不超过20MB');
 const b=file.bytes;
 if(file.kind==='notice'&&(!/\.docx$/i.test(file.name)||b[0]!==0x50||b[1]!==0x4b))throw Error('发行通知必须为有效的 Word（.docx）文件');
 if(file.kind==='poster'&&!(/\.png$/i.test(file.name)&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71||/\.jpe?g$/i.test(file.name)&&b[0]===255&&b[1]===216&&b[2]===255))throw Error('海报必须为PNG或JPEG图片');
 return file;
}
export async function uploadFile(webhook,file,{fetchImpl=fetch,timeout=20000}={}){
 const key=webhookKey(webhook);validateFile(file);
 const data=new FormData();data.append('media',new Blob([file.bytes],{type:file.kind==='notice'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':/\.png$/i.test(file.name)?'image/png':'image/jpeg'}),file.name);
 try{
  const response=await fetchImpl(`https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${encodeURIComponent(key)}&type=file`,{method:'POST',body:data,redirect:'error',signal:AbortSignal.timeout(timeout)});
  const result=await response.json();
  if(!response.ok||result.errcode!==0||typeof result.media_id!=='string'||!result.media_id.trim())return {status:'failed',message:`文件上传未成功${Number.isFinite(result.errcode)?`（企微错误码 ${result.errcode}）`:''}，尚未向群发送。`};
  return {status:'uploaded',mediaId:result.media_id};
 }catch{return {status:'failed',message:'未能完成文件上传，尚未向群发送。请检查网络后重试。'};}
}
export async function sendUploadedFile(webhook,mediaId,{fetchImpl=fetch,timeout=20000}={}){
 const key=webhookKey(webhook);
 try{
  const response=await fetchImpl(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msgtype:'file',file:{media_id:mediaId}}),redirect:'error',signal:AbortSignal.timeout(timeout)});
  const result=await response.json();
  if(response.ok&&result.errcode===0)return {status:'sent',message:'企微接口已确认发送成功'};
  if(response.ok&&Number.isFinite(result.errcode)&&result.errcode!==0)return {status:'failed',message:`企微未接受本次发送（错误码 ${result.errcode}），可检查配置后重试。`};
  return {status:'unknown',message:'企微接口未返回明确结果，请在群内核实，暂不自动重发。'};
 }catch{return {status:'unknown',message:'发送请求的结果未能确认，请在群内核实，暂不自动重发。'};}
}
