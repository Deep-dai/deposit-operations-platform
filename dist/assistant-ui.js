import {returnedCatalog,matchContextDocuments,escapeHTML as e,MAX_CHAT_PRODUCTS,retrieveEvidence,buildMessages,verifyAnswer,selectedSignature} from './assistant-core.js';
import {listDocuments,saveDocument,readConversations,saveConversation} from './assistant-storage.js';
import {readProspectus,originalFile} from './prospectus-files.js';
import {modelAnswer,modelReady} from './assistant-client.js';
import {ASSISTANT_CONFIG} from './assistant-config.js';
const QUESTIONS=['这支产品的主要信息是什么？','获得最高档收益需要满足什么条件？','说明书列出了哪些主要风险？','自动滚存如何退出，下一期利率是否确定？'];
const glyph=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 4h14v13H9l-4 3V4Z"/><path d="M9 8h6M9 12h4"/></svg>`;
let teardown=()=>{};
export function disposeAssistant(){teardown();teardown=()=>{};}
export function assistantPage(){return `<div class="page-title assistant-title"><div><h1>产品智能助手</h1><p class="subtitle">围绕产品说明书提问，每一项解释都有据可查。</p></div><div class="title-actions"><span class="assistant-model ${modelReady()?'connected':''}"><i></i>${modelReady()?'腾讯混元已配置':'模型待接通'}</span><label class="btn" for="assistantUpload">添加说明书<input id="assistantUpload" type="file" accept=".pdf,.docx" multiple hidden></label></div></div><div id="assistantWorkspace" class="assistant-workspace"><aside class="assistant-library"><div class="assistant-pane-heading"><h2>产品资料</h2><span id="assistantLibraryCount" class="count">0</span></div><p class="assistant-caption">选择1至3只产品，限定本次问答范围。</p><input id="assistantSearch" aria-label="搜索产品" placeholder="搜索产品名称或代码"><div class="assistant-library-tabs" aria-label="资料范围"><button type="button" id="assistantReadyTab" aria-pressed="true">正文已就绪</button><button type="button" id="assistantPendingTab" aria-pressed="false">待补充原件</button></div><div id="assistantProducts" class="assistant-product-list"><p class="assistant-caption">正在读取产品资料…</p></div><div class="assistant-library-foot">说明书与对话保存在当前浏览器。<br>添加资料不会修改产品申报。</div></aside><section class="assistant-chat" aria-label="产品问答"><div class="assistant-chat-heading"><div><strong>说明书问答</strong><p id="assistantScope">请选择产品</p></div><button class="text-button" id="assistantNewChat">新建对话</button></div><div id="assistantMessages" class="assistant-messages" role="log" aria-label="对话记录"></div><div class="assistant-composer"><div id="assistantStatus" class="assistant-chat-status" role="status"></div><label class="assistant-consent"><input type="checkbox" id="assistantConsent">同意将本次问题及相关条款发送至腾讯云模型处理；不上传原件。</label><form id="assistantQuestionForm"><textarea id="assistantQuestion" aria-label="输入产品问题" maxlength="1000" rows="3" placeholder="例如：这支产品在什么条件下获得最高档收益？"></textarea><div class="assistant-compose-actions"><small>回答用于辅助理解，关键条款请核对原件。</small><button class="btn" type="button" id="assistantStop" hidden>停止等待</button><button class="btn primary" id="assistantAsk" type="submit">发送问题</button></div></form></div></section><aside class="assistant-evidence"><div class="assistant-pane-heading"><h2>回答依据</h2><span id="assistantEvidenceCount" class="count">0</span></div><div id="assistantEvidenceBody" class="assistant-evidence-body"><div class="assistant-source-empty">${glyph}<strong>随回答展示原文</strong><p>查看引用条款、产品期次与出处，点击可打开说明书。</p></div></div></aside></div>`;}
export function mountAssistant({root,state,contextId='',toast,showModal,closeModal}){
 disposeAssistant();let alive=true,documents=[],catalog=returnedCatalog(state),selected=[],turns=[],controller=null,busy=false,readBusy=false,search='',libraryMode='ready',activeCitationTurn=null;
 const $=s=>root.querySelector(s),status=$('#assistantStatus'),question=$('#assistantQuestion'),ask=$('#assistantAsk'),stop=$('#assistantStop');
 const urls=new Set();
 teardown=()=>{alive=false;controller?.abort();for(const url of urls)URL.revokeObjectURL(url);};
 const picked=()=>selected.map(hash=>documents.find(d=>d.hash===hash)).filter(Boolean);
 const signature=()=>selectedSignature(picked());
 function tell(message){if(alive)status.textContent=message;}
 function setBusy(value){busy=value;ask.disabled=value||readBusy||!selected.length||!modelReady();stop.hidden=!value;question.disabled=value;root.querySelectorAll('[data-assistant-select],[data-assistant-load]').forEach(x=>x.disabled=value);$('#assistantUpload').disabled=value||readBusy;$('#assistantNewChat').disabled=value;}
 function restore(){turns=readConversations()[signature()]?.turns||[];activeCitationTurn=null;renderChat();renderEvidence();}
 function setSelected(hash){
  if(busy)return;
  if(selected.includes(hash))selected=selected.filter(id=>id!==hash);else{if(selected.length>=MAX_CHAT_PRODUCTS){toast('一次最多选择3只产品',true);return;}selected.push(hash);}
  restore();renderProducts();scope();tell('');
 }
 function scope(){const docs=picked();$('#assistantScope').textContent=docs.length?docs.map(d=>d.code||d.name).join('、'):'请选择产品';setBusy(busy);}
 function renderProducts(){
  const docHashes=new Set(documents.map(d=>d.hash)),indexed=documents.map(d=>({id:d.hash,name:d.name,code:d.code,indexed:true,fileName:d.fileName})),missing=[];
  const seen=new Set();for(const p of catalog){const key=p.source?.id||p.id;if(docHashes.has(key)||seen.has(key))continue;seen.add(key);missing.push({...p,indexed:false});}
  $('#assistantReadyTab').setAttribute('aria-pressed',libraryMode==='ready');$('#assistantPendingTab').setAttribute('aria-pressed',libraryMode==='pending');
  const items=(libraryMode==='ready'?indexed:missing).filter(p=>(p.name+' '+p.code).toLowerCase().includes(search));$('#assistantLibraryCount').textContent=documents.length;
  $('#assistantProducts').innerHTML=items.length?items.map(p=>`<article class="assistant-product ${selected.includes(p.id)?'selected':''}">${p.indexed?`<button type="button" class="assistant-product-select" data-assistant-select="${e(p.id)}" aria-pressed="${selected.includes(p.id)}"><span class="assistant-check">${selected.includes(p.id)?'✓':''}</span><span><strong>${e(p.name)}</strong><small>${e(p.code||'代码未识别')}</small><small class="assistant-document-file">${e(p.fileName)}</small></span></button><div class="assistant-product-meta"><span class="assistant-ready">正文已就绪</span><button class="text-button" data-assistant-open="${e(p.id)}">查看原件</button></div>`:`<div class="assistant-product-missing"><strong>${e(p.name)}</strong><small>${e(p.code||'代码待补充')}</small><div><span>尚未读取正文</span>${p.source?.id?`<button class="text-button" data-assistant-load="${e(p.id)}">读取回传原件</button>`:'<span>请添加说明书</span>'}</div></div>`}</article>`).join(''):'<div class="assistant-list-empty">暂无匹配资料。<br>可添加已回传的产品说明书。</div>';
  setBusy(busy);
 }
 function welcome(){return `<div class="assistant-welcome"><div class="assistant-symbol">${glyph}</div><h2>把产品条款，问清楚</h2><p>${selected.length?'已选定问答范围。可从下面的问题开始，或输入你关心的条款。':'先选择左侧产品，或添加一份产品说明书。'}</p><div class="assistant-suggestions">${QUESTIONS.map(q=>`<button type="button" data-assistant-prompt="${e(q)}">${e(q)}<span>↗</span></button>`).join('')}</div></div>`;}
 function renderChat(){
  $('#assistantMessages').innerHTML=turns.length?turns.map((t,index)=>`<div class="assistant-turn"><div class="assistant-user"><span>我的问题</span><p>${e(t.question)}</p></div><div class="assistant-response"><div class="assistant-response-heading">${glyph}<strong>产品智能助手</strong><small>腾讯混元</small></div><div class="assistant-answer">${e(t.answer)}</div>${t.notFound?'<p class="assistant-answer-warning">当前提供的条款未能回答此问题，请补充资料或核对原件。</p>':''}<div class="assistant-answer-tools"><button type="button" class="text-button" data-assistant-evidence="${index}">查看 ${t.citations.length} 项原文依据</button><button type="button" class="text-button" data-assistant-copy="${index}">复制回答</button><span>引用已匹配原文 · 仍需核对解释</span></div></div></div>`).join(''):welcome();
  const last=$('#assistantMessages').lastElementChild;if(last&&turns.length)last.scrollIntoView({block:'nearest'});
 }
 function renderEvidence(index=activeCitationTurn??turns.length-1){
  const refs=turns[index]?.citations||[];$('#assistantEvidenceCount').textContent=refs.length;
  $('#assistantEvidenceBody').innerHTML=refs.length?refs.map((ref,n)=>`<section class="assistant-citation"><div class="assistant-citation-head"><b>${n+1}</b><span>${e(ref.code||ref.name)}</span></div><strong>${e(ref.name)}</strong><small>${e(ref.fileName)} · ${ref.page?`第${ref.page}页`:`正文片段${ref.paragraph||1}`}</small><blockquote>${e(ref.quote)}</blockquote><button class="text-button" data-assistant-source="${e(ref.documentId)}" data-assistant-page="${ref.page||''}">查看原件与上下文 ↗</button></section>`).join(''):`<div class="assistant-source-empty">${glyph}<strong>${turns.length?'本次没有可引用条款':'随回答展示原文'}</strong><p>回答后可查看引用条款、产品期次和原件。未找到依据时会明确提示。</p></div>`;
 }
 async function openDocument(hash,page){
  const d=documents.find(x=>x.hash===hash);if(!d?.blob)throw Error('当前浏览器未保存该原件，请补充说明书');
  const url=URL.createObjectURL(d.blob);urls.add(url);const target=d.fileName.toLowerCase().endsWith('.pdf')&&page?`${url}#page=${Number(page)}`:url;
  const a=document.createElement('a');a.href=target;a.target='_blank';a.rel='noopener';if(!/\.pdf$/i.test(d.fileName))a.download=d.fileName;a.click();
 }
 async function indexResult(result,{expectedCode='',expectedName=''}={}){
  if(result.errors?.some(x=>/多个产品名称|代码不一致/.test(x)))throw Error('说明书包含冲突的产品名称或代码，请先核对原件');
  if(expectedCode&&result.fields.marketNumber!==expectedCode)throw Error('原件产品代码与当前产品不一致，未关联，请核对文件');
  const doc={hash:result.hash,name:result.fields.name||expectedName||result.file.name.replace(/\.(pdf|docx)$/i,''),code:result.fields.marketNumber||expectedCode,fileName:result.file.name,blob:result.file,pages:result.pages,fields:result.fields,warnings:result.warnings||[],updated:new Date().toISOString()};
  await saveDocument(doc);if(!alive)return;documents=documents.filter(x=>x.hash!==doc.hash);documents.unshift(doc);if(!selected.includes(doc.hash)&&selected.length<MAX_CHAT_PRODUCTS)selected.push(doc.hash);return doc;
 }
 async function upload(files){
  if(busy||readBusy)return;if(files.length>20)throw Error('每次最多添加20份说明书');
  readBusy=true;setBusy(false);const failures=[];
  try{for(let i=0;i<files.length;i++){
   tell(`正在本地读取 ${i+1}／${files.length}：${files[i].name}`);
   try{const result=await readProspectus(files[i]);if(!alive)return;await indexResult(result);}catch(error){failures.push(`${files[i].name}：${error.message}`);}
  }
  if(!alive)return;libraryMode='ready';restore();renderProducts();scope();tell(failures.length?failures.join('；'):`已在本地整理${files.length}份说明书，尚未发送至模型。`);
  }finally{readBusy=false;if(alive){setBusy(false);$('#assistantUpload').value='';}}
 }
 $('#assistantUpload').onchange=event=>void upload([...event.target.files]).catch(error=>tell(error.message));
 $('#assistantReadyTab').onclick=()=>{libraryMode='ready';renderProducts();};
 $('#assistantPendingTab').onclick=()=>{libraryMode='pending';renderProducts();};
 $('#assistantSearch').oninput=event=>{search=event.target.value.trim().toLowerCase();renderProducts();};
 $('#assistantNewChat').onclick=()=>{
  if(busy)return;showModal('新建对话','新对话将清空当前产品范围内的聊天记录，说明书原件和产品业务记录不受影响。','<button class="btn" data-action="close-modal">取消</button><button class="btn primary" id="assistantConfirmNew">新建对话</button>');
  document.querySelector('#assistantConfirmNew').onclick=()=>{turns=[];saveConversation(signature(),turns);renderChat();renderEvidence();closeModal();};
 };
 stop.onclick=()=>{controller?.abort();tell('已停止等待，未完成的回答不会保存；云端已开始的请求仍可能消耗额度。');setBusy(false);};
 root.onclick=async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try{
   if(button.dataset.assistantSelect)setSelected(button.dataset.assistantSelect);
   else if(button.dataset.assistantPrompt){question.value=button.dataset.assistantPrompt;question.focus();}
   else if(button.dataset.assistantEvidence!==undefined){activeCitationTurn=Number(button.dataset.assistantEvidence);renderEvidence(activeCitationTurn);}
   else if(button.dataset.assistantOpen)await openDocument(button.dataset.assistantOpen);
   else if(button.dataset.assistantSource)await openDocument(button.dataset.assistantSource,button.dataset.assistantPage);
   else if(button.dataset.assistantCopy!==undefined){await navigator.clipboard.writeText(turns[Number(button.dataset.assistantCopy)].answer);toast('回答已复制');}
   else if(button.dataset.assistantLoad){
    const p=catalog.find(x=>x.id===button.dataset.assistantLoad);readBusy=true;setBusy(false);tell('正在从本地回传原件整理正文…');
    try{const source=await originalFile(p.source.id);if(!source)throw Error('当前浏览器没有这份原件，请使用右上角“添加说明书”补充');const file=source.blob instanceof File?source.blob:new File([source.blob],source.name);await indexResult(await readProspectus(file),{expectedCode:p.code,expectedName:p.name});if(alive){restore();renderProducts();scope();tell('正文已就绪，尚未发送至模型。');}}
    finally{readBusy=false;if(alive)setBusy(false);}
   }
  }catch(error){tell(error.message);}
 };
 $('#assistantQuestionForm').onsubmit=async event=>{
  event.preventDefault();if(busy||readBusy)return;
  if(!$('#assistantConsent').checked){tell('请先确认本次问题及相关条款可发送至腾讯云模型。');return;}
  const q=question.value.trim(),docs=picked();let evidence;
  try{evidence=retrieveEvidence(docs,q);}catch(error){tell(error.message);return;}
  controller=new AbortController();const requestController=controller;setBusy(true);tell('正在阅读相关条款…');
  try{
   const request=buildMessages({question:q,documents:docs,evidence,history:turns});
   const response=await modelAnswer(request,{signal:requestController.signal,onProgress:length=>{if(alive&&!requestController.signal.aborted)tell(`正在整理回答，已接收${length}字…`);}});
   if(!alive||requestController.signal.aborted)return;
   const answer=verifyAnswer(response.raw,evidence),turn={question:q,...answer,model:response.model,time:new Date().toISOString()};turns.push(turn);question.value='';
   try{saveConversation(signature(),turns);}catch(error){toast(error.message,true);}
   renderChat();renderEvidence();tell(answer.notFound?'当前条款未明确说明，建议核对或补充原件。':'引用已匹配原文。请结合原件核对回答中的解释。');
  }catch(error){if(alive&&!requestController.signal.aborted)tell(error.message);}
  finally{if(alive&&controller===requestController)setBusy(false);}
 };
 void (async()=>{try{
  documents=await listDocuments();if(!alive)return;
  const context=state.issues.find(x=>x.id===contextId),wanted=context?catalog.filter(x=>context.productIds.includes(x.id)):catalog.filter(x=>x.id===contextId);
  selected=matchContextDocuments(documents,wanted).slice(0,MAX_CHAT_PRODUCTS).map(d=>d.hash);
  if(!selected.length&&documents.length&&!contextId)selected=[documents[0].hash];restore();renderProducts();scope();
  if(contextId&&!selected.length)tell('当前产品或批次尚未关联本地说明书正文，请添加对应原件后明确选择产品。');
  else if(!modelReady())tell('模型尚未接通，可先添加说明书并查看产品问答范围。');
 }catch(error){tell(error.message);}})();
 return teardown;
}
