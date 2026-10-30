import {blankProduct,clone,COMPARE_FIELDS,days,BRANCHES} from './core.js';

const has=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const yuan=v=>Math.round(Number(v)*1000000); // 万元 -> integer cents, avoiding decimal addition drift.
const fromYuan=v=>v/1000000;
export const SALES_STAGES={closed:'销售完成',selling:'销售中',planned:'未开售',unknown:'暂无统计'};
export function rollingSalesRows(state,seriesId){
 const products=state.products.filter(p=>p.type==='rolling'&&p.seriesId===seriesId).sort((a,b)=>Number(a.period)-Number(b.period));
 const store=state.rollingSales||{records:[],flows:[]};
 return products.map(p=>{
  const r=store.records.find(r=>r.productId===p.id),inflows=store.flows.filter(f=>f.to===p.id),outflows=store.flows.filter(f=>f.from===p.id);
  const row={product:p,record:r||null,stage:r?.saleStage||'unknown',sales:null,incoming:null,fresh:null,sourceShare:null,due:null,outgoing:null,unretained:null,retention:null,
   incomingFrom:products.filter(x=>inflows.some(f=>f.from===x.id)),outgoingTo:products.filter(x=>outflows.some(f=>f.to===x.id)),outflows,inflows,outgoingStatus:r?.maturityStage==='not_due'?'not_due':'pending',issues:[]};
  if(!r)return row;
  if(has(r.sales))row.sales=Number(r.sales);
  const validLink=f=>{const from=products.find(x=>x.id===f.from),to=products.find(x=>x.id===f.to);return from&&to&&Number(to.period)>Number(from.period)&&store.flows.filter(x=>x.from===f.from&&x.to===f.to).length===1;};
  const validFlow=f=>validLink(f)&&has(f.amount)&&Number(f.amount)>=0&&['complete','in_progress'].includes(f.status);
  const sum=flows=>fromYuan(flows.reduce((n,f)=>n+yuan(f.amount),0));
  if(r.sourceStage==='complete'&&inflows.every(validFlow))row.incoming=sum(inflows);
  if(has(row.sales)&&has(row.incoming)){
   if(yuan(row.incoming)>yuan(row.sales))row.issues.push('承接上期金额大于本期销量');
   else{row.fresh=fromYuan(yuan(row.sales)-yuan(row.incoming));row.sourceShare=Number(row.sales)>0?Number(row.incoming)/Number(row.sales):null;}
  }
  if(r.maturityStage==='matured'&&has(r.due))row.due=Number(r.due);
  if(has(row.due)){
   if(outflows.length&&outflows.every(validFlow)){
    row.outgoing=sum(outflows);row.outgoingStatus=outflows.every(f=>f.status==='complete')?'complete':'in_progress';
    if(yuan(row.outgoing)>yuan(row.due))row.issues.push('流向下期金额大于本期到期本金');
    else{row.unretained=fromYuan(yuan(row.due)-yuan(row.outgoing));row.retention=Number(row.due)>0?Number(row.outgoing)/Number(row.due):null;}
   }else if(r.destinationStage==='complete'&&!outflows.length){row.outgoing=0;row.unretained=row.due;row.retention=Number(row.due)>0?0:null;row.outgoingStatus='complete';}
  }
  if(has(row.sales)&&Number(row.sales)<0)row.issues.push('销量不能为负数');
  if(has(row.due)&&Number(row.due)<0)row.issues.push('到期本金不能为负数');
  if(has(row.due)&&has(row.sales)&&yuan(row.due)>yuan(row.sales))row.issues.push('到期本金大于本期销量，请核对口径');
  if([...inflows,...outflows].some(f=>!validLink(f)||(!validFlow(f)&&has(f.amount))))row.issues.push('资金流向记录无效，请核对关联期次和金额');
  if(row.issues.length){row.sourceShare=null;row.retention=null;row.fresh=null;row.unretained=null;}
  return row;
 });
}
export function rollingSalesErrors(state){
 const errors=[];for(const series of state.series)for(const row of rollingSalesRows(state,series.id))errors.push(...row.issues.map(message=>`${series.id}第${row.product.period}期：${message}`));return errors;
}

