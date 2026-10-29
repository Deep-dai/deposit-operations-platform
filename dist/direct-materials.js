import {clone,dateValid,days,now,uid} from './core.js';

export const isDirectMaterials=issue=>issue?.mode==='materials';
export const MATERIAL_FIELDS=[
 ['name','产品名称'],['marketNumber','产品代码'],['family','产品系列'],['currency','币种'],['underlying','挂钩标的'],
 ['start','募集起始日'],['end','募集结束日'],['value','起息日'],['maturity','到期日'],['tenor','期限（天）'],
 ['low','低档收益率（%）'],['mid','中档收益率（%）'],['high','高档收益率（%）']
];
const present=v=>v!==''&&v!==null&&v!==undefined&&String(v).trim()!=='';
export function materialFieldErrors(fields){
 const errors=[];
 for(const [key,label] of MATERIAL_FIELDS.filter(([key])=>!['family','low','mid','high'].includes(key)))if(!present(fields[key]))errors.push(`${label}不能为空`);
 for(const [key,label] of MATERIAL_FIELDS.filter(([key])=>['start','end','value','maturity'].includes(key)))if(present(fields[key])&&!dateValid(fields[key]))errors.push(`${label}不是有效日期`);
 if(dateValid(fields.start)&&dateValid(fields.end)&&fields.start>fields.end)errors.push('募集结束日不能早于募集起始日');
 if(dateValid(fields.end)&&dateValid(fields.value)&&fields.end>=fields.value)errors.push('起息日应晚于募集结束日');
 if(dateValid(fields.value)&&dateValid(fields.maturity)&&fields.value>=fields.maturity)errors.push('到期日应晚于起息日');
 if(present(fields.tenor)&&(!Number.isInteger(Number(fields.tenor))||Number(fields.tenor)<=0))errors.push('期限应为正整数');
 if(dateValid(fields.value)&&dateValid(fields.maturity)&&present(fields.tenor)&&Number(fields.tenor)!==days(fields.value,fields.maturity))errors.push('请核实期限与起息日、到期日的间隔天数');
 const rates=['low','mid','high'].filter(key=>present(fields[key])).map(key=>Number(fields[key]));
 if(!rates.length)errors.push('至少填写一档收益率');
 if(rates.some(v=>!Number.isFinite(v)||v<0))errors.push('收益率应为不小于零的数字');
 if(rates.some((v,i)=>i>0&&v<rates[i-1]))errors.push('收益率应按低、中、高非递减排列');
 if(present(fields.currency)&&!['人民币','美元'].includes(fields.currency))errors.push('币种请选择人民币或美元');
 if(String(fields.name||'').length>160)errors.push('产品名称最多160字');
 if(String(fields.marketNumber||'').length>60)errors.push('产品代码最多60字');
 return errors;
}
export const materialReadErrors=result=>result.error?[result.error]:(result.errors||[]).filter(message=>/多个产品名称|代码不一致|收益档位超过|未找到.*产品基本要素/.test(message));
export function directBatchErrors(entries){
 const errors=[];
 if(!entries.length)errors.push('请上传至少一份产品说明书');
 if(entries.length>12)errors.push('每次最多上传12份产品说明书');
 const codes=new Set(),hashes=new Set();
 for(const [index,entry]of entries.entries()){
  const prefix=`第${index+1}份：`;
  errors.push(...materialReadErrors(entry.result).map(message=>prefix+message));
  if(entry.result.error)continue;
  errors.push(...materialFieldErrors(entry.fields).map(message=>prefix+message));
  const code=String(entry.fields.marketNumber||'').trim().toUpperCase();
  if(code&&codes.has(code))errors.push(prefix+'产品代码与本批其他产品重复');
  if(code)codes.add(code);
  if(!entry.result.hash)errors.push(prefix+'说明书原件标识缺失，请重新上传');
  else if(hashes.has(entry.result.hash))errors.push(prefix+'说明书原件重复上传');
  hashes.add(entry.result.hash);
 }
 return errors;
}
export function createDirectMaterials(state,entries,{title='',role='manager'}={}){
 if(role!=='manager')throw Error('请切换至产品经理');
 const errors=directBatchErrors(entries);if(errors.length)throw Error(errors[0]);
 if(entries.some(e=>!e.source?.id||e.source.hash!==e.result.hash||e.source.id!==e.result.hash))throw Error('说明书原件尚未保存，请重新上传');
 const products=entries.map(entry=>{
  const fields=Object.fromEntries(MATERIAL_FIELDS.map(([key])=>[key,String(entry.fields[key]??'').trim()]));
  const extracted=clone(entry.result.fields||{});
  return {id:uid('MP'),fields,extractedFields:extracted,source:{...clone(entry.source),extras:clone(entry.result.extras||{}),evidence:clone(entry.result.evidence||{}),
   manualFields:MATERIAL_FIELDS.map(([key])=>key).filter(key=>String(fields[key])!==String(extracted[key]??''))}};
 });
 const issue={id:uid('MC'),mode:'materials',title:String(title).trim()||`结构性存款发行材料（${products.length}只产品）`,
  productIds:products.map(p=>p.id),materialProducts:products,status:'draft',created:now(),material:'',confirmed:false,recipients:[],
  history:[{time:now(),action:'创建材料制作记录',note:`上传${products.length}份产品说明书，用于制作通知和海报`}]};
 issue.poster={template:products.length===1?'single':'collection',order:[...issue.productIds],selectedIds:[...issue.productIds],singleId:issue.productIds[0],consumerProtectionNumber:'',
  supplements:Object.fromEntries(products.map(p=>[p.id,{risk:p.source.extras.risk||''}]))};
 state.issues.unshift(issue);return issue;
}
// Display adapter only: no application, approval snapshot or workflow status is fabricated.
export function issueProduct(state,issue,id){
 if(!isDirectMaterials(issue))return state.products.find(p=>p.id===id);
 const product=issue.materialProducts?.find(p=>p.id===id);
 if(!product||!issue.productIds.includes(id))throw Error('未找到本次材料的产品信息');
 return {id,name:product.fields.name,marketNumber:product.fields.marketNumber,market:product.fields,prospectus:product.fields,prospectusSource:product.source,materialOnly:true};
}
export function directNoticeRows(issue){
 if(!issue.productIds.length)throw Error('请先上传产品说明书');
 return issue.productIds.map(id=>{
  const p=issueProduct(null,issue,id),errors=materialFieldErrors(p.prospectus);
  if(errors.length)throw Error(errors[0]);
  const f=p.prospectus;
  return {id,name:f.name,code:f.marketNumber,start:f.start,end:f.end,sourceId:p.prospectusSource.id,purchaseChannels:p.prospectusSource.extras?.purchaseChannels||''};
 });
}
export function directNoticeDefaults(issue){
 const shared=key=>{const values=issue.materialProducts.map(p=>p.source.extras?.[key]||'');return values.length&&values.every(v=>v&&v===values[0])?values[0]:'';};
 return {saleStart:shared('saleStart'),saleEnd:shared('saleEnd'),lastClose:shared('lastClose')};
}
