import {ASSISTANT_CONFIG} from './assistant-config.js';
let client;
export function modelReady(){return ASSISTANT_CONFIG.enabled&&!!ASSISTANT_CONFIG.publishableKey;}
export async function modelAnswer(messages,{signal,onProgress=()=>{}}={}){
 if(!modelReady())throw Error('模型尚未连接。说明书已可在本地整理，接通模型后即可提问');
 if(signal?.aborted)throw new DOMException('已停止','AbortError');
 try{
  if(!client){
   const {default:cloudbase}=await import('./vendor/cloudbase.mjs');
   const app=cloudbase.init({env:ASSISTANT_CONFIG.env,accessKey:ASSISTANT_CONFIG.publishableKey});
   client={app,model:app.ai().createModel('cloudbase')};
  }
  const login=await client.app.auth().getLoginState();if(!login)await client.app.auth().signInAnonymously();
  if(signal?.aborted)throw new DOMException('已停止','AbortError');
  const stream=await client.model.streamText({model:ASSISTANT_CONFIG.model,messages,max_tokens:2600,temperature:0.1});
  let raw='';
  for await(const piece of stream.textStream){if(signal?.aborted)throw new DOMException('已停止','AbortError');raw+=piece;if(raw.length>22000)throw Error('OUTPUT_LIMIT');onProgress(raw.length);}
  return {raw,model:ASSISTANT_CONFIG.model,usage:await stream.usage};
 }catch(error){
  if(signal?.aborted||error.name==='AbortError')throw new DOMException('已停止','AbortError');
  throw Error('模型暂未完成回答，请检查模型权限、可用额度或网络后重试。资料和聊天记录仍保留在本机');
 }
}
