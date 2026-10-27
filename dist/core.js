export const STATUS = {draft:'草稿',returned:'退回修改',review:'待复核',market:'金市办理中',check:'待一致性校验',difference:'差异待处理',ready:'待发行',issued:'已下发'};
export const ROLES = {manager:'产品经理',reviewer:'产品复核岗',branch:'分行用户'};
export const BRANCHES = ['北京分行','上海分行','广州分行','深圳分行','杭州分行','南京分行'];
export const RATE_KEYS = ['low','mid','high'];
export const COMMON_KEYS = ['family','structure','underlying','currency'];
export const COMPARE_FIELDS = [['name','产品名称'],['family','产品系列'],['structure','产品结构'],['currency','币种'],['underlying','挂钩标的'],['start','募集起始日'],['end','募集结束日'],['value','起息日'],['maturity','到期日'],['tenor','期限（天）'],['observeStart','期初观测日'],['observeEnd','到期观测日'],['low','低收益率（%）'],['mid','中收益率（%）'],['high','高收益率（%）'],['quota','额度（万元）'],['minimum','起存金额'],['minimumUnit','起存金额单位']];
export const LABELS = Object.fromEntries([...COMPARE_FIELDS,['forecast','预估销售金额（万元）'],['cost','投资成本（%）'],['seriesId','滚存系列号'],['period','滚存期次']]);
export const NORMAL_COLUMNS = [['name','产品名称'],['family','产品系列'],['structure','产品结构'],['currency','币种'],['underlying','挂钩标的'],['start','募集起始日'],['end','募集结束日'],['value','起息日'],['maturity','到期日'],['tenor','期限（天）'],['low','低收益率（%）'],['mid','中收益率（%）'],['high','高收益率（%）'],['cost','投资成本（%）'],['quota','产品额度（万元）'],['forecast','预估销售金额（万元）'],['minimum','起存金额'],['minimumUnit','起存金额单位']];
export const ROLLING_COLUMNS = [['seriesId','滚存系列号'],['period','滚存期次'],...NORMAL_COLUMNS.slice(0,10),['observeStart','期初观测日'],['observeEnd','到期观测日'],...NORMAL_COLUMNS.slice(10)];
export const clone = v => JSON.parse(JSON.stringify(v));
export const now = () => new Date().toLocaleString('sv-SE').slice(0,16);
export const uid = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
export const log = (p,action,note,role='manager') => p.history.unshift({time:now(),actor:ROLES[role]||role,action,note});
const present = x => x!=='' && x!==undefined && x!==null;
export function dateValid(d){ return /^\d{4}-\d{2}-\d{2}$/.test(d||'') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d; }
export function days(a,b){return Math.round((Date.parse(b)-Date.parse(a))/86400000);}
export function blankProduct(type='ordinary') {return {type,name:'',family:'智信',structure:'三元',currency:'人民币',underlying:'欧元兑美元',start:'',end:'',value:'',maturity:'',tenor:'',observeStart:'',observeEnd:'',low:'',mid:'',high:'',cost:'',quota:'',forecast:'',minimum:'',minimumUnit:'元',seriesId:'',period:'',notes:''};}
export function validate(p,state,{draft=false,newSeries=false,ignoreId=null}={}) {
 const errors=[]; const add=(field,message)=>errors.push({field,label:LABELS[field]||field,message});
 if(!String(p.name||'').trim()) add('name','请填写产品名称');
 if(draft) return errors;
 for(const k of ['family','structure','currency','underlying','start','end','value','maturity','tenor','quota','minimum','minimumUnit']) if(!present(p[k]))add(k,'不能为空');
 for(const k of ['start','end','value','maturity',...(p.type==='rolling'?['observeStart','observeEnd']:[])])if(!dateValid(p[k]))add(k,'请填写有效日期，格式 YYYY-MM-DD');
 if(dateValid(p.start)&&dateValid(p.end)&&p.start>p.end)add('end','募集结束日不能早于起始日');
 if(dateValid(p.end)&&dateValid(p.value)&&p.end>=p.value)add('value','起息日应晚于募集结束日');
 if(dateValid(p.value)&&dateValid(p.maturity)&&p.value>=p.maturity)add('maturity','到期日应晚于起息日');
 if(dateValid(p.value)&&dateValid(p.maturity)&&Number(p.tenor)!==days(p.value,p.maturity))add('tenor','期限须与起息日、到期日的间隔天数一致');
 for(const k of ['tenor','quota','minimum'])if(present(p[k])&&(!Number.isFinite(Number(p[k]))||Number(p[k])<=0))add(k,'应为大于 0 的数字');
 if(present(p.tenor)&&!Number.isInteger(Number(p.tenor)))add('tenor','应为整数');
 for(const k of ['low','mid','high','cost','forecast'])if(present(p[k])&&(!Number.isFinite(Number(p[k]))||Number(p[k])<0))add(k,'应为不小于 0 的数字');
 if(!RATE_KEYS.some(k=>present(p[k])))add('low','至少填写一档收益率');
 const rates=RATE_KEYS.filter(k=>present(p[k])).map(k=>Number(p[k]));
 if(rates.some((v,i)=>i>0&&v<rates[i-1]))add('high','已填写的收益率应按低、中、高非递减排列');
 if(!['人民币','美元'].includes(p.currency))add('currency','币种可选人民币、美元');
 if(!['元','万元'].includes(p.minimumUnit))add('minimumUnit','请选择元或万元，金额按所选币种解释');
 if(p.type==='rolling'){
   const s=state.series.find(s=>s.id===p.seriesId);
   if(!s&&!newSeries)add('seriesId','未找到系列，请先创建系列并完成首期复核');
   if(s&&s.status!=='active'&&!newSeries&&!p.firstPeriod)add('seriesId','该系列首期尚未复核通过');
   if(!Number.isInteger(Number(p.period))||Number(p.period)<1)add('period','期次须为正整数');
   if(state.products.some(x=>x.id!==ignoreId&&x.type==='rolling'&&x.seriesId===p.seriesId&&Number(x.period)===Number(p.period)))add('period','该系列已存在相同期次');
   if(s&&!newSeries)for(const k of COMMON_KEYS)if(String(p[k])!==String(s[k]))add(k,'须与所属系列的共性要素一致');
   if(dateValid(p.observeStart)&&dateValid(p.observeEnd)&&p.observeStart>p.observeEnd)add('observeEnd','到期观测日不能早于期初观测日');
   if(dateValid(p.observeEnd)&&dateValid(p.maturity)&&p.observeEnd>p.maturity)add('observeEnd','到期观测日不能晚于到期日');
 }
 if(p.type==='ordinary'&&state.products.some(x=>x.id!==ignoreId&&x.type==='ordinary'&&x.name===p.name&&x.value===p.value))add('name','相同名称及起息日的产品已存在，请在申报查询中继续办理');
 return errors;
}
const numericCompareKeys=new Set(['tenor','low','mid','high','quota']);
function comparisonValue(value,key){
 const raw=value[key]??'';
 if(raw===''||raw===null)return '';
 if(numericCompareKeys.has(key)&&String(raw).trim()&&Number.isFinite(Number(raw)))return Number(raw);
 if(key==='minimum'||key==='minimumUnit'){
  if(present(value.minimum)&&Number.isFinite(Number(value.minimum))&&['元','万元'].includes(value.minimumUnit))return Number(value.minimum)*(value.minimumUnit==='万元'?10000:1);
 }
 if(key==='name')return String(raw).replace(/\s/g,'');
 return String(raw);
}
export function compare(p){
 if(!p.approved||!p.market||!p.prospectus)return [];
 return COMPARE_FIELDS.filter(([k])=>p.type==='rolling'||!['observeStart','observeEnd'].includes(k)).map(([key,label])=>({key,label,a:p.approved[key]??'',b:p.market[key]??'',c:p.prospectus[key]??'',ok:comparisonValue(p.approved,key)===comparisonValue(p.market,key)&&comparisonValue(p.market,key)===comparisonValue(p.prospectus,key)}));
}
export function eligible(p){return !!(p && p.status==='ready' && p.approved && p.market && p.prospectus && compare(p).length>0 && compare(p).every(r=>r.ok));}
export function transition(state,id,action,{role='manager',note='',difference=false}={}){
 const p=state.products.find(x=>x.id===id); if(!p)throw Error('未找到申报');
 const must=(statuses,who)=>{if(!statuses.includes(p.status))throw Error('当前状态不能执行此操作');if(role!==who)throw Error(`请切换至${ROLES[who]}办理`);};
 if(action==='submit'){must(['draft','returned'],'manager');const errors=validate(p,state,{ignoreId:p.id});if(errors.length)throw Error(errors[0].message);p.status='review';p.version=(p.version||0)+1;p.market=null;p.prospectus=null;p.approved=null;log(p,'提交复核',`申报版本 V${p.version}`,role);}
 else if(action==='approve'){must(['review'],'reviewer');p.approved=clone(p);delete p.approved.history;p.status='market';log(p,'复核通过',note||'同意本次申报；已送交金市办理',role);if(p.firstPeriod){const s=state.series.find(x=>x.id===p.seriesId);s.status='active';}}
 else if(action==='return'){must(['review'],'reviewer');if(!note.trim())throw Error('请填写退回意见');p.status='returned';log(p,'退回修改',note,role);}
 else if(action==='receive'){must(['market'],'manager');p.market=clone(p.approved);p.prospectus=clone(p.approved);if(difference)p.prospectus.high=String((Number(p.approved.high||p.approved.low)+0.1).toFixed(2));p.marketNumber=`CP-${p.id.slice(-6)}`;p.status='check';log(p,'金市回传',difference?'已回传最终要素及含一处差异的说明书':'已回传最终要素及说明书');}
 else if(action==='check'){must(['check'],'manager');const diff=compare(p).filter(r=>!r.ok);if(!compare(p).length)throw Error('缺少比对资料');p.status=diff.length?'difference':'ready';log(p,'一致性校验',diff.length?`发现 ${diff.length} 项差异，已阻断材料生成`:'申报、金市最终要素及说明书一致');}
 else if(action==='correct'){must(['difference'],'manager');if(!note.trim())throw Error('请填写反馈意见');log(p,'反馈金市修正',note);p.status='market';p.market=null;p.prospectus=null;}
 else if(action==='revise'){must(['difference'],'manager');if(!note.trim())throw Error('请填写调整原因');p.status='returned';p.market=null;p.prospectus=null;p.approved=null;log(p,'业务要素调整',note+'；修改后须重新提交复核');}
 else throw Error('不支持的操作');
 if(p.prospectus===null)p.prospectusSource=null;
 p.updated=now(); return p;
}
export function createProduct(state,data,{draft=false,newSeries=false}={}){
 const errors=validate(data,state,{draft,newSeries}); if(errors.length)return {errors};
 const p={...clone(data),id:uid('SB'),status:draft?'draft':'review',version:draft?0:1,created:now(),updated:now(),history:[],market:null,prospectus:null,approved:null};
 log(p,draft?'保存草稿':'提交复核',newSeries?'滚存系列与首期产品一并办理':'新建产品申报');state.products.unshift(p);return {product:p,errors:[]};
}
export function validateBatch(rows,state,type){
 const working=clone(state);return rows.map((row,index)=>{const p={...blankProduct(type),...row,type};const errors=validate(p,working);working.products.push({...p,id:`preview-${index}`});return {product:p,row:index+2,errors};});
}
export function commitBatch(state,preview,draft=false){
 if(!preview.length)throw Error('没有可导入的记录');
 const checked=validateBatch(preview.map(r=>r.product),state,preview[0].product.type);if(checked.some(r=>r.errors.length))throw Error('数据存在问题或已导入，请重新检查');
 return checked.map(r=>createProduct(state,r.product,{draft}).product);
}
export function createIssue(state,ids,title){
 if(!title.trim()||!ids.length)throw Error('请填写发行名称并选择产品');
 const products=ids.map(id=>state.products.find(p=>p.id===id));
 if(products.some(p=>!p||!eligible(p)))throw Error('仅可选择已通过一致性校验的待发行产品');
 if(state.issues.some(i=>i.status==='draft'&&i.productIds.some(id=>ids.includes(id))))throw Error('所选产品已加入未完成的发行，请继续办理原发行');
 const issue={id:uid('FX'),title,productIds:ids,status:'draft',created:now(),material:'',confirmed:false,recipients:[],history:[{time:now(),action:'创建发行',note:`纳入 ${ids.length} 只产品`}]};state.issues.unshift(issue);return issue;
}
export function sendIssue(state,id,recipients,{simulateFailure=false}={}){
 const issue=state.issues.find(i=>i.id===id);if(!issue||issue.status!=='draft')throw Error('发行状态已变更');
 if(!issue.material||!issue.confirmed)throw Error('请生成并确认发行材料');
 if(!recipients.length)throw Error('请选择接收分行');
 if(issue.productIds.some(id=>!eligible(state.products.find(p=>p.id===id))))throw Error('产品当前不满足发行条件');
 issue.recipients=recipients.map((name,i)=>({name,status:simulateFailure&&i===recipients.length-1?'failed':'sent',read:false,time:now(),attempts:1}));issue.status='sent';issue.sentAt=now();
 issue.history.unshift({time:now(),action:'下发',note:`${recipients.length} 家分行，${issue.recipients.filter(r=>r.status==='failed').length} 家失败`});
 issue.productIds.forEach(id=>{const p=state.products.find(p=>p.id===id);p.status='issued';p.updated=now();log(p,'发行材料已下发',issue.title);});return issue;
}
function sample(n,status,type='ordinary',extra={}){
 const p={...blankProduct(type),id:`SB-202610-${String(n).padStart(4,'0')}`,name:`智信稳享 ${2026100+n} 期`,family:'智信',structure:'三元',currency:'人民币',underlying:'欧元兑美元',start:'2026-10-26',end:'2026-11-01',value:'2026-11-02',maturity:'2026-12-03',tenor:31,low:'1.05',mid:'1.65',high:'1.85',cost:'1.72',quota:'8000',forecast:'6000',minimum:'10000',minimumUnit:'元',status,version:1,created:'2026-10-22 09:30',updated:'2026-10-23 10:20',history:[{time:'2026-10-22 09:30',actor:'产品经理',action:'提交复核',note:'申报版本 V1'}],...extra};
 if(['market','check','difference','ready','issued'].includes(status)){p.approved=clone(p);delete p.approved.history;p.history.unshift({time:'2026-10-22 15:30',actor:'产品复核岗',action:'复核通过',note:''});}
 if(['check','difference','ready','issued'].includes(status)){p.market=clone(p.approved);p.prospectus=clone(p.approved);p.marketNumber=`CP-2026-${n}`;if(status==='difference')p.prospectus.high='1.95';p.history.unshift({time:'2026-10-23 09:10',actor:'系统',action:'金市回传',note:'回传最终要素与说明书'});}
 if(status==='returned')p.history.unshift({time:'2026-10-23 09:30',actor:'产品复核岗',action:'退回修改',note:'请核实募集安排，并补充产品说明。'});
 return p;
}
export function seed(){
 const state={schema:1,series:[{id:'2026年A',name:'智信短期滚存系列',family:'智信',structure:'三元',currency:'人民币',underlying:'欧元兑美元',status:'active',created:'2026-10-10',note:'共性要素沿用到各期产品。'},{id:'2026年B',name:'慧信稳享滚存系列',family:'慧信',structure:'二元',currency:'人民币',underlying:'黄金',status:'active',created:'2026-10-15',note:''}],products:[],issues:[]};
 state.products=[sample(8,'review','rolling',{name:'智信滚存 A 系列第 3 期',seriesId:'2026年A',period:3,observeStart:'2026-11-02',observeEnd:'2026-12-01'}),sample(7,'difference'),sample(6,'review'),sample(5,'returned'),sample(4,'market'),sample(3,'ready'),sample(2,'draft'),sample(1,'issued','rolling',{name:'智信滚存 A 系列第 1 期',seriesId:'2026年A',period:1,observeStart:'2026-11-02',observeEnd:'2026-12-01'}),sample(9,'ready','rolling',{name:'智信滚存 A 系列第 2 期',seriesId:'2026年A',period:2,observeStart:'2026-11-02',observeEnd:'2026-12-01'})];
 state.issues=[{id:'FX-202610-001',title:'10 月第四周结构性存款发行',productIds:['SB-202610-0001'],status:'sent',created:'2026-10-22 10:00',sentAt:'2026-10-23 09:00',material:'关于结构性存款产品发行的通知\n\n各分行：\n本次包含智信滚存 A 系列第 1 期。具体产品信息以配套说明书为准。\n\n',confirmed:true,recipients:BRANCHES.slice(0,4).map((name,i)=>({name,status:'sent',read:i===1,time:'2026-10-23 09:00',attempts:1})),history:[{time:'2026-10-23 09:00',action:'下发',note:'4 家分行下发成功，已读状态单独记录'}]}];return state;
}
