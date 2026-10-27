import {blankProduct,clone,days} from './core.js';

// Synthetic product fixtures for the prototype, not current bank offers or quoted rates.
const BUNDLE='poster-products-20261026-v1';
const AVAILABLE_BUNDLE='available-products-20261027-v1';
export const COLLECTION_ISSUE_ID='FX-20261026-001';
const SERIES_ID='2026年C';
const CREATED='2026-10-26 09:30';
const addDays=(date,n)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
const definitions=[
  ['C09001','智信','三元','澳元兑美元',31,'1.00','1.45','1.85'],
  ['C09002','智信','三元','欧元兑英镑',36,'1.00','1.50','1.90'],
  ['C09003','智信','三元','黄金',63,'1.05','1.55','1.95'],
  ['C09004','智信','三元','欧元兑美元',92,'1.10','1.60','2.00'],
  ['C09005','智信','三元','黄金',94,'1.15','1.65','2.05'],
  ['C09006','智信','三元','美元兑日元',183,'1.20','1.70','2.10'],
  ['C09007','慧信','二元','澳元兑美元',185,'1.25','','2.15'],
  ['C09008','慧信','二元','黄金',273,'1.30','','2.20'],
  ['C09009','慧信','二元','欧元兑美元',366,'1.35','','2.25'],
  ['C09010','慧信','二元','英镑兑美元',30,'1.075','','1.875'],
  ['C09011','智信','三元','欧元兑美元',31,'1.05','1.60','1.90'],
  ['C09012','智信','三元','欧元兑美元',32,'1.10','1.65','1.95']
];

export function additionalProductFixtures() {
  const products=definitions.map(([code,family,structure,underlying,tenor,low,mid,high],index)=>{
    const rolling=index>=10,second=index===11;
    const value=second?'2026-12-03':'2026-11-02';
    const maturity=addDays(value,tenor);
    const category=underlying==='黄金'?'黄金':'汇率';
    const suffix=index===9?'（新客专享）':rolling?`（滚存第${index-9}期）`:'';
    const p={...blankProduct(rolling?'rolling':'ordinary'),
      id:`SB-20261026-${String(index+101).padStart(4,'0')}`,
      name:`乐赢${family}${category}挂钩人民币结构性存款${code}期${suffix}`,
      family,structure,underlying,start:second?'2026-11-26':'2026-10-26',end:addDays(value,-1),
      value,maturity,tenor:days(value,maturity),low,mid,high,cost:'1.70',quota:String(5000+index*1000),
      forecast:String(3500+index*500),minimum:'10000',minimumUnit:'元',
      seriesId:rolling?SERIES_ID:'',period:rolling?index-9:'',
      observeStart:rolling?value:'',observeEnd:rolling?addDays(maturity,-2):'',
      marketNumber:`P26${code}`,status:'ready',version:1,created:CREATED,updated:CREATED,
      fixtureBundle:BUNDLE,history:[]};
    const snapshot=clone(p);delete snapshot.history;
    p.approved=clone(snapshot);p.market=clone(snapshot);p.prospectus=clone(snapshot);
    p.history=[{time:CREATED,actor:'系统',action:'一致性校验',note:'申报、金市最终要素及说明书一致'},
      {time:CREATED,actor:'系统',action:'金市回传',note:'已回传产品最终要素及说明书'},
      {time:CREATED,actor:'产品复核岗',action:'复核通过',note:'同意本次申报'},
      {time:CREATED,actor:'产品经理',action:'提交复核',note:'申报版本 V1'}];
    return p;
  });
  const series={id:SERIES_ID,name:'智信月度滚存系列',family:'智信',structure:'三元',currency:'人民币',
    underlying:'欧元兑美元',status:'active',created:CREATED,note:'每期独立申报，按期衔接募集与起息安排。',fixtureBundle:BUNDLE};
  const title='10月末结构性存款产品发行';
  const issue={id:COLLECTION_ISSUE_ID,title,productIds:products.map(p=>p.id),status:'draft',created:CREATED,
    confirmed:false,recipients:[],fixtureBundle:BUNDLE,
    material:`关于${title}的通知\n\n各分行：\n本次发行产品共 ${products.length} 只，募集安排及产品要素如下。\n\n${products.map((p,index)=>`${index+1}. ${p.name}\n产品编号：${p.marketNumber}；期限：${p.tenor} 天\n募集日期：${p.start} 至 ${p.end}\n起息日：${p.value}；到期日：${p.maturity}\n预期年化收益率：${[p.low,p.mid,p.high].filter(rate=>rate!=='').map(rate=>rate+'%').join(' / ')}`).join('\n\n')}\n\n各项收益条件、观察规则及风险揭示以配套产品说明书为准。\n\n存款经营平台`,
    poster:{template:'collection',order:products.map(p=>p.id),selectedIds:products.map(p=>p.id),singleId:products[0].id,
      supplements:Object.fromEntries(products.map(p=>[p.id,{hook:`挂钩${p.underlying}${p.underlying==='黄金'?'':'即期汇率'}`,risk:''}]))},
    history:[{time:CREATED,action:'生成材料',note:'根据最终产品要素生成通知与海报'},
      {time:CREATED,action:'创建发行',note:`纳入 ${products.length} 只产品`}]};
  return {products,series,issue};
}

