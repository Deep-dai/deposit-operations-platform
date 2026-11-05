import {readProspectus,storeOriginal} from './prospectus-files.js';
import {MATERIAL_FIELDS,MAX_MATERIAL_PRODUCTS,directBatchErrors,materialReadErrors,createDirectMaterials} from './direct-materials.js';
import {escapeHTML as e} from './notice-model.js';
const fieldLabel=(entry,key,label)=>entry.fields.rateMode==='range'&&key==='low'?'最低年化收益率（%）':entry.fields.rateMode==='range'&&key==='high'?'最高年化收益率（%）':label;

export function openDirectMaterials({state,role,showModal,closeModal,onCreated,onError}){
 if(role!=='manager')throw Error('请切换至产品经理');
 const entries=[];let busy=false,serial=0,drag=null,lastMove=null;
 showModal('直接制作发行材料',`<div id="directMaterialsIntake"><p class="direct-intro">上传每期产品说明书，读取产品信息后制作发行通知及海报。</p><label class="direct-title">材料名称（选填）<input id="directMaterialTitle" maxlength="160" placeholder="留空时自动命名"></label><label class="source-upload direct-upload" id="directDropZone"><span class="btn primary">批量上传说明书</span><input id="directMaterialFiles" aria-label="批量上传说明书" type="file" accept=".pdf,.docx,.doc" multiple><p>可一次选择多个文件，也可分次追加或拖入文件；每批最多${MAX_MATERIAL_PRODUCTS}份。</p><small>支持PDF／Word（.docx），每份对应一只产品；文件在当前浏览器读取并保存。</small></label><div id="directReadProgress" role="status"></div><div id="directMaterialOrder"></div><div id="directMaterialEntries"></div><div id="directMaterialErrors" class="source-issues" role="alert"></div></div>`,
 '<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn primary" id="createDirectMaterials" disabled>生成发行材料</button>',true);
 const root=document.querySelector('#directMaterialsIntake'),host=root.querySelector('#directMaterialEntries'),order=root.querySelector('#directMaterialOrder'),dropZone=root.querySelector('#directDropZone'),progress=root.querySelector('#directReadProgress'),errors=root.querySelector('#directMaterialErrors'),create=document.querySelector('#createDirectMaterials');
 const dialog=root.closest('dialog'),modalHead=dialog.querySelector('.modal-head'),modalFooter=dialog.querySelector('.modal-footer');
 const alive=()=>root.isConnected&&dialog.open;
 const errorText=message=>{errors.textContent=message;};
 const entryName=entry=>entry.fields.name||entry.result.file?.name||'产品说明书';
 const input=(entry,index,key,label)=>{
  const value=entry.fields[key]??(key==='rateMode'?'tiers':''),type=['start','end','value','maturity'].includes(key)?'date':['tenor','low','mid','high'].includes(key)?'number':'text';
  label=fieldLabel(entry,key,label);
  const choices=key==='family'?['智信','慧信']:key==='currency'?['人民币','美元']:key==='rateMode'?[['tiers','固定档位'],['range','浮动区间']]:null;
  const options=choices?`${key==='rateMode'?'':'<option value="">请选择</option>'}${choices.map(item=>{const [v,label]=Array.isArray(item)?item:[item,item];return `<option value="${e(v)}" ${v===value?'selected':''}>${e(label)}</option>`;}).join('')}`:'';
  const control=choices?`<select data-direct-field="${key}" data-entry="${index}">${options}</select>`:`<input type="${type}" data-direct-field="${key}" data-entry="${index}" value="${e(value)}" ${key==='underlying'?'placeholder="未识别时请按说明书补充"':''} ${type==='number'?'min="0" step="any"':''}>`;
  return `<label class="direct-field ${key==='name'?'direct-name':''}">${label}${['family','rateMode','low','mid','high'].includes(key)?'':' <span class="required">*</span>'}${control}</label>`;
 };
 function renderOrder(){
  endDrag();
  const scroll=order.querySelector('.direct-order-list')?.scrollTop||0;
  const note=lastMove
   ?`${lastMove.entry.fields.marketNumber||entryName(lastMove.entry)} 已从第 ${lastMove.from+1} 位移到第 ${lastMove.to+1} 位。`
   :'拖动产品调整顺序。此顺序用于发行通知、附件清单及海报的初始排列。';
  order.innerHTML=entries.length?`<section class="direct-order"><h3>产品排列顺序 <span class="count">${entries.length}／${MAX_MATERIAL_PRODUCTS}</span></h3><p class="${lastMove?'direct-order-confirmation':''}" role="status">${e(note)}</p><ol class="direct-order-list">${entries.map((entry,index)=>`
   <li class="${lastMove?.entry===entry?'recent-move':''}" ${busy||entries.length<2?'':`data-direct-sort="${index}" tabindex="0" aria-label="第${index+1}只产品，可拖动或按方向键调整顺序"`}>
    <span class="direct-order-number">${index+1}</span>
    <div class="direct-order-name"><strong>${e(entryName(entry))}</strong><small>${e(entry.fields.marketNumber||'产品代码待核对')}</small></div>
    <button type="button" class="text-button direct-order-review" data-direct-jump="${index}">核对信息</button>
   </li>`).join('')}</ol></section>`:'';
  const list=order.querySelector('.direct-order-list');if(list)list.scrollTop=scroll;
 }
 function renderEntries(){
  renderOrder();
  host.innerHTML=entries.map((entry,index)=>{
   const result=entry.result,blocking=materialReadErrors(result);
   return `<section class="direct-entry" data-direct-card="${index}"><div class="direct-entry-head"><div><strong>${index+1}. ${e(entry.fields.name||result.file?.name||'产品说明书')}</strong><small>${e(result.file?.name)}</small></div><button type="button" class="text-button" data-direct-remove="${index}" ${busy?'disabled':''}>移除</button></div>${blocking.length?`<div class="source-issues">${blocking.map(e).join('<br>')}</div>`:`<div class="direct-fields">${MATERIAL_FIELDS.filter(([key])=>key!=='mid'||entry.fields.rateMode!=='range').map(([key,label])=>input(entry,index,key,label)).join('')}</div><p class="direct-rate-hint">${entry.fields.rateMode==='range'?'收益按说明书公式在最低、最高值之间浮动，中档不适用。':'按百分数填写收益率；不适用档位留空。'}产品系列未列明时可留空。</p><details class="direct-evidence"><summary>查看读取提示及原文依据</summary>${[...(result.errors||[]),...(result.warnings||[])].filter(message=>!/计划募集金额|金市最终产品额度/.test(message)).map(message=>`<p>${e(message)}</p>`).join('')}<dl>${MATERIAL_FIELDS.filter(([key])=>result.evidence?.[key]&&(key!=='mid'||entry.fields.rateMode!=='range')).map(([key,label])=>`<dt>${fieldLabel(entry,key,label)} · ${result.evidence[key].page?'第'+result.evidence[key].page+'页':'Word正文'}</dt><dd>${e(result.evidence[key].quote)}</dd>`).join('')}</dl></details>`}<div class="direct-entry-foot"><button type="button" class="text-button" data-direct-original="${index}">查看原件</button></div></section>`;
  }).join('');
  create.disabled=busy||!entries.length;root.querySelector('#directMaterialFiles').disabled=busy;
 }
 function moveEntry(from,to,{keyboard=false}={}){
  if(busy||from===to||to<0||to>=entries.length)return;
  const [entry]=entries.splice(from,1);
  entries.splice(to,0,entry);
  lastMove={entry,from,to};
  renderEntries();errorText('');
  const row=order.querySelector(`[data-direct-sort="${to}"]`);
  if(keyboard)row.focus({preventScroll:true});
  row.scrollIntoView({block:'nearest'});
 }
 function markDrop(current,row,after=false){
  if(row===current.marker&&after===current.after)return;
  current.marker?.classList.remove('drop-before','drop-after');
  current.marker=row;current.after=after;
  row?.classList.add(after?'drop-after':'drop-before');
 }
 function endDrag(){
  if(!drag)return;
  const current=drag;drag=null;
  cancelAnimationFrame(current.frame);
  markDrop(current,null);
  current.preview?.remove();
  current.row.classList.remove('sorting');
  current.list.classList.remove('drag-active');
  if(current.row.hasPointerCapture(current.id))current.row.releasePointerCapture(current.id);
 }
 function updateDrop(current,scroll){
  const bounds=current.list.getBoundingClientRect();
  const top=Math.max(bounds.top,modalHead.getBoundingClientRect().bottom,0);
  const bottom=Math.min(bounds.bottom,modalFooter.getBoundingClientRect().top,innerHeight);
  if(current.x<bounds.left||current.x>bounds.right||current.y<top||current.y>bottom){
   current.to=null;
   markDrop(current,null);
   return;
  }
  if(scroll){
   const edge=Math.min(42,(bottom-top)/3);
   if(current.y<top+edge)current.list.scrollTop-=Math.ceil((top+edge-current.y)/4);
   if(current.y>bottom-edge)current.list.scrollTop+=Math.ceil((current.y-bottom+edge)/4);
  }
  current.to=current.targets.findIndex(row=>{
   const rect=row.getBoundingClientRect();
   return current.y<rect.top+rect.height/2;
  });
  const after=current.to===-1;
  if(after)current.to=current.targets.length;
  markDrop(current,current.to===current.from?null:after?current.targets.at(-1):current.targets[current.to],after);
 }
 function showDragPreview(current){
  const preview=document.createElement('div');
  preview.className='direct-order-preview';
  preview.setAttribute('aria-hidden','true');
  const name=document.createElement('strong');
  name.textContent=entryName(entries[current.from]);
  const position=document.createElement('small');
  preview.append(name,position);
  dialog.append(preview);
  current.preview=preview;
  current.previewPosition=position;
 }
 function updateDragPreview(current){
  const {preview,previewPosition,from,to,x,y}=current;
  const position=to===null?'松手取消排序':to===from?`放回第 ${from+1} 位`:`第 ${from+1} 位 → 第 ${to+1} 位`;
  if(previewPosition.textContent!==position)previewPosition.textContent=position;
  const left=Math.max(8,Math.min(x+14,innerWidth-preview.offsetWidth-8));
  const below=y+16;
  const top=below+preview.offsetHeight<innerHeight-8?below:Math.max(8,y-preview.offsetHeight-12);
  preview.style.transform=`translate3d(${left}px,${top}px,0)`;
 }
 function trackDrag(){
  if(!drag||!alive()){endDrag();return;}
  updateDrop(drag,true);
  updateDragPreview(drag);
  drag.frame=requestAnimationFrame(trackDrag);
 }
 order.onpointerdown=event=>{
  const row=event.target.closest('[data-direct-sort]');
  if(!row||event.target.closest('button')||busy||drag||!event.isPrimary||event.button!==0)return;
  const list=row.parentElement;
  drag={id:event.pointerId,row,list,from:Number(row.dataset.directSort),to:null,
   targets:[...list.children].filter(item=>item!==row),startX:event.clientX,startY:event.clientY};
  row.setPointerCapture(event.pointerId);
 };
 order.onpointermove=event=>{
  if(!drag||event.pointerId!==drag.id)return;
  drag.x=event.clientX;drag.y=event.clientY;
  if(drag.active||Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<5)return;
  drag.active=true;
  drag.row.classList.add('sorting');
  drag.list.classList.add('drag-active');
  showDragPreview(drag);
  trackDrag();
 };
 order.onpointerup=event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const current=drag;
  if(current.active){
   current.x=event.clientX;current.y=event.clientY;
   updateDrop(current,false);
  }
  endDrag();
  if(current.active&&current.to!==null)moveEntry(current.from,current.to);
 };
 order.onpointercancel=order.onlostpointercapture=event=>{if(event.pointerId===drag?.id)endDrag();};
 order.onkeydown=event=>{
  if(drag&&event.key==='Escape'){event.preventDefault();endDrag();return;}
  if(!event.target.matches('[data-direct-sort]')||busy||drag||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const index=Number(event.target.dataset.directSort);
  moveEntry(index,index+(event.key==='ArrowUp'?-1:1),{keyboard:true});
 };
 root.oninput=event=>{const input=event.target;if(input.dataset.directField){entries[Number(input.dataset.entry)].fields[input.dataset.directField]=input.value;if(['name','marketNumber'].includes(input.dataset.directField))renderOrder();errorText('');}};
 root.onchange=async event=>{
  if(event.target.dataset.directField){const entry=entries[Number(event.target.dataset.entry)];entry.fields[event.target.dataset.directField]=event.target.value;if(event.target.dataset.directField==='rateMode'){if(entry.fields.rateMode==='range')entry.fields.mid='';renderEntries();}errorText('');return;}
  if(event.target.id!=='directMaterialFiles'||busy)return;
  const files=[...event.target.files];event.target.value='';await readFiles(files);
 };
 async function readFiles(files){
  if(busy||!files.length||!alive())return;
  if(entries.length+files.length>MAX_MATERIAL_PRODUCTS){errorText(`每批最多${MAX_MATERIAL_PRODUCTS}份产品说明书，当前已有${entries.length}份。`);return;}
  busy=true;lastMove=null;const current=++serial;renderEntries();errorText('');
  try{
   for(const [index,file]of files.entries()){
    progress.textContent=`正在读取 ${index+1}／${files.length}：${file.name}`;
    let result;try{result=await readProspectus(file);}catch(error){result={file,error:error.message,fields:{},errors:[],warnings:[]};}
    if(current!==serial||!alive())return;
    entries.push({result,fields:{...result.fields}});
   }
   progress.textContent=`已读取 ${entries.length} 份说明书。可补充或修改以下产品信息。`;
  }finally{busy=false;if(alive())renderEntries();}
 }
 dropZone.ondragover=event=>{event.preventDefault();if(!busy)dropZone.classList.add('dragging');};
 dropZone.ondragleave=()=>dropZone.classList.remove('dragging');
 dropZone.ondrop=event=>{event.preventDefault();dropZone.classList.remove('dragging');void readFiles([...event.dataTransfer.files]);};
 root.onclick=event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-direct-jump')){const card=host.querySelector(`[data-direct-card="${Number(button.dataset.directJump)}"]`);card?.scrollIntoView({block:'start',behavior:'smooth'});card?.querySelector('input')?.focus({preventScroll:true});}
  if(button.hasAttribute('data-direct-remove')){entries.splice(Number(button.dataset.directRemove),1);lastMove=null;renderEntries();errorText('');progress.textContent=entries.length?`当前 ${entries.length} 份说明书`:'';}
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
