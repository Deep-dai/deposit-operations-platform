// Pure extraction rules. Text is evidence, never an instruction or executable content.
const compact=text=>String(text??'').normalize('NFKC').replace(/\s+/g,'').replace(/：/g,':');
const datePattern='(20\\d{2})年(\\d{1,2})月(\\d{1,2})日';
const iso=match=>`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const normalizeName=value=>compact(value).replace(/[（]/g,'(').replace(/[）]/g,')');
export function parseProspectus(pages){
  const normalized=pages.map(p=>({...p,text:compact(p.text)}));
  const all=normalized.map(p=>p.text).join('\n'),fields={},evidence={},warnings=[],errors=[],extras={};
  const mainAt=all.indexOf('三、产品基本要素'),endAt=all.indexOf('四、投资团队',mainAt);
  if(mainAt<0)return {fields,evidence,extras,warnings,errors:['未找到“产品基本要素”，请确认是每期产品说明书，而非通用协议或扫描图片。']};
  const basic=all.slice(mainAt,endAt<0?undefined:endAt);
  function set(key,value,quote,reason='原文识别'){
    fields[key]=value;
    const page=normalized.find(p=>p.text.includes(quote));
    evidence[key]={page:page?.page??null,quote,reason};
  }
  const names=[...new Set([...all.matchAll(/乐赢[^，。,;:()【】]*?结构性存款[A-Z]+\d+期/g)].map(m=>m[0]))];
  const codes=[...new Set([...all.matchAll(/产品编[码号](?:为|:)?(P\d{2}[A-Z]+\d+)/g)].map(m=>m[1]))];
  if(names.length!==1)errors.push(names.length?'文件出现多个产品名称，不能自动归属单只产品。':'未识别到完整产品名称。');
  else {set('name',names[0],names[0]);const family=names[0].match(/乐赢(智信|慧信)/)?.[1];if(family)set('family',family,names[0],'名称包含产品系列');}
  if(codes.length!==1)errors.push(codes.length?'文件中的产品代码不一致，请核对风险揭示书与说明书。':'未识别到产品代码。');else set('marketNumber',codes[0],codes[0]);
  const ranges=[...basic.matchAll(new RegExp(datePattern+'(?:到|至|[-—~])'+datePattern,'g'))];
  if(ranges.length===1){set('start',iso(ranges[0]),ranges[0][0]);set('end',iso([null,...ranges[0].slice(4,7)]),ranges[0][0]);}
  else errors.push('未能唯一确定募集起始日和结束日。');
  const tenor=basic.match(/收益计算天数(\d+)天/);if(tenor)set('tenor',Number(tenor[1]),tenor[0]);
  // Dates can precede a vertically centered left-column label in PDF extraction.
  const dates=[...basic.matchAll(new RegExp(datePattern,'g'))];
  for(const [key,label] of [['value','收益起计日'],['maturity','到期日']]){
    const at=basic.indexOf(label);
    if(at>=0){const distance=m=>m.index>=at+label.length?m.index-at-label.length:at-m.index-m[0].length;const candidates=dates.filter(m=>Math.abs(m.index-at)<100).sort((a,b)=>distance(a)-distance(b));
      if(candidates.length)set(key,iso(candidates[0]),candidates[0][0],`以“${label}”定位日期，需核对原文`);}
  }
  for(const [key,label] of [['observeStart','期初价格'],['observeEnd','联系标的观察日']]){
    const match=basic.match(new RegExp(label+':'+datePattern));if(match)set(key,iso([null,...match.slice(1,4)]),match[0]);
  }
  const underlying=basic.match(/联系标的((?:欧元|澳元|美元|英镑|日元|人民币|瑞士法郎|加元)\/(?:欧元|澳元|美元|英镑|日元|人民币|瑞士法郎|加元)|黄金)/);
  if(underlying)set('underlying',underlying[1].replace('/','兑'),underlying[0]);
  const currency=basic.match(/本金与收益币种均为(人民币|美元)/);if(currency)set('currency',currency[1],currency[0]);
  const min=basic.match(/初始认购金额不低于([\d.]+)(万元|元)/);
  if(min){set('minimum',String(Number(min[1])*(min[2]==='万元'?10000:1)),min[0],'统一换算为元');set('minimumUnit','元',min[0],'统一换算为元');}
  const quota=basic.match(/计划募集金额为(?:人民币|美元)?([\d.]+)(亿元|万元|元)/);
  if(quota)set('quota',String(Number(quota[1])*({'亿元':10000,'万元':1,'元':.0001}[quota[2]])),quota[0],'计划募集金额换算为万元，是否等同本次额度须核对');
  if(quota)warnings.push('说明书列明的是计划募集金额，已换算为万元；请核对其与金市最终产品额度的口径。');
  const risk=basic.match(/R([1-5])级\(([^)]+)\)/);if(risk){extras.risk=`R${risk[1]}${risk[2]}`;extras.riskEvidence={page:normalized.find(p=>p.text.includes(risk[0]))?.page??null,quote:risk[0]};}
  const rateSection=basic.slice(basic.indexOf('结构性存款利率确定方式'),basic.indexOf('购买渠道')<0?undefined:basic.indexOf('购买渠道'));
  const rateMatches=[...rateSection.matchAll(/产品年化收益率(?:定方式)?为(?:预期(?:最高|最低)收益率)?([\d.]+)%/g)];
  const rates=[...new Map(rateMatches.filter(m=>Number.isFinite(Number(m[1]))).map(m=>[Number(m[1]),m[1]])).values()].sort((a,b)=>Number(a)-Number(b));
  if(rates.length>=2&&rates.length<=3){
    set('low',rates[0],rateMatches.find(m=>m[1]===rates[0])[0],'从收益率确定方式读取，不取触发条件比例');
    set('high',rates.at(-1),rateMatches.find(m=>m[1]===rates.at(-1))[0],'从收益率确定方式读取，不取触发条件比例');
    if(rates.length===3)set('mid',rates[1],rateMatches.find(m=>m[1]===rates[1])[0]);else set('mid','',rateMatches[0][0],'确定方式仅识别两档收益');
  }else if(rates.length>3)errors.push('收益档位超过当前支持的三档，不能直接套用当前产品要素，请单独核对。');
  else warnings.push('未能完整识别收益档位，请按收益率确定方式手工核对；不会用收益区间或触发比例代填。');
  const time=basic.match(/本产品交易时间为(\d{1,2}):(\d{2})[-—](\d{1,2}):(\d{2})/);
  if(time){extras.saleStart=time[1].padStart(2,'0')+':'+time[2];extras.saleEnd=time[3].padStart(2,'0')+':'+time[4];}
  const last=basic.match(/募集期最后一天交易截止时间为(\d{1,2}):(\d{2})/);if(last)extras.lastClose=last[1].padStart(2,'0')+':'+last[2];
  const channel=basic.match(/购买渠道(.+?)(?:质押条款|税收条款|费用)/);if(channel){extras.purchaseChannels=channel[1];extras.channelPage=normalized.find(p=>p.text.includes(channel[1]))?.page??null;warnings.push('说明书购买渠道需与本次发行通知渠道核对，不自动扩展为全部渠道。');}
  for(const [key,label]of Object.entries({name:'产品名称',marketNumber:'产品代码',start:'募集起始日',end:'募集结束日',value:'起息日',maturity:'到期日',tenor:'期限'}))if(!own(fields,key))warnings.push(`未识别字段：${label}`);
  if(fields.value&&fields.maturity&&fields.tenor&&Math.round((Date.parse(fields.maturity)-Date.parse(fields.value))/86400000)!==Number(fields.tenor))errors.push('说明书期限与起息日、到期日间隔不一致，请核对。');
  return {fields,evidence,extras,warnings,errors};
}
