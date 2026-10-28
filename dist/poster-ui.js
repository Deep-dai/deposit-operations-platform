import {POSTER_TEMPLATES,posterConfig,buildPosterModel,updatePosterConfig,rateText} from './poster-model.js';
import {renderPoster,posterBlob} from './poster-renderer.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountPoster(root,{state,issue,editable,onChange,onError}) {
  let config=posterConfig(issue), ticket=0, timer;
  if(issue.posterSnapshot){config.template=issue.posterSnapshot.template;config.consumerProtectionNumber=issue.posterSnapshot.consumerProtectionNumber||'';}
  const product=id=>state.products.find(p=>p.id===id);
  const save=()=>{updatePosterConfig(issue,config);onChange();};
  const supplementary=(id)=>config.supplements[id]||{};
  const chosen=()=>config.template==='single'?[config.singleId]:config.order.filter(id=>config.selectedIds.includes(id));

  function panel() {
    root.innerHTML=`<div class="poster-workspace">
      <div class="poster-settings">
        <div class="poster-section-title">海报样式</div>
        <div class="poster-template-options">${Object.entries(POSTER_TEMPLATES).map(([key,label])=>`<button type="button" class="poster-template ${key===config.template?'selected':''}" data-poster-template="${key}" aria-pressed="${key===config.template}" ${editable?'':'disabled'}><span class="poster-thumb ${key}"></span><strong>${label}</strong><small>${key==='single'?'单只产品 · 品牌竖版':'多只产品 · 卡片长图'}</small></button>`).join('')}</div>
        <label class="poster-field">消保编号（选填）<input aria-label="消保编号" data-poster-consumer-number maxlength="60" value="${esc(config.consumerProtectionNumber)}" placeholder="填写本张海报的消保编号" ${editable?'':'readonly'}></label>
        <p class="poster-hint">填写后显示在海报底部，随图片一同导出。</p>
        <div class="poster-section-title">${config.template==='single'?'选择产品':'产品与排列顺序'}</div>
        ${config.template==='single'?`<label class="poster-field">海报产品<select aria-label="海报产品" data-poster-single ${editable?'':'disabled'}>${config.order.map(id=>`<option value="${esc(id)}" ${id===config.singleId?'selected':''}>${esc(product(id)?.market?.name)}</option>`).join('')}</select></label>`:
        `<div class="poster-order">${config.order.map((id,index)=>`<div class="poster-order-row"><label class="checkbox-line"><input type="checkbox" data-poster-select="${esc(id)}" ${config.selectedIds.includes(id)?'checked':''} ${editable?'':'disabled'}><span>${esc(product(id)?.market?.name)}</span></label>${editable?`<div class="poster-order-actions"><button type="button" data-poster-move="${esc(id)}" data-direction="-1" aria-label="上移${esc(product(id)?.market?.name)}" ${index===0?'disabled':''}>↑</button><button type="button" data-poster-move="${esc(id)}" data-direction="1" aria-label="下移${esc(product(id)?.market?.name)}" ${index===config.order.length-1?'disabled':''}>↓</button></div>`:''}</div>`).join('')}</div><p class="poster-hint">按勾选产品顺序生成，最多 12 只。</p>`}
        ${editable?`<div class="poster-section-title">${config.template==='single'?'补充展示信息':'挂钩说明'}</div>${chosen().map(id=>{
          const p=product(id)?.market||{},extra=supplementary(id),key=config.template==='single'?'risk':'hook';
          return `<div class="poster-supplement"><div class="poster-product-label">${esc(p.name)}</div><label class="poster-field">${key==='risk'?'风险等级（选填）':'挂钩说明'}<input data-poster-extra="${key}" data-product="${esc(id)}" maxlength="${key==='risk'?20:40}" value="${esc(key==='risk'?(extra.risk||''):(extra.hook??`挂钩${p.underlying}`))}" placeholder="${key==='risk'?'按说明书填写，留空不展示':'按说明书填写完整挂钩说明'}"></label></div>`;
        }).join('')}<p class="poster-hint">看涨、看跌方向及风险等级须按产品说明书填写。</p>`:`<p class="poster-hint">${issue.posterSnapshot?'已下发版本，海报内容已锁定。':'按本次发行最终要素生成。'}</p>`}
        <details class="poster-source"><summary>查看自动带入的产品要素</summary><div id="posterData"></div></details>
      </div>
      <div class="poster-preview-pane">
        <div class="poster-preview-toolbar"><div><strong>海报预览</strong><small id="posterSize"></small></div><div class="flex"><select aria-label="图片格式" id="posterFormat"><option value="png">高清图片</option><option value="jpg">压缩图片</option></select><button type="button" class="btn primary" data-poster-download>下载海报</button></div></div>
        <div id="posterError" class="poster-error" role="status"></div>
        <div class="poster-preview-scroll" id="posterCanvasHost"><canvas id="posterCanvas" role="img"></canvas></div>
        <p class="poster-preview-caption">固定版式沿用原海报，产品信息随本次发行更新。</p>
      </div>
    </div>`;
    preview();
  }
  async function preview() {
    const current=++ticket, canvas=root.querySelector('#posterCanvas'), error=root.querySelector('#posterError'),download=root.querySelector('[data-poster-download]');
    if(!canvas)return;
    download.disabled=true;error.textContent='';
    try {
      const model=buildPosterModel(state,issue,config);
      root.querySelector('#posterData').innerHTML=model.products.map(p=>`<div class="poster-data-product"><b>${esc(p.name)}</b><dl><dt>产品编号</dt><dd>${esc(p.code)}</dd><dt>预期年化收益率</dt><dd>${esc(rateText(p))}</dd><dt>期限</dt><dd>${esc(p.tenor)} 天</dd><dt>起售 / 截止</dt><dd>${esc(p.start)} / ${esc(p.end)}</dd><dt>起息 / 到期</dt><dd>${esc(p.value)} / ${esc(p.maturity)}</dd></dl></div>`).join('');
      // Draw offscreen first, so a slower earlier render cannot overwrite the latest preview.
      const frame=await renderPoster(document.createElement('canvas'),model);
      if(current!==ticket||!canvas.isConnected)return;
      canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').drawImage(frame,0,0);
      canvas.setAttribute('aria-label',frame.getAttribute('aria-label'));
      canvas.hidden=false;root.querySelector('#posterSize').textContent=`${model.width} × ${model.height} 像素 · ${model.products.length} 只产品`;
      download.disabled=false;
    } catch(err) {
      if(current!==ticket)return;
      canvas.hidden=true;error.textContent=err.message;root.querySelector('#posterSize').textContent='';
    }
  }
  root.onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.hasAttribute('data-poster-download')){
        button.disabled=true;button.textContent='正在生成';
        const model=buildPosterModel(state,issue,config), format=root.querySelector('#posterFormat').value;
        const blob=await posterBlob(model,format),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=`${issue.title.replace(/[\\/:*?"<>|]/g,'_')}_${POSTER_TEMPLATES[model.template]}.${format}`;
        document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
        button.disabled=false;button.textContent='下载海报';return;
      }
      if(!editable)return;
      if(button.dataset.posterTemplate){config.template=button.dataset.posterTemplate;save();panel();}
      if(button.dataset.posterMove){const at=config.order.indexOf(button.dataset.posterMove),to=at+Number(button.dataset.direction);if(to<0||to>=config.order.length)return;[config.order[at],config.order[to]]=[config.order[to],config.order[at]];save();panel();}
    }catch(err){button.disabled=false;button.textContent=button.hasAttribute('data-poster-download')?'下载海报':button.textContent;onError(err.message);}
  };
  root.onchange=event=>{
    if(!editable)return;const target=event.target;
    if(target.hasAttribute('data-poster-single')){config.singleId=target.value;save();panel();}
    if(target.hasAttribute('data-poster-select')){const id=target.dataset.posterSelect;config.selectedIds=target.checked?[...config.selectedIds,id]:config.selectedIds.filter(value=>value!==id);save();panel();}
  };
  root.oninput=event=>{
    if(!editable)return;
    if(event.target.hasAttribute('data-poster-consumer-number')){
      config.consumerProtectionNumber=event.target.value;save();clearTimeout(timer);timer=setTimeout(preview,160);return;
    }
    if(!event.target.dataset.posterExtra)return;
    const target=event.target,id=target.dataset.product;
    config.supplements[id]={...supplementary(id),[target.dataset.posterExtra]:target.value};save();
    clearTimeout(timer);timer=setTimeout(preview,160);
  };
  panel();
}
