import {clone,uid,now,BRANCHES,KNOWLEDGE_BASE,dateValid,compare} from './core.js';

export const OP_TYPES={plan:{name:'月度产品规划',section:'产品规划管理',route:'planning',unit:'只产品'},brief:{name:'经营通报',section:'经营推动管理',route:'briefs',unit:'家分行'},campaign:{name:'营销素材',section:'经营推动管理',route:'campaigns',unit:'只到期产品'}};
export const OP_COLUMNS={
 plan:[['category','产品大类'],['term','期限'],['code','产品代码'],['quote','产品报价'],['minimum','起存金额'],['purchase','购买限制'],['quota','额度限制'],['note','补充说明'],['highlight','重点产品']],
 brief:[['group','分组'],['branch','分行'],['balance','月日均余额'],['daily','月日均日增'],['monthly','月日均月增'],['annual','月日均年增'],['completion','计划完成率（%）'],['yearBalance','年日均余额'],['yearGrowth','年日均年增']],
 campaign:[['name','产品名称'],['code','产品代码'],['maturity','到期日'],['low','低档收益率（%）'],['mid','中档收益率（%）'],['high','高档收益率（%）'],['actual','实际到期年化收益率（%）'],['tier','实际收益档位']]
};
const present=v=>v!==''&&v!==null&&v!==undefined&&String(v).trim()!=='';
export const opNumber=(v,digits=2)=>Number(v).toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true});
export const opRate=v=>`${Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:8,useGrouping:false})}%`;
export const opPercent=v=>`${Number(v).toLocaleString('zh-CN',{maximumFractionDigits:8,useGrouping:false})}%`;
const normalize=v=>String(v??'').normalize('NFKC').replace(/[\s（）()%]/g,'').replace(/\(.*?\)/g,'');
const aliases={quote:['我行产品报价','报价','参考年化收益率','利率'],purchase:['购买条件'],quota:['额度安排'],highlight:['是否重点'],group:['组别'],branch:['机构','分行名称'],completion:['计划完成率','月日均计划完成率'],actual:['到期年利率','实际到期收益率','实际年化收益率'],tier:['到期收益档位'],minimum:['起点金额']};
const numeric={brief:['balance','daily','monthly','annual','completion','yearBalance','yearGrowth'],campaign:['low','mid','high','actual']};
const asNumber=v=>{if(!present(v))return '';const n=Number(String(v).replace(/[,，%％\s]/g,''));return Number.isFinite(n)?n:String(v);};

export function operationErrors(type,rows){
 const errors=[];
 if(!OP_TYPES[type])return ['材料类型无效'];
 if(!rows.length)return ['请上传数据或使用示例'];
 if(rows.length>80)return ['每次最多80条记录，请分批制作'];
 const unique=new Set();
 rows.forEach((r,i)=>{
  const required=type==='plan'?['category','term','quote','minimum']:type==='brief'?['branch',...numeric.brief]:['name','code','maturity','actual'];
  for(const key of required)if(!present(r[key]))errors.push(`第${i+1}条：${OP_COLUMNS[type].find(c=>c[0]===key)?.[1]||key}不能为空`);
  for(const key of numeric[type]||[])if(present(r[key])&&!Number.isFinite(Number(r[key])))errors.push(`第${i+1}条：${OP_COLUMNS[type].find(c=>c[0]===key)[1]}应为数字`);
  for(const [key,label] of OP_COLUMNS[type])if(String(r[key]??'').length>(['quota','purchase','note'].includes(key)?140:80))errors.push(`第${i+1}条：${label}文字过长，请精简`);
  if(type==='brief'){
   if(Number(r.balance)<0||Number(r.yearBalance)<0||Number(r.completion)<0)errors.push(`第${i+1}条：余额及计划完成率不能为负数`);
   if(unique.has(r.branch))errors.push(`第${i+1}条：分行重复`);unique.add(r.branch);
  }
  if(type==='campaign'){
   if(!dateValid(r.maturity))errors.push(`第${i+1}条：到期日请填写YYYY-MM-DD`);
   const rates=['low','mid','high'].filter(k=>present(r[k])).map(k=>Number(r[k]));
   if(rates.some((v,j)=>!Number.isFinite(v)||v<0||j>0&&v<rates[j-1]))errors.push(`第${i+1}条：收益档位须为非负数并按低、中、高排列`);
   if(Number(r.actual)<0||rates.length&&(Number(r.actual)<Math.min(...rates)||Number(r.actual)>Math.max(...rates)))errors.push(`第${i+1}条：实际收益率不在已填写的收益区间内，请核对`);
   if(r.tier&&!['低档','中档','高档','其他'].includes(r.tier))errors.push(`第${i+1}条：实际收益档位可填低档、中档、高档、其他，未知时留空`);
   if(r.tier&&['低档','中档','高档'].includes(r.tier)){
    const key={低档:'low',中档:'mid',高档:'high'}[r.tier];if(!present(r[key])||Number(r[key])!==Number(r.actual))errors.push(`第${i+1}条：实际收益档位与对应收益率不一致`);
   }
   if(unique.has(r.code))errors.push(`第${i+1}条：产品代码重复`);unique.add(r.code);
  }
 });
 return errors;
}

