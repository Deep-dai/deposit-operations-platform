import {connection,localConnection,useCloudConnection,saveConnection,clearConnection,DEFAULT_RELAY,relayTargets,relayJob,advanceRelayJob,submitRelayJob,resolveRelayJob,sha256} from './wecom-client.js';
import {beginWecomDelivery,applyWecomReceipt} from './wecom-model.js';
import {isIssueEditable} from './issue-lifecycle.js';
import {assertNoticeReady,noticeDocument,escapeHTML as e} from './notice-model.js';
import {buildPosterModel} from './poster-model.js';

const safeName=value=>String(value).replace(/[\\/:*?"<>|\r\n]/g,'').slice(0,110)||'发行材料';
const size=bytes=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;
const itemLabels={pending:'等待发送',uploading:'上传中',sending:'发送中',sent:'发送成功',failed:'发送失败',unknown:'结果待核实'};
export function wecomResults(issue){
 const d=issue.wecomDelivery;if(!d)return '';
 return `<section class="card"><div class="card-head"><h2>企微发送记录</h2></div><div class="card-body wecom-results"><strong>${e(d.targetName)}</strong><p class="subtitle">${e(d.updated||d.created)} · ${d.items.filter(i=>i.status==='sent').length}／${d.items.length} 份文件成功</p>${d.items.map(item=>`<div class="wecom-result"><span>${e(item.name)}${['failed','unknown'].includes(item.status)?`<small class="wecom-item-note">${e(item.message||'请查询发送结果')}</small>`:''}</span><b class="${item.status==='sent'?'wecom-ok':'wecom-muted'}">${itemLabels[item.status]||'待查询'}${item.verified==='manual'?'（人工核实）':''}</b></div>`).join('')}${d.status==='partial'?'<p class="wecom-hint">已有文件发送成功，材料已锁定。可重试未成功文件，成功文件不会重复发送。</p>':d.status==='unknown'?'<p class="wecom-hint">部分结果未能确认，材料已锁定，请在群内核实。查询不会重复发送文件。</p>':d.status==='pending'?`<p class="wecom-hint">材料已锁定。${d.serviceId?.startsWith('cloud-')?'云端分步发送需保持本页面开启；关闭后请返回原记录继续处理，已完成步骤不会重发。':'请查询本次发送结果，关闭网页不会中止已提交的发送。'}</p>`:d.status==='sent'?`<p class="wecom-hint">${d.items.some(x=>x.verified==='manual')?'发送已完成，包含经办人在群内核实的结果':'企微接口已确认发送成功'}，材料仅可查看和下载。</p>`:'<p class="wecom-hint">本次未发送成功，可修改材料或检查配置后重试。</p>'}</div></section>`;
}
export function openWecomSettings({showModal,closeModal,onConnected=()=>{}}){
 const saved=localConnection();
 showModal('企微设置',`<div id="wecomSettings" class="wecom-settings"><div class="wecom-target"><span>发送方式</span><strong>云端统一发送</strong><span>使用已配置的接收群，无需启动本机服务或填写连接码。</span></div><div id="wecomConnectionStatus" class="wecom-message" role="status">正在检查云端连接…</div><p class="wecom-hint">这里仅检查连接，不会向群发送消息。接收群由维护人员在云端统一配置。</p><details class="wecom-local-option"><summary>本机发送（备用方式）</summary><p>处理原本机服务的历史发送记录，或在云端暂不可用时使用。</p><a href="${DEFAULT_RELAY}/" target="_blank" rel="noopener" class="text-button">打开本机发送设置 ↗</a><label>服务地址<input id="wecomEndpoint" value="${e(saved?.endpoint||DEFAULT_RELAY)}" autocomplete="off"></label><label>连接码<input id="wecomToken" type="password" value="${e(saved?.token||'')}" autocomplete="off" placeholder="从本机设置页面复制"></label><button class="btn" id="wecomLocalConnect">连接本机服务</button>${saved?'<button class="btn" id="wecomDisconnect">清除本机连接</button>':''}</details></div>`,`<button class="btn" data-action="close-modal">关闭</button><button class="btn primary" id="wecomConnect">使用云端发送</button>`);
 const root=document.querySelector('#wecomSettings'),status=root.querySelector('#wecomConnectionStatus'),button=document.querySelector('#wecomConnect');
 const alive=()=>root.isConnected&&root.closest('dialog')?.open;
 async function checkCloud(select=false){
  button.disabled=true;status.textContent='正在检查云端连接…';
  try{
   const data=await relayTargets({mode:'cloud'});if(!alive())return;
   if(!data.serviceId||!Array.isArray(data.targets))throw Error('云端发送服务版本不匹配');
   status.textContent=data.targets.length?`连接成功，接收群：${data.targets.map(t=>t.name).join('、')}。尚未发送消息。`:'云端服务可访问，接收群尚未配置完成，请联系维护人员。';
   if(select&&data.targets.length){useCloudConnection();closeModal();onConnected(data);}
  }catch(error){if(alive())status.textContent=error.message;}finally{if(alive())button.disabled=false;}
 }
 button.onclick=()=>checkCloud(true);
 root.querySelector('#wecomLocalConnect').onclick=async()=>{
  const localButton=root.querySelector('#wecomLocalConnect');localButton.disabled=true;
  try{
   const endpoint=root.querySelector('#wecomEndpoint').value,token=root.querySelector('#wecomToken').value.trim();
   if(!/^[a-f0-9]{64}$/.test(token))throw Error('连接码格式不正确，请从本机设置页面复制');
   const data=await relayTargets({mode:'local',endpoint,token});if(!alive())return;
   if(!data.serviceId||!data.targets?.length)throw Error('本机服务尚未配置接收群');
   saveConnection(endpoint,token);closeModal();onConnected(data);
  }catch(error){if(alive())status.textContent=error.message;}finally{if(alive())localButton.disabled=false;}
 };
 const disconnect=root.querySelector('#wecomDisconnect');if(disconnect)disconnect.onclick=()=>{clearConnection();root.querySelector('#wecomToken').value='';void checkCloud();};
 void checkCloud();
}

export async function prepareWecomMaterials(state,issue,includePoster,maxFileBytes=20_000_000){
 if(!issue.notice)throw Error('请先使用通知模板生成发行通知');
 assertNoticeReady(state,issue);
 const notice=noticeDocument(issue),poster=includePoster?buildPosterModel(state,issue):null;
 const {noticeDocx}=await import('./notice-export.js');
 const files=[{kind:'notice',name:safeName(notice.title)+'.docx',blob:await noticeDocx(notice)}];
 if(poster){const {posterBlob}=await import('./poster-renderer.js');files.push({kind:'poster',name:safeName(issue.title)+'_发行海报.jpg',blob:await posterBlob(poster,'jpg')});}
 for(const f of files){if(f.blob.size<=5||f.blob.size>maxFileBytes)throw Error(`${f.name}超过本次发送大小限制（${Math.round(maxFileBytes/1_000_000)}MB），请压缩海报或使用本机发送`);f.sha256=await sha256(await f.blob.arrayBuffer());}
 return {files,notice,poster,revision:await sha256(JSON.stringify({notice,poster}))};
}

export function openWecomSend({state,issue,getRole,showModal,closeModal,persist,refresh,onError}){
 if(getRole()!=='manager')throw Error('请切换至产品经理发送材料');
 if(!isIssueEditable(issue)&&!issue.wecomDelivery)throw Error('已下发的记录不能再次发送');
 if(!connection(issue.wecomDelivery?.serviceId)){openWecomSettings({showModal,closeModal,onConnected:()=>openWecomSend({state,issue,getRole,showModal,closeModal,persist,refresh,onError})});return;}
 showModal('发送至企微',`<div id="wecomSend"><div id="wecomSendBody"><p>正在连接接收群…</p></div><div id="wecomSendStatus" class="wecom-message" role="status"></div></div>`,`<button class="btn" data-action="close-modal">关闭</button><button class="btn" id="wecomVerify" hidden>核实发送结果</button><button class="btn" id="wecomCheck" hidden>查询发送结果</button><button class="btn primary" id="wecomSubmit" disabled>确认发送</button>`,true);
 const root=document.querySelector('#wecomSend'),host=root.querySelector('#wecomSendBody'),message=root.querySelector('#wecomSendStatus'),send=document.querySelector('#wecomSubmit'),check=document.querySelector('#wecomCheck');
 const alive=()=>root.isConnected&&root.closest('dialog')?.open;
 const verify=document.querySelector('#wecomVerify');
 let prepared=null,service=null,busy=false,newVersion=false,resubmit=false,prepareTicket=0;
 const update=receipt=>{applyWecomReceipt(state,issue,receipt);try{persist();}catch{throw Error('已取得企微结果，但本地记录未能保存。请保留当前页面，勿新建重复发送；发送服务已保留记录。');}refresh();};
 function results(){
  const d=issue.wecomDelivery;host.innerHTML=wecomResults(issue);check.hidden=false;send.disabled=true;send.hidden=true;
  verify.hidden=d.status!=='unknown';
  if(d.status==='failed'||d.status==='partial'){send.hidden=false;send.disabled=false;send.textContent='重试未成功文件';}
 }
 async function poll(){
  for(let i=0;i<40&&alive();i++){
   const receipt=await advanceRelayJob(issue.wecomDelivery.jobId,issue.wecomDelivery.serviceId);if(!alive())return;update(receipt);results();
   if(receipt.status!=='pending'){message.textContent=receipt.status==='sent'?(receipt.items.some(x=>x.verified==='manual')?'本次文件已确认发送完成，记录中保留人工核实依据。':'本次所选文件均已获企微接口成功确认。'):receipt.status==='unknown'?'发送结果不明确，请在群内核实。查询不会重发。':'请查看各文件结果；重试只发送明确失败的文件。';return;}
   message.textContent=service?.mode==='cloud'?'正在分步上传和发送，请保持本页面开启；若中途关闭，可返回此记录继续处理。':'发送处理中，请稍候。关闭窗口不会中止已提交的发送。';
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(alive())message.textContent='发送服务仍在处理，请稍后查询发送结果。';
 }
 check.onclick=async()=>{if(busy)return;busy=true;check.disabled=true;try{await poll();}catch(error){if(alive()){message.textContent=error.message;if(error.status===404&&issue.wecomDelivery?.status==='pending'){resubmit=true;send.hidden=false;send.disabled=false;send.textContent='重新提交本次请求';message.textContent='发送服务尚未登记本次请求，可重新提交同一次请求；服务会校验批次并防止重复发送。';}}}finally{busy=false;if(alive())check.disabled=false;}};
 verify.onclick=()=>{
  if(busy||getRole()!=='manager')return;
  const unknown=issue.wecomDelivery.items.filter(x=>x.status==='unknown');
  host.innerHTML=`<div class="wecom-target"><span>请在该企微群中核实</span><strong>${e(issue.wecomDelivery.targetName)}</strong></div>${unknown.map(item=>`<label class="wecom-verify-field">${e(item.name)}<select data-wecom-resolution="${item.kind}"><option value="">请选择核实结果</option><option value="received">已在群内收到</option><option value="missing">确认未收到</option></select></label>`).join('')}<p class="wecom-hint">仅凭没有看到提示不能判断未发送。请查看目标群的文件消息后填写；核实为“未收到”的文件才允许重试。</p><label class="checkbox-line wecom-option"><input id="wecomVerifyConfirmed" type="checkbox">已在目标群中逐项核实，按实际收到情况登记。</label><button class="btn primary" id="wecomSaveResolution">保存核实结果</button>`;
  send.hidden=true;verify.hidden=true;message.textContent='保存核实结果不会发送文件。';
  host.querySelector('#wecomSaveResolution').onclick=async()=>{
   if(busy||getRole()!=='manager')return;
   try{
    const selections=[...host.querySelectorAll('[data-wecom-resolution]')];if(!host.querySelector('#wecomVerifyConfirmed').checked||selections.some(x=>!x.value))throw Error('请逐份选择核实结果，并勾选确认');
    busy=true;const d=issue.wecomDelivery,receipt=await resolveRelayJob(d.jobId,{revision:d.revision,confirmed:true,items:selections.map(x=>({kind:x.dataset.wecomResolution,received:x.value==='received'}))},d.serviceId);update(receipt);results();message.textContent='核实结果已保存，未发送新的文件。';
   }catch(error){if(alive())message.textContent=error.message;}finally{busy=false;}
  };
 };
 async function prepare(){
  const ticket=++prepareTicket;prepared=null;send.disabled=true;message.textContent='正在生成待发送文件…';
  try{
   const pack=await prepareWecomMaterials(state,issue,host.querySelector('#wecomIncludePoster')?.checked||false,service?.maxFileBytes);if(!alive()||ticket!==prepareTicket)return;prepared=pack;
   host.querySelector('#wecomFileList').innerHTML=pack.files.map(f=>`<div class="wecom-result"><span>${e(f.name)}</span><b>${size(f.blob.size)}</b></div>`).join('');message.textContent='文件已生成，尚未发送。';send.disabled=!host.querySelector('#wecomReviewed')?.checked;
  }catch(error){if(alive()&&ticket===prepareTicket)message.textContent=error.message;}
 }
 send.onclick=async()=>{
  if(busy)return;busy=true;send.disabled=true;check.disabled=true;
  try{
   if(getRole()!=='manager')throw Error('请切换至产品经理发送材料');
   let retry=false,delivery=issue.wecomDelivery;
   if(delivery&&resubmit){
    prepared=await prepareWecomMaterials(state,issue,delivery.items.some(x=>x.kind==='poster'));
    if(prepared.revision!==delivery.revision)throw Error('当前材料与原请求不一致，不能重新提交');
   }else if(delivery&&!newVersion&&['failed','partial'].includes(delivery.status)){
    // Refresh before a retry: another tab may already have retried this job.
    const latest=await relayJob(delivery.jobId,delivery.serviceId);update(latest);
    if(!['failed','partial'].includes(latest.status)){results();await poll();return;}
    prepared=await prepareWecomMaterials(state,issue,delivery.items.some(x=>x.kind==='poster'));
    if(prepared.revision!==delivery.revision)throw Error('材料已修改，请关闭本窗口后按新版本重新发起发送');
    retry=true;
   }else{
    if(!prepared||!host.querySelector('#wecomReviewed')?.checked)throw Error('请先核对发送文件并勾选确认');
    if(!state.issues.includes(issue))throw Error('发行记录已取消');
    // Recheck inputs after asynchronous rendering, before making the send durable.
    const current=await sha256(JSON.stringify({notice:noticeDocument(issue),poster:prepared.poster?buildPosterModel(state,issue):null}));
    if(current!==prepared.revision)throw Error('材料已发生变化，请关闭窗口后重新生成待发送文件');
    const before=JSON.parse(JSON.stringify(issue));
    beginWecomDelivery(issue,{jobId:'WC-'+crypto.randomUUID(),revision:prepared.revision,serviceId:service.serviceId,target:service.targets[0],files:prepared.files,noticeSnapshot:prepared.notice,posterSnapshot:prepared.poster},getRole());
    try{persist();}catch{for(const key of Object.keys(issue))delete issue[key];Object.assign(issue,before);throw Error('未能保存本次发送记录，尚未发起发送。请先备份并检查浏览器存储空间。');}
    delivery=issue.wecomDelivery;refresh();
   }
   const data=await submitRelayJob({id:delivery.jobId,issueId:issue.id,title:issue.title,revision:delivery.revision,targetId:delivery.targetId,retryFailed:retry,files:prepared.files.map(({kind,name,sha256})=>({kind,name,sha256}))},prepared.files,delivery.serviceId);
   update(data);if(!alive())return;results();await poll();
  }catch(error){if(alive()){message.textContent=error.message;if(issue.wecomDelivery&&['pending','partial','unknown','sent'].includes(issue.wecomDelivery.status)){results();}else send.disabled=!prepared;}onError(error.message);}
  finally{busy=false;if(alive()){check.disabled=false;if(issue.wecomDelivery&&['failed','partial'].includes(issue.wecomDelivery.status))send.disabled=false;}}
 };
 void (async()=>{
  try{
   service=await relayTargets(connection(issue.wecomDelivery?.serviceId));if(!alive())return;
   if(!service.targets?.length)throw Error('尚未配置接收群，请先打开“企微设置”检查服务配置');
   const d=issue.wecomDelivery;
   if(d&&d.serviceId!==service.serviceId)throw Error('当前连接的发送服务与原记录不同，请连接原发送服务后查询，勿重复发送');
   if(d&&d.status==='failed'&&isIssueEditable(issue)){
    const pack=await prepareWecomMaterials(state,issue,d.items.some(x=>x.kind==='poster'));if(!alive())return;
    if(pack.revision===d.revision){results();return;}newVersion=true;
   }else if(d){results();if(d.status==='pending')await poll();return;}
   host.innerHTML=`<div class="wecom-target"><span>接收企微群</span><strong>${e(service.targets[0].name)}</strong></div><label class="checkbox-line wecom-option"><input id="wecomIncludePoster" type="checkbox">同时发送当前设置的海报（JPEG 文件）</label><div id="wecomFileList" class="wecom-files"></div><p class="wecom-hint">${service.mode==='cloud'?'云端将分步上传、发送，请保持本页面开启。':''}本次仅发送上方列出的文件。通知正文中的附件清单不会自动附带原件；产品说明书和通用协议未包含在本次发送中。</p><label class="checkbox-line wecom-option"><input id="wecomReviewed" type="checkbox">已核对接收群及材料内容，确认发送；发送成功后不可修改或取消。</label>`;
   host.querySelector('#wecomIncludePoster').onchange=()=>{host.querySelector('#wecomReviewed').checked=false;void prepare();};
   host.querySelector('#wecomReviewed').onchange=()=>{send.disabled=!prepared||!host.querySelector('#wecomReviewed').checked;};
   await prepare();
  }catch(error){if(alive()){host.innerHTML='<p>尚未准备好企微发送。</p>';message.textContent=error.message;}}
 })();
}
