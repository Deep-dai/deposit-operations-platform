import {OP_TYPES,OP_COLUMNS,exampleRows,parseOperationGrid,operationErrors,operationGroups,briefStats,opNumber,opRate,autoSummary,createOperation,updateOperation,sendOperation,operationView,visibleOperations,recommendedProducts} from './operations-model.js';
import {renderOperation,operationBlob} from './operations-renderer.js';
import {BRANCHES,KNOWLEDGE_BASE,clone} from './core.js';
import {escapeHTML as e} from './notice-model.js';
const typeFor=route=>({planning:'plan',briefs:'brief',campaigns:'campaign'}[route]);
const sheetName={plan:'产品规划',brief:'经营报表',campaign:'到期收益'};
const symbol={plan:'▦',brief:'▥',campaign:'◈'};
const desc={plan:'汇总各类存款产品及销售条件，生成月度产品规划图。',brief:'读取分行经营报表，生成分组通报及可编辑的经营摘要。',campaign:'结合实际到期收益与本周重点产品，制作分行营销材料。'};
const escapeFile=name=>String(name).replace(/[\\/:*?"<>|]/g,'_');
export function operationsShortcuts(state,role,branch){return `<div class="ops-workbench-shortcuts">${Object.entries(OP_TYPES).map(([type,info])=>{const docs=visibleOperations(state,type,role,branch);return `<a href="#${info.route}"><span class="ops-workbench-icon">${symbol[type]}</span><div><strong>${info.name}</strong><small>${type==='plan'?'产品清单与月度销售安排':type==='brief'?'经营报表转通报材料':'到期表现与重点产品推荐'}</small></div><b>${docs.length}<small>份材料</small></b><span class="ops-shortcut-arrow">↗</span></a>`;}).join('')}</div>`;}
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=escapeFile(name);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function operationWorkbook(type,rows,{template=false,doc=null}={}){
 const X=globalThis.XLSX;if(!X)throw Error('表格组件正在加载，请稍后重试');
 const wb=X.utils.book_new(),columns=OP_COLUMNS[type];
 const sheet=X.utils.aoa_to_sheet([columns.map(c=>c[1]),...rows.map(r=>columns.map(([key])=>key==='highlight'?(r[key]?'是':''):r[key]??''))]);
 sheet['!cols']=columns.map(([key])=>({wch:['name','quota','note','purchase'].includes(key)?42:22}));X.utils.book_append_sheet(wb,sheet,sheetName[type]);
 const notes=template?[['填写说明'],['第一行表头请保留；一行一条记录，每次最多80条。'],['文字、数字均作为数据读取，不接受公式。'],['报价按完整文本填写，例如1.65%或按周定价；金额须带币种和单位。'],['经营报表金额按新建时选择的单位填写，完成率填108表示108%。'],['到期日填YYYY-MM-DD；收益率填1.45表示1.45%；未知实际收益档位留空。'],['示例数据为虚构记录，请替换为本次实际数据。']]:[['材料名称',doc?.title||''],['数据日期',doc?.date||''],['规划月份',doc?.month||''],['金额单位',type==='brief'?doc?.unit||'':'按各产品文本列明'],['摘要',doc?.summary||''],['说明',doc?.note||'']];
 X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(notes),'填写说明');
 if(doc?.recommendations?.length)X.utils.book_append_sheet(wb,X.utils.json_to_sheet(doc.recommendations.map(p=>({产品名称:p.name,产品代码:p.code,募集起始日:p.start,募集结束日:p.end,期限天数:p.tenor,低档收益率:p.low,中档收益率:p.mid,高档收益率:p.high,起存金额:p.minimum,起存金额单位:p.minimumUnit}))), '本周重点产品');
 return new Blob([X.write(wb,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export async function readOperationWorkbook(file,type){
 if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw Error('请选择不超过5MB的.xlsx文件');
 const X=globalThis.XLSX;if(!X)throw Error('表格组件未加载，请刷新重试');
 const wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellNF:true,sheetRows:301}),ws=wb.Sheets[sheetName[type]]||wb.Sheets[wb.SheetNames[0]];
 if(!ws?.['!ref'])throw Error('工作表没有可读取的数据');const range=X.utils.decode_range(ws['!fullref']||ws['!ref']);if(range.e.r>=300||range.e.c>30)throw Error('表格范围过大，请使用专用模板整理本次数据');
 const grid=X.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true});
 for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
  const cell=ws[X.utils.encode_cell({r,c})];if(!cell)continue;
  if(cell.f)throw Error('表格包含公式，请将公式结果粘贴为数值后上传');
  if(cell.v instanceof Date)grid[r][c]=cell.v.toISOString().slice(0,10);
  else if(typeof cell.v==='number'&&/%/.test(cell.z||''))grid[r][c]=(cell.v*100).toFixed(8).replace(/\.?0+$/,'')+'%';
 }
 return {...parseOperationGrid(type,grid,ws['!merges']||[]),source:file.name};
}
function dataTable(type,rows,limit=80){
 const columns=OP_COLUMNS[type];return `<div class="table-wrap ops-data-scroll"><table><thead><tr>${columns.map(c=>`<th>${e(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,limit).map(r=>`<tr>${columns.map(([key])=>`<td>${e(key==='highlight'?(r[key]?'重点':'—'):r[key]!==''&&r[key]!==undefined?r[key]:'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function documentCard(doc,editable){
 const view=operationView(doc),type=doc.type,status=doc.status==='sent';
 const details=type==='plan'?`${new Set(view.rows.map(r=>r.category)).size}类产品 · ${view.rows.length}只产品`:type==='brief'?`${new Set(view.rows.map(r=>r.group)).size}个分组 · ${view.rows.length}家分行`:`${view.rows.length}只到期产品 · ${view.recommendations.length}只重点产品`;
 return `<article class="ops-document-card"><a class="ops-cover ${view.theme==='navy'?'navy':''}" href="#operation/${e(doc.id)}"><span>${OP_TYPES[type].name}</span><strong>${e(view.title)}</strong><div>${type==='brief'?view.rows.slice(0,3).map(r=>`<i><b>${e(r.branch)}</b><em>${opNumber(r.completion,0)}%</em></i>`).join(''):view.rows.slice(0,3).map(r=>`<i><b>${e(type==='plan'?r.category+' · '+r.term:r.name)}</b><em>${e(type==='plan'?r.quote:opRate(r.actual))}</em></i>`).join('')}</div><small>${e(details)}</small></a><div class="ops-document-body"><div class="flex between"><span class="badge ${status?'issued':'draft'}">${status?'已下发':'待下发'}</span><span class="muted">${e(view.date)}</span></div><h3><a href="#operation/${e(doc.id)}">${e(view.title)}</a></h3><p>${e(details)}</p><div class="ops-document-foot"><span>${e(doc.source)}</span><a class="text-button" href="#operation/${e(doc.id)}">${editable&&!status?'编辑材料':'查看材料'} →</a></div></div></article>`;
}
export function operationsPage({state,role,branch,route}){
 const [r,id]=route;
 if(r==='operation'){
  const record=visibleOperations(state,null,role,branch).find(d=>d.id===id);if(!record)return '<div class="empty"><h3>暂无可查看的材料</h3></div>';
  const doc=operationView(record),editable=role==='manager'&&record.status==='draft',info=OP_TYPES[doc.type];
  return `<div id="operationsPage" data-document="${e(id)}"><div class="page-title"><div><h1 class="ops-document-title">${e(doc.title)}</h1><p class="subtitle">${info.name} · ${e(doc.source)}${record.status==='sent'?' · 已下发版本':''}</p></div><div class="title-actions"><a class="btn" href="#${info.route}">返回列表</a><button class="btn" data-op="data-download">下载数据</button>${editable?'<button class="btn primary" data-op="send">选择对象并下发</button>':''}</div></div><div class="ops-editor"><section class="card ops-settings"><div class="card-head"><h2>材料内容</h2><span class="badge ${editable?'draft':'issued'}">${editable?'可编辑':record.status==='sent'?'已下发':'只读'}</span></div><div class="card-body"><label>材料标题<input data-op-field="title" maxlength="60" value="${e(doc.title)}" ${editable?'':'readonly'}></label><div class="ops-field-pair"><label>${doc.type==='plan'?'规划月份':'数据日期'}<input data-op-field="${doc.type==='plan'?'month':'date'}" type="${doc.type==='plan'?'month':'date'}" value="${e(doc.type==='plan'?doc.month:doc.date)}" ${editable?'':'readonly'}></label><div class="ops-field-static"><span>数据范围</span><b>${doc.rows.length}${info.unit}</b></div></div><label>${doc.type==='brief'?'经营摘要':'工作提示'}<textarea rows="7" maxlength="600" data-op-field="summary" ${editable?'':'readonly'}>${e(doc.summary)}</textarea></label>${editable?'<button class="text-button" data-op="reset-summary">按当前数据重新生成摘要</button>':''}<label class="ops-note-label">附注说明<textarea rows="4" maxlength="280" data-op-field="note" ${editable?'':'readonly'}>${e(doc.note)}</textarea></label><div class="ops-theme-row"><span>版式配色</span><div>${['red','navy'].map(theme=>`<button data-op="theme" data-theme="${theme}" class="ops-theme ${theme} ${doc.theme===theme?'active':''}" aria-label="${theme==='red'?'中信红':'商务蓝'}" aria-pressed="${doc.theme===theme}" ${editable?'':'disabled'}></button>`).join('')}</div></div>${doc.type==='brief'?`<p class="ops-settings-note">金额单位：${e(doc.unit)}。分组内按计划完成率排序；合计不平均各分行完成率。</p>`:''}${doc.type==='campaign'?`<div class="ops-selected"><strong>本周重点产品 <span>${doc.recommendations.length}只</span></strong>${doc.recommendations.map(p=>`<p>${e(p.name)}</p>`).join('')}${editable?'<button class="btn small" data-op="recommendations">选择重点产品</button>':''}</div>`:''}${editable?'<button class="btn ops-replace" data-op="replace">重新上传数据</button>':''}</div></section><section class="card ops-preview"><div class="ops-preview-toolbar"><div><strong>材料预览</strong><small id="opsDimensions">正在生成</small></div><div class="flex"><select id="opsFormat" aria-label="图片格式"><option value="png">高清图片</option><option value="jpg">压缩图片</option></select><button class="btn primary" data-op="image-download" disabled>下载图片</button></div></div><div id="opsPreviewError" role="alert"></div><div class="ops-canvas-scroll"><canvas id="opsCanvas"></canvas></div></section></div><section class="card spacer"><div class="card-head"><div><h2>源数据清单</h2><p class="subtitle">${doc.type==='brief'?'金额单位：'+e(doc.unit)+' · ':''}共${doc.rows.length}条数据 · ${e(doc.source)}</p></div><button class="text-button" data-op="toggle-data" aria-expanded="false">展开数据</button></div><div id="opsSourceData" hidden>${dataTable(doc.type,doc.rows)}</div></section><section class="card spacer"><div class="card-head"><h2>下发记录</h2></div>${record.status==='sent'?`<div class="card-body ops-send-result"><div><strong>下发成功</strong><p>${e(record.sentAt)}</p></div><div class="ops-recipient-tags">${record.recipients.map(r=>`<span>${e(r.name)} · 下发成功</span>`).join('')}</div></div>`:'<div class="card-body muted">材料准备完成后，可选择分行及总行知识库下发。</div>'}</section></div>`;
 }
 const type=typeFor(r);if(!type)return '';
 const docs=visibleOperations(state,type,role,branch),editable=role==='manager',sent=docs.filter(d=>d.status==='sent').length;
 return `<div id="operationsPage" data-type="${type}"><div class="page-title"><div><h1>${OP_TYPES[type].name}</h1><p class="subtitle">${desc[type]}</p></div>${editable?`<div class="title-actions"><button class="btn" data-op="template">下载Excel模板</button><button class="btn primary" data-op="new">新建${OP_TYPES[type].name}</button></div>`:''}</div><section class="ops-hub"><div class="ops-hub-copy"><span class="ops-eyebrow">${OP_TYPES[type].section}</span><h2>${{plan:'产品安排，一图清晰呈现',brief:'经营数据，形成分行推动材料',campaign:'到期表现与当期产品，同屏呈现'}[type]}</h2><p>${{plan:'汇总产品报价、起存条件与额度安排，让分行快速掌握本月产品资源。',brief:'保留报表口径，按分组呈现指标，生成可直接修改的经营摘要。',campaign:'导入实际到期收益，搭配本周重点产品，生成完整营销长图。'}[type]}</p><div class="ops-workflow"><span>01 读取数据</span><i>→</i><span>02 生成材料</span><i>→</i><span>03 下载下发</span></div>${editable?'<button class="ops-hub-button" data-op="example">使用示例新建 <span>↗</span></button>':''}</div><div class="ops-hub-visual"><div class="ops-sheet-symbol">${symbol[type]}</div><div class="ops-hub-metric"><b>${docs.length}</b><span>份材料</span></div><div class="ops-hub-metric"><b>${sent}</b><span>份已下发</span></div><p>统一版式 · 保留数据 · 按需下发</p></div></section><div class="ops-list-head"><h2>${role==='branch'?e(branch)+'接收的材料':'材料记录'} <span class="count">${docs.length}</span></h2><span class="muted">按创建时间排列</span></div><div class="ops-documents">${docs.length?docs.map(d=>documentCard(d,editable)).join(''):'<div class="card empty"><h3>暂无材料记录</h3><p>已下发给本分行的材料将在这里展示。</p></div>'}</div></div>`;
}

export function mountOperations({state,role,branch,route,save,render,navigate,toast,showModal,closeModal}){
 const root=document.querySelector('#operationsPage');if(!root)return;
 const type=typeFor(route[0]),record=root.dataset.document?visibleOperations(state,null,role,branch).find(d=>d.id===root.dataset.document):null;
 let ticket=0;
 async function preview(){
  if(!record)return;const current=++ticket,canvas=root.querySelector('#opsCanvas'),button=root.querySelector('[data-op="image-download"]');button.disabled=true;
  try{const offscreen=await renderOperation(document.createElement('canvas'),clone(record));if(current!==ticket||!root.isConnected)return;canvas.width=offscreen.width;canvas.height=offscreen.height;canvas.getContext('2d').drawImage(offscreen,0,0);canvas.setAttribute('aria-label',offscreen.getAttribute('aria-label'));root.querySelector('#opsDimensions').textContent=`${canvas.width} × ${canvas.height} 像素`;root.querySelector('#opsPreviewError').textContent='';button.disabled=false;}
  catch(error){if(root.isConnected){root.querySelector('#opsPreviewError').textContent=error.message;root.querySelector('#opsDimensions').textContent='请调整材料内容';}}
 }
 function template(kind,example=false){download(`${OP_TYPES[kind].name}_${example?'填写示例':'上传模板'}.xlsx`,operationWorkbook(kind,example?exampleRows(kind):[],{template:true}));}
 function createModal(kind,replacing=false){
  if(role!=='manager'||replacing&&record?.status!=='draft')throw Error('请切换至产品经理办理');
  let parsed=null,busy=false;
  const defaults=replacing?record:{title:{plan:'2026年11月存款产品规划',brief:'全口径个人存款增长通报',campaign:'本周到期表现与重点产品推荐'}[kind],date:new Date().toLocaleDateString('sv-SE'),month:'2026-11',unit:'亿元'};
  showModal(replacing?'重新上传数据':'新建'+OP_TYPES[kind].name,`<div id="opIntake"><div class="ops-intake-meta"><label>材料标题<input id="opNewTitle" maxlength="60" value="${e(defaults.title)}"></label><label>${kind==='plan'?'规划月份':'数据日期'}<input id="opNewPeriod" type="${kind==='plan'?'month':'date'}" value="${e(kind==='plan'?defaults.month:defaults.date)}"></label>${kind==='brief'?`<label>报表金额单位<select id="opNewUnit"><option ${defaults.unit==='亿元'?'selected':''}>亿元</option><option ${defaults.unit==='万元'?'selected':''}>万元</option></select></label>`:''}</div><label class="ops-upload"><b>上传${sheetName[kind]}Excel</b><span>选择.xlsx文件 · 最多80条数据 · 5MB以内</span><input id="opUpload" type="file" accept=".xlsx"></label><div class="ops-intake-actions"><button class="text-button" data-op-intake="template">下载模板</button><button class="text-button" data-op-intake="example-file">下载填写示例</button><button class="btn small" data-op-intake="example">使用示例数据</button></div><div id="opReadStatus" role="status"></div><div id="opIntakePreview"></div><div id="opIntakeErrors" class="form-errors" role="alert"></div></div>`, '<button class="btn" data-action="close-modal">取消</button><button class="btn primary" id="opCreate" disabled>生成材料</button>',true);
  const intake=document.querySelector('#opIntake'),create=document.querySelector('#opCreate');
  const alive=()=>intake.isConnected&&intake.closest('dialog')?.open;
  const showParsed=()=>{const errors=parsed?.errors||[];intake.querySelector('#opReadStatus').textContent=`已读取${parsed.rows.length}条数据 · ${parsed.source}`;intake.querySelector('#opIntakePreview').innerHTML=`${parsed.warnings?.length?`<p class="ops-settings-note">${parsed.warnings.map(e).join('<br>')}</p>`:''}${dataTable(kind,parsed.rows,8)}${parsed.rows.length>8?'<p class="muted">预览前8条，生成时包含全部数据。</p>':''}`;intake.querySelector('#opIntakeErrors').textContent=errors.slice(0,8).join('；');create.disabled=!!errors.length||busy;};
  intake.onclick=event=>{if(busy)return;const action=event.target.closest('[data-op-intake]')?.dataset.opIntake;if(action==='template')template(kind);if(action==='example-file')template(kind,true);if(action==='example'){parsed={rows:exampleRows(kind),source:'内置示例',errors:[],warnings:[]};showParsed();}};
  intake.onchange=async event=>{if(event.target.id!=='opUpload'||!event.target.files[0])return;busy=true;create.disabled=true;parsed=null;intake.querySelector('#opReadStatus').textContent='正在读取并检查表格';intake.querySelector('#opIntakeErrors').textContent='';intake.querySelector('#opIntakePreview').innerHTML='';const file=event.target.files[0];event.target.value='';event.target.disabled=true;
   try{const result=await readOperationWorkbook(file,kind);if(!alive())return;parsed=result;}catch(error){if(alive()){intake.querySelector('#opIntakeErrors').textContent=error.message;intake.querySelector('#opReadStatus').textContent='请调整表格后重新上传';}}finally{busy=false;if(alive()){intake.querySelector('#opUpload').disabled=false;if(parsed)showParsed();}}};
  create.onclick=()=>{try{
   if(busy||!parsed||parsed.errors.length)throw Error('请先完成数据读取和检查');
   const title=intake.querySelector('#opNewTitle').value.trim(),period=intake.querySelector('#opNewPeriod').value;if(!title||!period)throw Error('请填写材料标题和日期或月份');
   const patch={title,[kind==='plan'?'month':'date']:period};updateOperation({status:'draft'},patch,role);
   let doc;if(replacing){doc=record;Object.assign(doc,patch,{rows:clone(parsed.rows),source:parsed.source});if(kind==='brief')doc.unit=intake.querySelector('#opNewUnit').value;doc.summary=autoSummary(doc);doc.updated=new Date().toLocaleString('sv-SE').slice(0,16);}
   else doc=createOperation(state,kind,parsed.rows,{...patch,source:parsed.source,unit:kind==='brief'?intake.querySelector('#opNewUnit').value:'亿元'},role);
   save();closeModal();navigate('operation/'+doc.id);if(replacing)render();toast('材料已生成');
  }catch(error){intake.querySelector('#opIntakeErrors').textContent=error.message;}};
 }
 function recommendationModal(){
  const available=recommendedProducts(state),all=[...new Map([...record.recommendations,...available].map(p=>[p.id,p])).values()],selected=new Set(record.recommendations.map(p=>p.id));
  showModal('选择本周重点产品',`<div id="opRecommendations"><p class="subtitle">选择已完成要素校验的产品，最多6只；按以下清单顺序生成。</p><div class="ops-recommendation-list">${all.map(p=>`<label><input type="checkbox" name="opRecommendation" value="${e(p.id)}" ${selected.has(p.id)?'checked':''}><span><strong>${e(p.name)}</strong><small>${e(p.code)} · ${e(p.tenor)}天 · ${e(p.start)} 至 ${e(p.end)}</small></span></label>`).join('')||'<p class="muted">暂无可选择产品，请先在结构性存款管理中完成产品要素校验。</p>'}</div><div id="opRecommendationError" role="alert"></div></div>`, '<button class="btn" data-action="close-modal">取消</button><button class="btn primary" id="opRecommendationConfirm">确认选择</button>',true);
  document.querySelector('#opRecommendationConfirm').onclick=()=>{const ids=[...document.querySelectorAll('input[name="opRecommendation"]:checked')].map(input=>input.value);if(ids.length>6){document.querySelector('#opRecommendationError').textContent='最多选择6只重点产品';return;}record.recommendations=clone(all.filter(p=>ids.includes(p.id)));save();closeModal();render();};
 }
 function sendModal(){
  if(role!=='manager'||record.status!=='draft')throw Error('当前材料不可下发');
  showModal('下发材料',`<div id="opSend"><div class="ops-send-summary"><strong>${e(record.title)}</strong><span>${record.rows.length}条数据 · ${OP_TYPES[record.type].name}</span></div><div class="flex between"><h3>接收分行</h3><button class="text-button" id="opSelectBranches">全选分行</button></div><div class="ops-branches">${BRANCHES.map(b=>`<label><input type="checkbox" name="opRecipient" value="${e(b)}">${e(b)}</label>`).join('')}</div><div class="ops-knowledge"><h3>总行知识库</h3><label><input type="checkbox" name="opRecipient" value="${KNOWLEDGE_BASE}">${KNOWLEDGE_BASE}</label></div><div id="opSendError" role="alert"></div></div>`, '<button class="btn" data-action="close-modal">取消</button><button class="btn primary" id="opSendConfirm">确认下发</button>');
  document.querySelector('#opSelectBranches').onclick=()=>document.querySelectorAll('input[name="opRecipient"]').forEach(input=>{if(input.value!==KNOWLEDGE_BASE)input.checked=true;});
  document.querySelector('#opSendConfirm').onclick=()=>{try{sendOperation(record,[...document.querySelectorAll('input[name="opRecipient"]:checked')].map(input=>input.value),role);save();closeModal();render();toast('下发成功');}catch(error){document.querySelector('#opSendError').textContent=error.message;}};
 }
 root.onchange=event=>{const input=event.target,key=input.dataset.opField;if(!key)return;try{updateOperation(record,{[key]:input.value},role);save();root.querySelector('.ops-document-title').textContent=record.title;preview();}catch(error){input.value=record[key];toast(error.message,true);}};
 root.onclick=async event=>{const button=event.target.closest('[data-op]');if(!button||button.disabled)return;const action=button.dataset.op;
  try{
   if(action==='template')template(type);
   if(action==='new')createModal(type);
   if(action==='example'){const doc=createOperation(state,type,exampleRows(type),{source:'内置示例',title:{plan:'2026年11月存款产品规划',brief:'全口径个人存款增长通报',campaign:'本周到期表现与重点产品推荐'}[type]},role);save();navigate('operation/'+doc.id);}
   if(action==='replace')createModal(record.type,true);
   if(action==='theme'){updateOperation(record,{theme:button.dataset.theme},role);save();render();}
   if(action==='reset-summary'){updateOperation(record,{summary:autoSummary(record)},role);save();render();}
   if(action==='toggle-data'){const data=root.querySelector('#opsSourceData');data.hidden=!data.hidden;button.textContent=data.hidden?'展开数据':'收起数据';button.setAttribute('aria-expanded',!data.hidden);}
   if(action==='recommendations')recommendationModal();
   if(action==='send')sendModal();
   if(action==='data-download'){const doc=operationView(record);download(doc.title+'.xlsx',operationWorkbook(doc.type,doc.rows,{doc}));}
   if(action==='image-download'){button.disabled=true;button.textContent='正在生成';const format=root.querySelector('#opsFormat').value;try{download(operationView(record).title+'.'+format,await operationBlob(clone(record),format));toast('图片已生成');}finally{button.disabled=false;button.textContent='下载图片';}}
  }catch(error){toast(error.message,true);}
 };
 if(record)preview();
}