// Input is table data only; document text never supplies instructions.
export function parseOperationGrid(type,input,merges=[]){
 if(!OP_TYPES[type])throw Error('材料类型无效');
 if(input.length>300)throw Error('表格行数过多，请只保留本次材料所需数据');
 const grid=input.map(row=>[...row]),warnings=[];
 for(const m of merges){if(m.e.r-m.s.r>100||m.e.c-m.s.c>20)continue;for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++){grid[r]??=[];if(!present(grid[r][c]))grid[r][c]=grid[m.s.r]?.[m.s.c]??'';}}
 const columns=OP_COLUMNS[type],lookup=new Map(columns.flatMap(([key,label])=>[label,...(aliases[key]||[])].map(label=>[normalize(label),key])));
 let header=-1,map=[],skip=1;
 for(let i=0;i<Math.min(12,grid.length);i++){
  let candidate=grid[i].map(v=>lookup.get(normalize(v))||'');
  if(type==='brief'&&grid[i+1]){
   const combined=grid[i].map((v,c)=>lookup.get(normalize(String(v??'')+String(grid[i+1][c]??'')))||lookup.get(normalize(grid[i+1][c]))||candidate[c]);
   if(new Set(combined.filter(Boolean)).size>new Set(candidate.filter(Boolean)).size){candidate=combined;skip=2;}else skip=1;
  }
  if(new Set(candidate.filter(Boolean)).size>=Math.min(5,columns.length)&&candidate.includes(type==='plan'?'category':type==='brief'?'branch':'actual')){header=i;map=candidate;break;}
 }
 if(header<0)throw Error('未找到可识别的表头，请使用本页模板，或保留模板中的字段名称');
 if(map.filter(Boolean).length!==new Set(map.filter(Boolean)).size)throw Error('表头存在重复字段，请保留每个字段唯一一列');
 const rows=[];let group='未分组';
 for(let i=header+skip;i<grid.length;i++){
  const raw=grid[i],cells=raw.filter(present).map(v=>String(v).trim());if(!cells.length)continue;
  if(type==='brief'&&new Set(cells).size===1&&/^第.+组$/.test(cells[0])){group=cells[0];continue;}
  const row=Object.fromEntries(columns.map(([key])=>[key,'']));map.forEach((key,c)=>{if(key)row[key]=String(raw[c]??'').trim();});
  if(type==='brief'&&/^(?:全行|合计|总计|小计)$/.test(row.branch)){warnings.push(`第${i+1}行合计未纳入分行排序；汇总范围以导入分行为准。`);continue;}
  if(columns.filter(([key,label])=>normalize(row[key])===normalize(label)).length>=3)continue;
  if(type==='brief')row.group=row.group||group;
  for(const key of numeric[type]||[])row[key]=asNumber(row[key]);
  if(type==='plan')row.highlight=/^(?:是|1|重点|true)$/i.test(row.highlight);
  rows.push(row);
 }
 const errors=operationErrors(type,rows);return {rows,errors,warnings:[...new Set(warnings)]};
}

