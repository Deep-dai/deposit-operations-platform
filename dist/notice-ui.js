import {isDirectMaterials} from './direct-materials.js';
import {noticeConfig,noticeDocument,saveNotice,noticeErrors,noticeHTML,escapeHTML as e,PARAGRAPH_LABELS} from './notice-model.js';

export function mountNotice(root,{state,issue,editable,onChange,onError,onDownload}){
  let config=noticeConfig(issue);
  const field=(key,label,type='text',extra='')=>`<label class="notice-field">${label}<input type="${type}" data-notice-field="${key}" value="${e(config[key])}" ${extra}></label>`;
  const text=(key,label)=>`<label class="notice-field">${label}<textarea data-notice-field="${key}" rows="2">${e(config[key])}</textarea></label>`;
  const attachments=()=>config.commonAttachments.map((name,index)=>`<div class="notice-attachment-edit"><label class="notice-field">通用附件 ${index+1}<input aria-label="通用附件 ${index+1}" data-notice-attachment="${index}" value="${e(name)}"></label><button class="text-button" type="button" data-notice-remove="${index}" aria-label="移除通用附件 ${index+1}">移除</button></div>`).join('');
  function panel(){
    const doc=noticeDocument(issue);if(!doc)return;
    root.innerHTML=`<div class="notice-toolbar"><div><strong>发行通知模板</strong><small>${isDirectMaterials(issue)?'产品信息取自本次上传的说明书及补充信息':'产品信息取自已通过一致性校验的金市回传说明书要素'}</small></div><div class="flex"><span class="notice-save-status" id="noticeSaveStatus">已保存</span>${editable?'<button type="button" class="btn" data-notice-save>保存通知</button>':''}<button type="button" class="btn primary" data-notice-download>下载通知</button></div></div>
      <div class="notice-workspace ${editable?'':'notice-readonly'}">${editable?`<aside class="notice-settings">
        <h3>本次通知</h3><label class="notice-field">通知标题<textarea rows="2" data-notice-field="title" placeholder="留空按产品期次生成；可按词意换行">${e(config.title)}</textarea></label>${field('addressee','主送单位')}
        <div class="notice-field-pair">${field('issuer','发文单位')}${field('date','成文日期','date')}</div>
        <details open><summary>发行安排</summary><div class="notice-detail-body"><div class="notice-times">${field('saleStart','销售开始','time')}${field('saleEnd','销售结束','time')}${field('lastClose','末日截止','time')}</div>${text('channels','发行渠道')}${doc.rows.some(r=>r.purchaseChannels)?`<div class="notice-channel-check"><p>说明书购买渠道：</p>${[...new Set(doc.rows.map(r=>r.purchaseChannels).filter(Boolean))].map(channel=>`<p>${e(channel)}</p>`).join('')}<label class="checkbox-line"><input type="checkbox" id="noticeChannelReviewed" ${config.channelReviewed?'checked':''}>已核对说明书与本次发行渠道</label></div>`:''}${text('region','发行区域')}</div></details>
        <details><summary>通用附件 <span>${config.commonAttachments.length} 项</span></summary><div class="notice-detail-body"><div id="noticeCommonAttachments">${attachments()}</div><button class="text-button" type="button" data-notice-add>＋ 新增通用附件</button><p class="notice-setting-hint">每只产品的说明书及风险揭示书另行自动追加；这里编排通知中的附件名称。</p></div></details>
        <details><summary>固定正文与制度依据</summary><div class="notice-detail-body">${field('rule','行内制度依据')}<p class="notice-setting-hint">正文沿用发行通知模板，可按本次发行需要修改。花括号内的字段会自动填入。</p>${Object.entries(PARAGRAPH_LABELS).map(([key,label])=>`<label class="notice-field">${label}<textarea rows="4" data-notice-paragraph="${key}">${e(config.paragraphs[key])}</textarea></label>`).join('')}</div></details>
      </aside>`:''}
      <div class="notice-preview-pane"><div class="notice-preview-heading"><div><strong>通知预览</strong><small>${doc.rows.length} 只产品 · ${doc.attachments.length} 项附件</small></div><button type="button" class="text-button" data-notice-sources>核对取数来源 ↓</button></div><div id="noticeValidation" class="notice-validation" role="status"></div><article class="notice-paper" id="noticePreview">${noticeHTML(doc)}</article></div>
      </div>
      <details class="notice-sources" id="noticeSources"><summary>取数来源与附件核对 · ${doc.rows.length} 只产品</summary><div class="notice-source-intro">${isDirectMaterials(issue)?'产品代码、名称及募集日期取自本次上传的说明书及补充信息。原始说明书已保存在当前浏览器。':'产品代码、名称及募集日期取自金市回传资料，需通过申报、最终要素与说明书一致性校验。此处展示回传要素；原始说明书独立作为附件。'}</div><div class="table-wrap"><table><thead><tr><th>产品代码</th><th>产品名称</th><th>募集起始日</th><th>募集结束日</th><th>来源</th></tr></thead><tbody>${doc.rows.map(r=>`<tr><td>${e(r.code)}</td><td>${e(r.name)}</td><td>${e(r.start)}</td><td>${e(r.end)}</td><td><button class="text-button" data-action="prospectus" data-id="${e(r.id)}">查看说明书要素</button></td></tr>`).join('')}</tbody></table></div><div class="notice-source-intro">通用附件 ${config.commonAttachments.length} 项；产品说明书及风险揭示书 ${doc.rows.length} 项。附件清单只列名称，不代表原件已上传。</div></details>`;
    validation();
  }
  function validation(){
    const errors=issue.status==='sent'?[]:noticeErrors(state,issue),box=root.querySelector('#noticeValidation');
    box.textContent=errors.length?errors.join('；'):isDirectMaterials(issue)?'产品表及附件清单已生成，可下载通知和海报。':'产品表及附件已生成，请核对通知、说明书和海报后确认下发。';
    box.classList.toggle('notice-validation-warning',!!errors.length);
    root.querySelector('[data-notice-download]').disabled=!!errors.length;
  }
  function update(record=false){
    try{
      const doc=saveNotice(state,issue,config,{record});onChange();
      root.querySelector('#noticePreview').innerHTML=noticeHTML(doc);
      root.querySelector('.notice-preview-heading small').textContent=`${doc.rows.length} 只产品 · ${doc.attachments.length} 项附件`;
      root.querySelector('#noticeSaveStatus').textContent=record?'已保存':'已自动保存';validation();
    }catch(error){onError(error.message);}
  }
  root.oninput=event=>{
    if(!editable)return;const t=event.target;
    if(t.hasAttribute('data-notice-field')){config[t.dataset.noticeField]=t.value;if(t.dataset.noticeField==='channels'){config.channelReviewed=false;const check=root.querySelector('#noticeChannelReviewed');if(check)check.checked=false;}}
    else if(t.hasAttribute('data-notice-paragraph'))config.paragraphs[t.dataset.noticeParagraph]=t.value;
    else if(t.hasAttribute('data-notice-attachment'))config.commonAttachments[Number(t.dataset.noticeAttachment)]=t.value;
    else return;
    update();
  };
  root.onchange=event=>{if(editable&&event.target.id==='noticeChannelReviewed'){config.channelReviewed=event.target.checked;update();}};
  root.onclick=async event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-notice-sources')){const sources=root.querySelector('#noticeSources');sources.open=true;sources.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(b.hasAttribute('data-notice-download')){try{b.disabled=true;b.textContent='正在生成';await onDownload();}catch(error){onError(error.message);}finally{b.disabled=false;b.textContent='下载通知';validation();}return;}
    if(!editable)return;
    if(b.hasAttribute('data-notice-save'))update(true);
    if(b.hasAttribute('data-notice-add')||b.hasAttribute('data-notice-remove')){
      if(b.hasAttribute('data-notice-add'))config.commonAttachments.push('');else config.commonAttachments.splice(Number(b.dataset.noticeRemove),1);
      update();panel();root.querySelectorAll('.notice-settings details')[1].open=true;
    }
  };
  panel();
}
