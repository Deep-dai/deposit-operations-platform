import {LABELS} from './core.js';
import {escapeHTML as e} from './notice-model.js';
import {readProspectus,storeOriginal} from './prospectus-files.js';
import {sourceFields,matchReturn,validateReturn,applyReturn} from './prospectus-return.js';
const labels={...LABELS,marketNumber:'产品代码'};
const location=ev=>ev?.page?`第 ${ev.page} 页`:ev?'Word正文':'人工核对';
const original=file=>{const url=URL.createObjectURL(file);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),300000);};

export function openProspectusIntake({state,productId='',role,showModal,closeModal,onSaved,onError}){
  let results=[],ticket=0;
  showModal('接收金市回传资料',`<div id="prospectusIntake"><div class="source-upload"><label class="btn primary">选择说明书<input id="prospectusFiles" type="file" accept=".pdf,.docx,.doc" ${productId?'':'multiple'}></label><p>选择金市回传的产品说明书，提取要素后与已复核申报、金市最终要素核对。校验通过后，进入发行管理制作通知和海报。支持可提取文字的PDF和.docx。</p><small>文件在当前浏览器读取，接收后保留原件及取数依据。</small></div><div id="prospectusResults"></div></div>`, '',true);
  const root=document.querySelector('#prospectusIntake');
  root.onchange=async event=>{
    if(event.target.id!=='prospectusFiles')return;
    const files=[...event.target.files],current=++ticket,host=root.querySelector('#prospectusResults');results=[];
    if(files.length>10){host.textContent='每次最多选择10份说明书。';return;}
    for(const [index,file]of files.entries()){
      host.textContent=`正在读取 ${index+1} / ${files.length}：${file.name}`;
      let result;try{result=await readProspectus(file);}catch(error){result={file,fields:{},errors:[error.message],warnings:[]};}
      if(current!==ticket||!root.isConnected)return;results.push(result);
    }
    host.innerHTML=results.map((result,index)=>{
      const matches=matchReturn(state,result),target=productId?matches.find(p=>p.id===productId):matches.length===1?matches[0]:null;
      const status=result.errors.length?'识别需处理':target?'已匹配待回传申报':matches.length>1?'多笔申报待确认':'未匹配待回传申报';
      return `<section class="source-result"><div class="source-result-title"><div><strong>${e(result.fields.name||result.file.name)}</strong><small>${e(result.file.name)}</small></div><span class="badge ${result.errors.length?'difference':target?'ready':'draft'}">${status}</span></div>
        ${result.errors.length?`<div class="source-issues" role="alert">${result.errors.map(e).join('<br>')}</div>`:`<div class="source-overview"><div><small>产品代码</small><b>${e(result.fields.marketNumber)}</b></div><div><small>募集期</small><b>${e(result.fields.start)} 至 ${e(result.fields.end)}</b></div><div><small>期限</small><b>${e(result.fields.tenor)} 天</b></div></div><details><summary>识别结果及原文依据 · ${Object.keys(result.fields).length} 项</summary><div class="table-wrap"><table class="source-extracted"><thead><tr><th>字段</th><th>识别值</th><th>取数依据</th></tr></thead><tbody>${Object.entries(result.fields).map(([key,value])=>`<tr><td>${e(labels[key]||key)}</td><td>${e(value)||'不适用'}</td><td><small>${location(result.evidence[key])} · ${e(result.evidence[key]?.reason)}</small><br>${e(result.evidence[key]?.quote)}</td></tr>`).join('')}</tbody></table></div></details>
        <div class="source-extra-facts">${result.extras.risk?`风险等级：${e(result.extras.risk)}　`:''}${result.extras.saleStart?`交易时间：${e(result.extras.saleStart)}—${e(result.extras.saleEnd)}；末日截止 ${e(result.extras.lastClose||'未识别')}<br>`:''}${result.extras.purchaseChannels?`购买渠道：${e(result.extras.purchaseChannels)}`:''}</div>${result.warnings.length?`<div class="source-issues">${result.warnings.map(e).join('<br>')}</div>`:''}
        <div class="source-return-action"><span>${target?`对应申报：${e(target.id)}`:'请先确认对应申报已复核并进入金市办理。识别文件不会自动创建或通过申报。'}</span><div class="flex"><button type="button" class="btn" data-source-open="${index}">查看原件</button>${target&&role==='manager'?`<button type="button" class="btn primary" data-source-return="${index}" data-product-id="${e(target.id)}">核对回传</button>`:''}</div></div>`}</section>`;
    }).join('');
  };
  root.onclick=event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-source-open'))original(results[Number(b.dataset.sourceOpen)].file);
    if(b.hasAttribute('data-source-return'))returnPanel(results[Number(b.dataset.sourceReturn)],b.dataset.productId);
  };
  function returnPanel(result,id){
    const p=state.products.find(p=>p.id===id),fields=sourceFields(p);
    const input=(key,value,attr='')=>`<input aria-label="${e(labels[key]||key)}${attr==='market'?' 金市最终值':' 说明书人工核对'}" data-return-${attr}="${key}" value="${e(value)}" ${['start','end','value','maturity','observeStart','observeEnd'].includes(key)?'type="date"':''}>`;
    showModal('核对金市回传',`<div id="prospectusReturn"><p class="source-return-note"><strong>${e(result.file.name)}</strong><br>金市最终值已预填复核申报值，请按金市最终回传逐项核对。说明书列独立保留识别值；未识别字段需经人工核实补充，不会自动沿用申报值。</p>
      <div class="table-wrap"><table class="source-review"><thead><tr><th>字段</th><th>已复核申报</th><th>金市最终值</th><th>说明书要素</th><th>来源</th></tr></thead><tbody>${fields.map(([key,label])=>{
        const identified=Object.hasOwn(result.fields,key),ev=result.evidence[key];
        return `<tr><td>${label}</td><td>${e(p.approved[key]??'')||'—'}</td><td>${input(key,key==='marketNumber'?(p.marketNumber||result.fields.marketNumber):p.approved[key]??'','market')}</td><td>${identified?e(result.fields[key])||'不适用':input(key,'','manual')}</td><td><small>${identified?location(ev):'需人工填写'}</small>${ev?`<details><summary>原文</summary><p>${e(ev.quote)}</p><small>${e(ev.reason)}</small></details>`:''}</td></tr>`;
      }).join('')}</tbody></table></div>${result.warnings.length?`<p class="source-issues">${result.warnings.map(e).join('<br>')}</p>`:''}
      <label class="checkbox-line source-confirm"><input id="returnReviewed" type="checkbox">已核对金市最终要素、说明书原文及人工补充字段</label><div id="returnError" class="source-issues" role="alert"></div></div>`,
      '<button type="button" class="btn" id="sourceOriginal">查看原件</button><button type="button" class="btn primary" id="acceptProspectus">接收并进入一致性校验</button>',true);
    const panel=document.querySelector('#prospectusReturn');document.querySelector('#sourceOriginal').onclick=()=>original(result.file);
    document.querySelector('#acceptProspectus').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        const market=Object.fromEntries([...panel.querySelectorAll('[data-return-market]')].map(input=>[input.dataset.returnMarket,input.value]));
        const document={...result.fields,...Object.fromEntries([...panel.querySelectorAll('[data-return-manual]')].map(input=>[input.dataset.returnManual,input.value]))};
        const payload={market,document,result,role,confirmed:panel.querySelector('#returnReviewed').checked};
        validateReturn(state,id,payload);const source=await storeOriginal(result);applyReturn(state,id,payload,source);closeModal();onSaved(id);
      }catch(error){panel.querySelector('#returnError').textContent=error.message;button.disabled=false;onError(error.message);}
    };
  }
}