export function operationGroups(doc){
 const groups=new Map();for(const row of doc.rows){const key=doc.type==='plan'?row.category:row.group||'未分组';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups].map(([name,rows])=>({name,rows:doc.type==='brief'?[...rows].sort((a,b)=>Number(b.completion)-Number(a.completion)||Number(b.balance)-Number(a.balance)):rows}));
}
export function briefStats(rows){
 const sum=key=>Math.round(rows.reduce((total,r)=>total+Number(r[key]),0)*100)/100;
 return {count:rows.length,balance:sum('balance'),daily:sum('daily'),monthly:sum('monthly'),annual:sum('annual'),achieved:rows.filter(r=>Number(r.completion)>=100).length,declined:rows.filter(r=>Number(r.daily)<0).length};
}
export function autoSummary(doc){
 if(doc.type==='plan')return `本月纳入${doc.rows.length}只产品，覆盖${new Set(doc.rows.map(r=>r.category)).size}类产品。请结合客户资金期限和购买条件做好产品安排，重点关注标记产品的销售条件及额度限制。`;
 if(doc.type==='brief'){
  const s=briefStats(doc.rows),leaders=[...doc.rows].sort((a,b)=>Number(b.completion)-Number(a.completion)).slice(0,3).map(r=>r.branch).join('、');
  return `截至${doc.date}，本次纳入${s.count}家分行，月日均余额合计${opNumber(s.balance)}${doc.unit}，日增合计${opNumber(s.daily)}${doc.unit}，月增合计${opNumber(s.monthly)}${doc.unit}。计划完成率达到100%的分行${s.achieved}家，按计划完成率排序居前的为${leaders}。日增为负的分行${s.declined}家，请关注资金变动情况。`;
 }
 const labeled=doc.rows.filter(r=>['低档','中档','高档'].includes(r.tier)),higher=labeled.filter(r=>['中档','高档'].includes(r.tier));
 return `本次纳入${doc.rows.length}只到期产品，实际到期年化收益率为${opRate(Math.min(...doc.rows.map(r=>Number(r.actual))))}至${opRate(Math.max(...doc.rows.map(r=>Number(r.actual))))}。${labeled.length?`已标注收益档位${labeled.length}只，其中中、高档${higher.length}只，占已标注产品的${opNumber(higher.length/labeled.length*100,1)}%。`:'收益档位未标注，仅展示实际收益。'}统计范围以本次导入清单为准。`;
}
export function recommendedProducts(state){
 return state.products.filter(p=>['ready','issued'].includes(p.status)&&compare(p).length&&compare(p).every(row=>row.ok)).map(p=>({id:p.id,...clone(p.market),name:p.market.name,code:p.marketNumber||p.market.marketNumber}));
}
export function operationView(doc){return doc.status==='sent'&&doc.snapshot?doc.snapshot:doc;}
export function visibleOperations(state,type,role='manager',branch=BRANCHES[0]){return (state.operations?.documents||[]).filter(d=>(!type||d.type===type)&&(role!=='branch'||d.status==='sent'&&d.recipients?.some(r=>r.name===branch)));}
export function createOperation(state,type,rows,options={},role='manager'){
 if(role!=='manager')throw Error('请切换至产品经理');
 const errors=operationErrors(type,rows);if(errors.length)throw Error(errors[0]);
 const doc={id:uid('OP'),type,title:options.title||({plan:'月度存款产品规划',brief:'个人存款增长通报',campaign:'结构性存款到期表现与本周推荐'}[type]),date:options.date||'2026-10-30',month:options.month||'2026-11',unit:options.unit||'亿元',
  rows:clone(rows),source:options.source||'手工整理',theme:options.theme||'red',note:options.note||({plan:'产品条件以正式发行文件为准，请关注购买条件及额度限制。',brief:'计划完成率按导入报表口径展示；汇总及排序范围为本次导入分行。',campaign:'历史到期表现不代表未来收益；产品具体条款以正式说明书为准。'}[type]),
  recommendations:type==='campaign'?clone(options.recommendations||recommendedProducts(state).slice(0,3)):[],created:now(),updated:now(),status:'draft',recipients:[],history:[]};
 doc.summary=autoSummary(doc);updateOperation(doc,{title:doc.title,date:doc.date,month:doc.month,theme:doc.theme,note:doc.note,summary:doc.summary},role);state.operations??={version:1,documents:[]};state.operations.documents.unshift(doc);return doc;
}
export function updateOperation(doc,patch,role='manager'){
 if(role!=='manager'||doc.status!=='draft')throw Error('当前材料不可编辑');
 const allowed=['title','date','month','theme','summary','note'];
 for(const [key,v]of Object.entries(patch))if(!allowed.includes(key))throw Error('不支持的修改字段');
 if(patch.title!==undefined&&(!String(patch.title).trim()||String(patch.title).length>60))throw Error('材料标题须为1至60字');
 if(patch.summary!==undefined&&String(patch.summary).length>600)throw Error('摘要最多600字');
 if(patch.note!==undefined&&String(patch.note).length>280)throw Error('说明最多280字');
 if(patch.date!==undefined&&!dateValid(patch.date))throw Error('请填写有效数据日期');
 if(patch.month!==undefined&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(patch.month))throw Error('请填写有效规划月份');
 if(patch.theme!==undefined&&!['red','navy'].includes(patch.theme))throw Error('请选择有效配色');
 Object.assign(doc,patch,{updated:now()});return doc;
}
export function sendOperation(doc,recipients,role='manager'){
 if(role!=='manager'||doc.status!=='draft')throw Error('当前材料不可下发');
 const targets=[...new Set(recipients)];if(!targets.length)throw Error('请选择接收分行或总行知识库');
 if(targets.some(name=>!BRANCHES.includes(name)&&name!==KNOWLEDGE_BASE))throw Error('下发对象无效');
 const errors=operationErrors(doc.type,doc.rows);if(errors.length)throw Error(errors[0]);
 updateOperation(doc,{title:doc.title,date:doc.date,month:doc.month},role);
 doc.snapshot=clone(doc);doc.status='sent';doc.sentAt=now();doc.recipients=targets.map(name=>({name,type:name===KNOWLEDGE_BASE?'knowledge':'branch',status:'sent',time:doc.sentAt}));
 doc.history.push({time:doc.sentAt,action:'下发成功',recipients:targets});return doc;
}