export function ensureAdditionalProducts(state) {
  if(state.dataMigrations?.includes(BUNDLE))return false;
  const {products,series,issue}=additionalProductFixtures();
  // Add only new records. Existing records and a user's edits are never overwritten.
  const collisions=products.some(p=>state.products.some(existing=>existing.id===p.id))||state.issues.some(i=>i.id===issue.id);
  if(collisions)return false;
  const sameSeries=state.series.find(s=>s.id===series.id);
  if(sameSeries){
    // A user may already have a C series. Give the added rolling products their own series.
    let n=1;while(state.series.some(s=>s.id===`${SERIES_ID}-${n}`))n++;
    series.id=`${SERIES_ID}-${n}`;
    for(const p of products.filter(p=>p.type==='rolling')){p.seriesId=series.id;for(const key of ['approved','market','prospectus'])p[key].seriesId=series.id;}
  }
  state.series.push(series);state.products.unshift(...products);state.issues.unshift(issue);
  state.dataMigrations=[...(state.dataMigrations||[]),BUNDLE];
  return true;
}

// A separate, unassigned pool keeps "new issuance" usable without changing existing batches.
export function availableProductFixtures(){
  const {products,series}=additionalProductFixtures(),created='2026-10-27 17:30';
  series.id='2026年D';series.name='智信接续滚存系列';series.created=created;series.fixtureBundle=AVAILABLE_BUNDLE;
  for(const [index,p]of products.entries()){
    const code=`D${10001+index}`,oldCode=`C${String(9001+index).padStart(5,'0')}`;
    for(const record of [p,p.approved,p.market,p.prospectus]){
      record.id=`SB-20261027-${String(index+201).padStart(4,'0')}`;
      record.name=record.name.replace(oldCode,code);
      record.marketNumber=`P26${code}`;
      record.created=created;record.updated=created;record.fixtureBundle=AVAILABLE_BUNDLE;
      if(record.type==='rolling')record.seriesId=series.id;
    }
    p.history.forEach(event=>event.time=created);
  }
  return {products,series};
}

export function ensureAvailableProducts(state){
  if(state.dataMigrations?.includes(AVAILABLE_BUNDLE))return false;
  const {products,series}=availableProductFixtures();
  // An ID collision never authorizes replacing a user's data.
  if(products.some(p=>state.products.some(existing=>existing.id===p.id)))return false;
  if(state.series.some(s=>s.id===series.id)){
    const base=series.id;let suffix=1;while(state.series.some(s=>s.id===`${base}-${suffix}`))suffix++;
    series.id=`${base}-${suffix}`;
    for(const p of products.filter(p=>p.type==='rolling'))for(const record of [p,p.approved,p.market,p.prospectus])record.seriesId=series.id;
  }
  state.products.unshift(...products);state.series.push(series);
  state.dataMigrations=[...(state.dataMigrations||[]),AVAILABLE_BUNDLE];
  return true;
}
