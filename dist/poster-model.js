import {compare} from './core.js';

const copy = value => JSON.parse(JSON.stringify(value));
const filled = value => value !== '' && value !== null && value !== undefined;
export const POSTER_TEMPLATES = {single:'单产品海报',collection:'产品合集'};

export function posterConfig(issue) {
  const saved=issue.poster||{};
  const order=[...new Set([...(saved.order||[]),...issue.productIds])].filter(id=>issue.productIds.includes(id));
  return {template:POSTER_TEMPLATES[saved.template]?saved.template:(order.length===1?'single':'collection'),
    order, selectedIds:(saved.selectedIds||order).filter(id=>order.includes(id)),
    singleId:order.includes(saved.singleId)?saved.singleId:order[0],consumerProtectionNumber:String(saved.consumerProtectionNumber||''),supplements:copy(saved.supplements||{})};
}

export function rateText(product, separator='或') {
  return ['low','mid','high'].filter(key=>filled(product[key])).map(key=>{
    const value=Number(product[key]);
    if(!String(product[key]).trim()||!Number.isFinite(value)||value<0)throw Error('产品收益率无效，请核对最终要素');
    return `${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:20,useGrouping:false})}%`;
  }).join(separator);
}

export function posterDimensions(template,count,{consumerProtectionNumber=''}={}) {
  if(template==='single')return {width:1620,height:2880+(consumerProtectionNumber?64:0)};
  return {width:1080,height:640+428*count+264+(consumerProtectionNumber?48:0)};
}

export function buildPosterModel(state,issue,config=posterConfig(issue)) {
  if(issue.status==='sent'&&issue.posterSnapshot)return copy(issue.posterSnapshot);
  const consumerProtectionNumber=String(config.consumerProtectionNumber||'').trim();
  if(consumerProtectionNumber.length>60)throw Error('消保编号最多 60 字');
  const ids=config.template==='single'?[config.singleId]:config.order.filter(id=>config.selectedIds.includes(id));
  if(!ids.length)throw Error('请至少选择一只海报产品');
  if(ids.length>12)throw Error('单张合集最多放入 12 只产品，请分批选择');
  const products=ids.map(id=>{
    if(!issue.productIds.includes(id))throw Error('海报产品须属于本次发行');
    const p=state.products.find(product=>product.id===id);
    if(!p||!['ready','issued'].includes(p.status)||!compare(p).length||compare(p).some(row=>!row.ok))throw Error('产品尚未通过一致性校验，不能生成海报');
    const final=p.market, extra=config.supplements[id]||{};
    const product={id,name:final.name,code:p.marketNumber||final.marketNumber||'',family:final.family,
      currency:final.currency,underlying:final.underlying,tenor:final.tenor,
      start:final.start,end:final.end,value:final.value,maturity:final.maturity,
      low:final.low,mid:final.mid,high:final.high,
      hook:String(extra.hook??`挂钩${final.underlying}`).trim(),risk:String(extra.risk||'').trim()};
    if(!product.code)throw Error(`${product.name}缺少产品编号，请补全金市回传信息`);
    if(!rateText(product))throw Error(`${product.name}缺少收益率`);
    if(product.hook.length>40||product.risk.length>20)throw Error('挂钩说明最多 40 字，风险等级最多 20 字');
    return product;
  });
  const families=[...new Set(products.map(p=>p.family))];
  return {version:1,template:config.template,consumerProtectionNumber,seriesLabel:families.length===1?`乐赢${families[0]}系列`:'结构性存款系列',products,...posterDimensions(config.template,products.length,{consumerProtectionNumber})};
}

export function updatePosterConfig(issue,config) {
  if(issue.status!=='draft')throw Error('已下发海报不能修改');
  issue.poster=copy(config);
  issue.confirmed=false;
  delete issue.posterSnapshot;
}
