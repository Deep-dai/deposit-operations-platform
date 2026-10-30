import {rollingSalesRows,SALES_STAGES} from './rolling-sales.js';
import {escapeHTML as e} from './notice-model.js';

const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const money=v=>known(v)?Number(v).toLocaleString('zh-CN',{maximumFractionDigits:6}):'—';
const pct=v=>known(v)?(Number(v)*100).toLocaleString('zh-CN',{maximumFractionDigits:2})+'%':'—';
const names=products=>products.map(p=>`第${p.period}期`).join('、');
function sourceText(row,value){return row.issues.length?'待核对':known(value)?money(value):row.record?'待统计':'—';}
function outText(row){return row.issues.length?'待核对':row.outgoingStatus==='not_due'?'待到期':known(row.outgoing)?money(row.outgoing):row.record?'待统计':'—';}
function rateText(row){return row.issues.length?'待核对':row.outgoingStatus==='not_due'?'待到期':known(row.retention)?pct(row.retention):known(row.due)&&Number(row.due)===0?'不适用':row.record?'待统计':'—';}
function sourceBar(row){
 const ready=known(row.incoming)&&known(row.fresh)&&Number(row.sales)>0&&!row.issues.length;
 const part=ready?Math.max(0,Math.min(100,row.sourceShare*100)):0;
 const label=row.issues.length?'统计待核对':ready?`承接 ${pct(row.sourceShare)} · 新购 ${pct(1-row.sourceShare)}`:known(row.sales)&&Number(row.sales)===0?'暂无销量':row.record?'来源待统计':'暂无统计';
 return `<div class="sr-source-bar ${ready?'':'pending'}" role="img" aria-label="${e(label)}" title="${e(label)}"><i style="width:${part}%"></i></div><small>${e(label)}</small>`;
}
function rateBar(row){const ready=known(row.retention)&&!row.issues.length;return `<span class="sr-rate-value ${ready?'known':''}">${rateText(row)}</span>${ready?`<div class="sr-rate-bar" role="img" aria-label="承接率${pct(row.retention)}"><i style="width:${Math.max(0,Math.min(100,row.retention*100))}%"></i></div>`:''}${row.outgoingStatus==='in_progress'?'<small>统计中</small>':''}`;}
export function rollingSalesView(state,seriesId){
 const series=state.series.find(s=>s.id===seriesId),rows=rollingSalesRows(state,seriesId);
 if(!rows.some(r=>r.record))return `<div id="rollingSalesView"><div class="sr-empty"><p>本系列暂无销售与滚存统计</p>${state.rollingSales?.exampleSeriesId&&state.rollingSales.exampleSeriesId!==seriesId?`<a class="text-button" href="#series/${encodeURIComponent(state.rollingSales.exampleSeriesId)}/sales">查看智信滚存经营系列</a>`:''}</div></div>`;
 return `<div id="rollingSalesView"><div class="sr-sales-toolbar"><span>截至 ${e(state.rollingSales.asOf)} · 金额单位：${e(series.currency)}万元</span><div class="sr-legend"><span><i class="carry"></i>承接上期</span><span><i class="fresh"></i>新购</span></div></div><div class="sr-table-scroll" tabindex="0" aria-label="各期销售与滚存明细"><table class="sr-table"><thead><tr><th scope="col">期次 / 产品名称</th><th scope="col">本期销量</th><th scope="col">承接上期</th><th scope="col">新购金额</th><th scope="col">销售来源构成</th><th scope="col">到期本金</th><th scope="col">流向下期</th><th scope="col">承接率</th></tr></thead><tbody>${[...rows].reverse().map(row=>`<tr data-sales-product="${e(row.product.id)}"><td><div class="sr-period"><b>第${e(row.product.period)}期</b><span class="sr-stage ${e(row.stage)}">${e(SALES_STAGES[row.stage]||'暂无统计')}</span></div><a class="sr-product-name" href="#product/${encodeURIComponent(row.product.id)}">${e(row.product.name)}</a></td><td><strong>${money(row.sales)}</strong>${row.stage==='selling'?'<small>有效认购 · 销售中</small>':''}</td><td>${sourceText(row,row.incoming)}</td><td>${sourceText(row,row.fresh)}</td><td class="sr-source-cell">${sourceBar(row)}</td><td>${row.record?.maturityStage==='not_due'?'待到期':money(row.due)}<small>${e(row.product.maturity||'')}</small></td><td>${outText(row)}<small>${e(names(row.outgoingTo))}</small></td><td class="sr-rate-cell">${rateBar(row)}</td></tr>`).join('')}</tbody></table></div><div class="sr-method"><span>承接率 = 流向下期本金 ÷ 本期到期本金</span><details><summary>口径说明</summary><p>仅统计本金，不含收益。新购 = 本期销量 − 承接上期本金；销售中按有效认购统计，销售完成后按实销统计。新购不等同于全行新增存款，未转入下期也不代表资金流出行外。未到期、待统计和实际为零分别展示。</p></details></div></div>`;
}
export function mountRollingSales({seriesId}){
 const section=document.querySelector('#seriesProducts');if(!section)return;
 const productsPanel=section.querySelector('#seriesProductsPanel'),salesPanel=section.querySelector('#seriesSalesPanel');
 const tabs=()=>[...section.querySelectorAll('[data-series-view]')];
 const selectTab=mode=>{tabs().forEach(b=>{const on=b.dataset.seriesView===mode;b.classList.toggle('active',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;});productsPanel.hidden=mode!=='products';salesPanel.hidden=mode!=='sales';history.replaceState(null,'','#series/'+encodeURIComponent(seriesId)+(mode==='sales'?'/sales':''));};
 section.onclick=event=>{const tab=event.target.closest('[data-series-view]');if(tab)selectTab(tab.dataset.seriesView);};
 section.querySelector('.sr-view-tabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const list=tabs(),i=event.key==='Home'?0:event.key==='End'?1:(list.findIndex(t=>t.getAttribute('aria-selected')==='true')+1)%2;selectTab(list[i].dataset.seriesView);list[i].focus();};
}