export function exampleRows(type){
 if(type==='plan')return [
  ['大额存单','三年期','CD20261101','1.65%','20万元','名单制','分行额度内销售','可转让',true],
  ['大额存单','一年期','CD20261102','1.25%','20万元','','','可转让',false],
  ['大额存单','六个月','CD20261103','1.15%','20万元','','','可转让',false],
  ['专享定期','三年期','TD20261101','1.60%','1千元','非名单制','分行额度内销售','重点客户资金承接',true],
  ['专享定期','两年期','TD20261102','1.35%','1千元','','','',false],
  ['随心存','一年期','SC20261101','1.20%','1百元','','','',false],
  ['随心存','三个月','SC20261102','0.95%','1百元','','','',false],
  ['通知存款','七天','NC20261101','0.70%','5万元','','','专享版',false],
  ['结构性存款','一个月至六个月','—','按周定价','1万元','按产品说明书','以当期发行安排为准','普通产品',true],
  ['美元定期','六个月','FX20261101','2.40%','100美元','','','',false],
  ['美元定期','一年期','FX20261102','3.20%','5万美元','名单制','分行额度内销售','',true],
  ['欧元定期','一年期','FX20261103','1.50%','100欧元','','','',false],
  ['港币定期','六个月','FX20261104','1.30%','500港币','','','',false],
  ['英镑定期','一年期','FX20261105','2.60%','100英镑','','','',false]
 ].map(values=>Object.fromEntries(OP_COLUMNS.plan.map(([key],i)=>[key,values[i]])));
 if(type==='brief')return [
  ['第一组','上海分行',1124.8,1.26,16.3,96.2,108,1080.2,76.4],['第一组','北京分行',2468.3,.84,21.6,182.7,103,2392.4,151.6],['第一组','广州分行',1186.5,-.32,8.4,72.6,97,1154.6,69.2],['第一组','深圳分行',586.2,.28,6.1,48.3,95,558.1,42.7],
  ['第二组','杭州分行',906.4,.62,9.7,83.1,112,887.3,71.6],['第二组','南京分行',836.7,-.48,7.6,64.5,101,808.5,53.2],['第二组','苏州分行',468.2,.15,4.2,38.6,98,451.4,32.8],['第二组','武汉分行',628.5,-.24,5.7,42.8,92,604.2,37.5],
  ['第三组','宁波分行',265.8,.17,3.4,22.6,107,252.1,18.9],['第三组','南昌分行',218.6,.08,2.8,19.3,102,207.6,16.4],['第三组','西安分行',406.2,-.13,4.1,35.7,96,392.8,31.2],['第三组','天津分行',396.7,.06,3.2,26.4,94,382.1,21.5],
  ['第四组','海口分行',96.8,.03,1.2,12.4,111,91.6,10.2],['第四组','银川分行',78.4,-.02,.8,9.3,104,73.1,7.8],['第四组','厦门分行',118.6,-.07,.6,13.2,96,112.4,11.6],['第四组','贵阳分行',86.5,-.11,-1.2,8.6,82,79.8,6.4]
 ].map(values=>Object.fromEntries(OP_COLUMNS.brief.map(([key],i)=>[key,values[i]])));
 return Array.from({length:8},(_,i)=>({name:`乐赢智信${i<6?'汇率':'黄金'}挂钩人民币结构性存款K${71001+i}期`,code:`P26K${71001+i}`,maturity:`2026-10-${26+i%5}`,low:1,mid:i%3===0?1.5:1.45,high:1.85,actual:i===4?1.85:i%3===0?1.5:1.45,tier:i===4?'高档':'中档'}));
}
export function ensureOperations(state){
 if(state.operations)return false;
 state.operations={version:1,documents:[]};
 for(const type of ['campaign','brief','plan'])createOperation(state,type,exampleRows(type),{title:{plan:'2026年11月存款产品规划',brief:'全口径个人存款增长通报',campaign:'本周到期表现与重点产品推荐'}[type],source:'内置示例',date:'2026-10-30',month:'2026-11'});
 return true;
}
