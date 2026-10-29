import {readProspectus,storeOriginal} from './prospectus-files.js';
import {MATERIAL_FIELDS,directBatchErrors,materialReadErrors,createDirectMaterials} from './direct-materials.js';
import {escapeHTML as e} from './notice-model.js';

export function openDirectMaterials({state,role,showModal,closeModal,onCreated,onError}){
 if(role!=='manager')throw Error('请切换至产品经理');
 const entries=[];let busy=false,serial=0;
 showModal('直接制作发行材料',`<div id="directMaterialsIntake"><p class="direct-intro">上传每期产品说明书，读取产品信息后制作发行通知及海报。</p><label class="direct-title">材料名称（选填）<input id="directMaterialTitle" maxlength="160" placeholder="留空时自动命名"></label><label class="source-upload direct-upload"><strong>选择产品说明书</strong><input id="directMaterialFiles" type="file" accept=".pdf,.docx,.doc" multiple><p>支持多文件上传 · PDF／Word（.docx） · 每次最多12份</p><small>每份文件对应一只产品；文件在当前浏览器读取并保存。</small></label><div id="directReadProgress" role="status"></div><div id="directMaterialEntries"></div><div id="directMaterialErrors" class="source-issues" role="alert"></div></div>`,
 '<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn primary" id="createDirectMaterials" disabled>生成发行材料</button>',true);
 const root=document.querySelector('#directMaterialsIntake'),host=root.querySelector('#directMaterialEntries'),progress=root.querySelector('#directReadProgress'),errors=root.querySelector('#directMaterialErrors'),create=document.querySelector('#createDirectMaterials');
 const alive=()=>root.isConnected&&root.closest('dialog')?.open;
 const errorText=message=>{errors.textContent=message;};
 const input=(entry,index,key,label)=>{
  const value=entry.fields[key]??'',type=['start','end','value','maturity'].includes(key)?'date':['tenor','low','mid','high'].includes(key)?'number':'text';
  const choices=key==='family'?['智信','慧信']:key==='currency'?['人民币','美元']:null;
  const options=choices?`<option value="">请选择</option>${choices.map(v=>`<option value="${e(v)}" ${v===value?'selected':''}>${e(v)}</option>`).join('')}`:'';
  const control=choices?`<select data-direct-field="${key}" data-entry="${index}">${options}</select>`:`<input type="${type}" data-direct-field="${key}" data-entry="${index}" value="${e(value)}" ${key==='underlying'?'placeholder="未识别时请按说明书补充"':''} ${type==='number'?'min="0" step="any"':''}>`;
  return `<label class="direct-field ${key==='name'?'direct-name':''}">${label}${['family','low','mid','high'].includes(key)?'':' <span class="required">*</span>'}${control}</label>`;
 };
 function renderEntries(){
  host.innerHTML=entries.map((entry,index)=>{
   const result=entry.result,blocking=materialReadErrors(result);
   return `<section class="direct-entry"><div class="direct-entry-head"><div><strong>${index+1}. ${e(entry.fields.name||result.file?.name||'产品说明书')}</strong><small>${e(result.file?.name)}</small></div><button type="button" class="text-button" data-direct-remove="${index}" ${busy?'disabled':''}>移除</button></div>${blocking.length?`<div class="source-issues">${blocking.map(e).join('<br>')}</div>`:`<div class="direct-fields">${MATERIAL_FIELDS.map(([key,label])=>input(entry,index,key,label)).join('')}</div><p class="direct-rate-hint">按百分数填写收益率；不适用档位留空。产品系列未列明时可留空。</p><details class="direct-evidence"><summary>查看读取提示及原文依据</summary>${[...(result.errors||[]),...(result.warnings||[])].filter(message=>!/计划募集金额|金市最终产品额度/.test(message)).map(message=>`<p>${e(message)}</p>`).join('')}<dl>${MATERIAL_FIELDS.filter(([key])=>result.evidence?.[key]).map(([key,label])=>`<dt>${label} · ${result.evidence[key].page?'第'+result.evidence[key].page+'页':'Word正文'}</dt><dd>${e(result.evidence[key].quote)}</dd>`).join('')}</dl></details>`}<div class="direct-entry-foot"><button type="button" class="text-button" data-direct-original="${index}">查看原件</button></div></section>`;
  }).join('');
  create.disabled=busy||!entries.length;root.querySelector('#directMaterialFiles').disabled=busy;
 }
 root.oninput=event=>{const input=event.target;if(input.dataset.directField){entries[Number(input.dataset.entry)].fields[input.dataset.directField]=input.value;errorText('');}};
 root.onchange=async event=>{
  if(event.target.dataset.directField){entries[Number(event.target.dataset.entry)].fields[event.target.dataset.directField]=event.target.value;errorText('');return;}
  if(event.target.id!=='directMaterialFiles'||busy)return;
  const files=[...event.target.files];event.target.value='';
  if(entries.length+files.length>12){errorText('每次最多12份产品说明书，请分批制作。');return;}
  busy=true;const current=++serial;renderEntries();errorText('');
  try{
   for(const [index,file]of files.entries()){
    progress.textContent=`正在读取 ${index+1}／${files.length}：${file.name}`;
    let result;try{result=await readProspectus(file);}catch(error){result={file,error:error.message,fields:{},errors:[],warnings:[]};}
    if(current!==serial||!alive())return;
    entries.push({result,fields:{...result.fields}});
   }
   progress.textContent=`已读取 ${entries.length} 份说明书。可补充或修改以下产品信息。`;
  }finally{busy=false;if(alive())renderEntries();}
 };
 root.onclick=event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-direct-remove')){entries.splice(Number(button.dataset.directRemove),1);renderEntries();errorText('');progress.textContent=entries.length?`当前 ${entries.length} 份说明书`:'';}
  if(button.hasAttribute('data-direct-original')){const file=entries[Number(button.dataset.directOriginal)].result.file,url=URL.createObjectURL(file);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}
 };
 create.onclick=async()=>{
  if(busy||!alive())return;
  const messages=directBatchErrors(entries);if(messages.length){errorText(messages.join('；'));errors.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
  busy=true;create.disabled=true;create.textContent='正在生成';errorText('');
  try{
   for(const entry of entries){entry.source=await storeOriginal(entry.result);if(!alive())return;}
   const issue=createDirectMaterials(state,entries,{title:root.querySelector('#directMaterialTitle').value,role});
   closeModal();onCreated(issue);
  }catch(error){if(alive()){errorText(error.message);onError(error.message);}}
  finally{busy=false;if(alive()){create.disabled=false;create.textContent='生成发行材料';}}
 };
}