// Independent fictional operating records. Existing application terms, approvals and issue records are preserved.
export function ensureRollingSales(state){
 if(state.rollingSales)return false;
 state.rollingSales={version:1,asOf:'2026-10-30',source:'内置经营统计',records:[],flows:[],exampleSeriesId:''};
 let seriesId='2026年经营A',suffix=1;while(state.series.some(s=>s.id===seriesId))seriesId='2026年经营A_'+(++suffix);
 const series={id:seriesId,name:'智信滚存经营系列',family:'智信',structure:'三元',currency:'人民币',underlying:'欧元兑美元',status:'active',created:'2026-07-01',note:'按期次查看产品安排、销售来源与到期本金承接情况。'};
 state.series.unshift(series);state.rollingSales.exampleSeriesId=series.id;
 const periods=[
  ['2026-07-01','2026-07-05','2026-07-06','2026-08-05',1000,1000,'closed','complete','matured'],
  ['2026-08-03','2026-08-05','2026-08-06','2026-09-04',1200,1200,'closed','complete','matured'],
  ['2026-09-02','2026-09-04','2026-09-07','2026-10-09',1400,1400,'closed','complete','matured'],
  ['2026-10-07','2026-10-09','2026-10-12','2026-11-06',1600,null,'closed','complete','not_due'],
  ['2026-10-29','2026-11-08','2026-11-09','2026-12-04',320,null,'selling','pending','not_due']
 ];
 const products=[];
 periods.forEach(([start,end,value,maturity,sales,due,saleStage,sourceStage,maturityStage],i)=>{
  let id=`SR-2026-SALES-${i+1}`,n=1;while(state.products.some(p=>p.id===id))id=`SR-2026-SALES-${i+1}_${++n}`;
  const p={...blankProduct('rolling'),id,name:`乐赢智信汇率挂钩人民币结构性存款G${10001+i}期`,seriesId,period:i+1,family:series.family,structure:series.structure,currency:series.currency,underlying:series.underlying,
   start,end,value,maturity,tenor:days(value,maturity),observeStart:value,observeEnd:maturity,low:'1.00',mid:'1.45',high:'1.85',cost:'1.68',quota:'2000',forecast:'1500',minimum:'10000',minimumUnit:'元',
   marketNumber:`P26G${10001+i}`,status:'issued',version:1,created:start+' 08:30',updated:start+' 11:00',history:[{time:start+' 11:00',actor:'产品经理',action:'发行材料已下发',note:'本期发行材料已下发分行'}]};
  p.approved=clone(p);delete p.approved.history;
  const terms=Object.fromEntries(COMPARE_FIELDS.map(([key])=>[key,p[key]??'']));p.market={...clone(terms),marketNumber:p.marketNumber};p.prospectus=clone(p.market);p.marketReturnSource={type:'preset',receivedAt:start+' 10:00'};
  state.products.push(p);products.push(p);
  let issueId=`FX-SALES-2026-${i+1}`,k=1;while(state.issues.some(issue=>issue.id===issueId))issueId=`FX-SALES-2026-${i+1}_${++k}`;
  state.issues.push({id:issueId,title:`智信滚存经营系列第${i+1}期产品发行`,productIds:[p.id],status:'sent',created:start+' 09:00',sentAt:start+' 11:00',material:`关于智信滚存经营系列第${i+1}期产品发行的通知\n\n各分行：\n本期产品：${p.name}，产品代码${p.marketNumber}。募集期为${start}至${end}，具体产品信息以说明书为准。`,confirmed:true,
   recipients:BRANCHES.map(name=>({name,type:'branch',status:'sent',time:start+' 11:00',read:false,attempts:1})),history:[{time:start+' 11:00',action:'下发成功',note:'发行材料已下发'}]});
  state.rollingSales.records.push({productId:p.id,sales,due,saleStage,sourceStage,maturityStage,destinationStage:maturityStage==='matured'?'complete':'pending',asOf:'2026-10-30'});
 });
 [700,900,980,null].forEach((amount,i)=>state.rollingSales.flows.push({id:`${seriesId}:FLOW:${i+1}`,from:products[i].id,to:products[i+1].id,amount,status:amount===null?'not_due':'complete'}));
 return true;
}
