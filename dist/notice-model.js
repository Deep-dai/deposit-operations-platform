import {clone,compare,dateValid,now} from './core.js';

export const NOTICE_VERSION=1;
export const COMMON_ATTACHMENTS=[
  '中信银行结构性存款产品总协议（适用于个人客户）（2.0版，2022年）（电子银行版）',
  '中信银行结构性存款产品总协议（适用于个人客户）（2.0版，2022年）（网点版）',
  '中信银行个人客户风险评估问卷'
];
// Template wording follows the supplied issuance notice. References are editable template content.
export const NOTICE_PARAGRAPHS={
  intro:'我行将于近期发行{产品范围}，上述产品将在核心系统发行，采用通用凭证以及客户总协议书、客户风险评估问卷及风险揭示书等相关销售文本。具体销售要求详见总行{制度依据}文。请分行严格按照总行要求做好营销工作。现将有关发行安排具体通知如下：',
  schedule:'总行将发行{产品范围}。销售时间均为每日{销售开始}至{销售结束}（募集期最后一天交易截止时间为{末日截止}），产品介绍详见产品说明书。',
  marketing:'总行{发文单位}统一组织此次结构性存款产品销售，分行应严格按照产品销售流程开展销售工作，具体包括以下几方面内容：',
  quota:'总行将在系统中统一设置额度。',
  promotion:'总行授权分行视业务开展情况，自行制作、印发相关结构性存款产品宣传材料。分行制作、印发结构性存款产品宣传材料，需在相关宣传材料正式印发前向总行进行报备，并严格遵照银保监会〔2018〕第6号及银保监办发〔2019〕204号文、总行{制度依据}文等相关制度的要求，风险揭示完全，不得进行广告误导，宣传口径要与总行保持一致。',
  reporting:'1.分行应遵照银保监会〔2018〕第6号文及总行{制度依据}文的要求将相关产品发行材料向银行业监督管理机构报告。',
  printing:'2.协议书和产品说明请自行印制，不作重要空白凭证管理，协议书版本参见附件。'
};
export const PARAGRAPH_LABELS={intro:'通知引言',schedule:'发行安排',marketing:'营销要求引言',quota:'额度分配和维护',promotion:'营销宣传',reporting:'报告要求',printing:'销售文本要求'};

export function noticeConfig(issue){
  const saved=issue.notice?.config||{};
  return {title:'',addressee:'各分行零售银行部',issuer:'财富管理部',date:'',
    rule:'信银规章〔2025〕343号',saleStart:'08:00',saleEnd:'17:30',lastClose:'21:00',
    channels:'柜面、网银、手机银行、智慧柜台。',region:'上述产品将在全行发售。',
    ...clone(saved),paragraphs:{...NOTICE_PARAGRAPHS,...clone(saved.paragraphs||{})},
    commonAttachments:clone(saved.commonAttachments??COMMON_ATTACHMENTS)};
}

export function noticeRows(state,issue){
  if(!issue.productIds.length)throw Error('本次发行没有产品');
  return issue.productIds.map(id=>{
    const p=state.products.find(p=>p.id===id);
    if(!p?.prospectus||!['ready','issued'].includes(p.status)||!compare(p).length||compare(p).some(r=>!r.ok))throw Error('产品尚未通过一致性校验，不能生成通知');
    const v=p.prospectus,code=v.marketNumber||p.marketNumber||p.market?.marketNumber;
    if(!code)throw Error(`${v.name}缺少产品代码，请核对金市回传资料`);
    if(v.marketNumber&&p.marketNumber&&v.marketNumber!==p.marketNumber)throw Error(`${v.name}的说明书产品代码与回传代码不一致`);
    if(!v.name?.trim()||!dateValid(v.start)||!dateValid(v.end)||v.start>v.end)throw Error('说明书中的产品名称或募集日期不完整');
    return {id,name:v.name,code,start:v.start,end:v.end,...(p.prospectusSource?{sourceId:p.prospectusSource.id,purchaseChannels:p.prospectusSource.extras?.purchaseChannels||''}:{})};
  });
}

export function productScope(rows){
  const codes=rows.map(r=>r.name.match(/([A-Z]+)(\d+)期/)?.slice(1));
  if(codes.every(Boolean)){
    const prefix=codes[0][0],width=codes[0][1].length;
    const nums=[...new Set(codes.map(c=>Number(c[1])))].sort((a,b)=>a-b);
    if(codes.every(c=>c[0]===prefix&&c[1].length===width)&&nums.length===rows.length&&nums.at(-1)-nums[0]===nums.length-1){
      const first=`${prefix}${String(nums[0]).padStart(width,'0')}`,last=`${prefix}${String(nums.at(-1)).padStart(width,'0')}`;
      return `结构性存款${first}${nums.length>1?'-'+last:''}期产品`;
    }
    return `结构性存款${[...new Set(codes.map(c=>c.join('')))].join('、')}期产品`;
  }
  return rows.length===1?rows[0].name:`${rows.length}款结构性存款产品`;
}
export const chineseDate=value=>dateValid(value)?`${Number(value.slice(0,4))}年${Number(value.slice(5,7))}月${Number(value.slice(8))}日`:'';
export const shortDate=value=>`${Number(value.slice(5,7))}月${Number(value.slice(8))}日`;
const clean=value=>String(value??'').trim();
export function buildNoticeDocument(state,issue,config=noticeConfig(issue)){
  const rows=noticeRows(state,issue),scope=productScope(rows);
  const values={'产品范围':scope,'制度依据':clean(config.rule),'发文单位':clean(config.issuer),
    '销售开始':config.saleStart,'销售结束':config.saleEnd,'末日截止':config.lastClose};
  const expand=text=>String(text??'').replace(/\{([^{}]+)\}/g,(all,key)=>values[key]??all);
  const body=Object.fromEntries(Object.entries(config.paragraphs).map(([key,text])=>[key,expand(text)]));
  return {version:NOTICE_VERSION,title:clean(config.title)||`关于发行${scope}的通知`,scope,
    addressee:clean(config.addressee).replace(/[：:]$/,''),issuer:clean(config.issuer),date:config.date,
    channels:clean(config.channels),region:clean(config.region),body,rows,
    attachments:[...config.commonAttachments.map(clean).filter(Boolean).map(name=>({name,kind:'common'})),
      ...rows.map(r=>({name:`${r.name}产品说明书及产品风险揭示书专页`,kind:'prospectus',productId:r.id}))],
    sourceFingerprint:JSON.stringify(rows)};
}
export function noticeText(doc){
  const b=doc.body;
  return [doc.title,'',`${doc.addressee}：`,b.intro,'一、产品发行安排及产品概况',b.schedule,
    ['产品代码','产品名称','募集起始日','募集结束日'].join('\t'),
    ...doc.rows.map(r=>[r.code,r.name,r.start,r.end].join('\t')),
    '二、发行渠道',doc.channels,'三、发行区域',doc.region,'四、营销要点',b.marketing,
    '（一）额度分配和维护',b.quota,'（二）营销宣传',b.promotion,'（三）其它要求',b.reporting,b.printing,
    '特此通知。','',...doc.attachments.map((a,index)=>`${index===0?'附件：':''}${index+1}.${a.name}`),
    '',doc.issuer,chineseDate(doc.date)].join('\n');
}
export function saveNotice(state,issue,config=noticeConfig(issue),{record=false}={}){
  if(issue.status!=='draft')throw Error('已下发通知不能修改');
  const document=buildNoticeDocument(state,issue,config);
  const savedConfig=clone(config);
  if(issue.notice&&(issue.notice.config.channels!==config.channels||issue.notice.document.sourceFingerprint!==document.sourceFingerprint))savedConfig.channelReviewed=false;
  issue.notice={version:NOTICE_VERSION,config:savedConfig,document};issue.material=noticeText(document);
  issue.confirmed=false;delete issue.noticeSnapshot;
  if(record)issue.history.unshift({time:now(),action:'保存发行通知',note:`依据金市回传说明书要素，纳入 ${document.rows.length} 只产品及 ${document.attachments.length} 项附件`});
  return document;
}
export function noticeErrors(state,issue){
  if(!issue.notice)return [];
  const config=noticeConfig(issue),doc=issue.notice.document,errors=[];
  if(!doc)return ['请先生成发行通知'];
  try{if(JSON.stringify(noticeRows(state,issue))!==doc.sourceFingerprint)errors.push('回传资料已变化，请按最新说明书重新生成通知');}catch(e){errors.push(e.message);}
  if(!config.addressee.trim()||!config.issuer.trim())errors.push('请填写主送单位和发文单位');
  if(!dateValid(config.date))errors.push('请填写有效的成文日期');
  for(const [key,label] of [['saleStart','销售开始时间'],['saleEnd','销售结束时间'],['lastClose','末日截止时间']])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(config[key]))errors.push(`请填写有效的${label}`);
  if(config.saleStart>=config.saleEnd||config.saleEnd>config.lastClose)errors.push('销售开始、销售结束和末日截止时间的先后关系不正确');
  if(!config.channels.trim()||!config.region.trim()||!config.rule.trim())errors.push('请补全发行渠道、区域及制度依据');
  if(doc.rows.some(r=>r.purchaseChannels)&&!config.channelReviewed)errors.push('请核对说明书购买渠道与本次发行通知渠道，并勾选确认');
  if(Object.values(config.paragraphs).some(v=>!String(v).trim()))errors.push('模板正文各段不能为空');
  if(Object.values(doc.body).some(v=>/\{[^{}]+\}/.test(v)))errors.push('模板正文包含无法填充的变量，请检查花括号中的字段名称');
  if(config.commonAttachments.some(name=>!name.trim()))errors.push('附件名称不能为空，请填写名称或移除该项');
  if(issue.material!==noticeText(doc))errors.push('通知正文与已保存版本不一致，请重新生成');
  return [...new Set(errors)];
}
export function assertNoticeReady(state,issue){const errors=noticeErrors(state,issue);if(errors.length)throw Error(errors[0]);}
export function noticeDocument(issue){return clone(issue.status==='sent'?(issue.noticeSnapshot||issue.notice?.document):issue.notice?.document);}
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function noticeHTML(doc){
  const e=escapeHTML,b=doc.body,paragraph=(text,cls='')=>`<p class="${cls}">${e(text)}</p>`;
  const heading=(text,secondary=false)=>`<h${secondary?3:2}>${text}</h${secondary?3:2}>`;
  return `<h1>${e(doc.title)}</h1>${paragraph(`${doc.addressee}：`,'notice-addressee')}${paragraph(b.intro)}
    ${heading('一、产品发行安排及产品概况')}${paragraph(b.schedule)}
    <table class="notice-product-table"><thead><tr><th>产品代码</th><th>产品名称</th><th>募集起始日</th><th>募集结束日</th></tr></thead><tbody>${doc.rows.map(r=>`<tr><td>${e(r.code)}</td><td>${e(r.name)}</td><td><time title="${e(r.start)}">${shortDate(r.start)}</time></td><td><time title="${e(r.end)}">${shortDate(r.end)}</time></td></tr>`).join('')}</tbody></table>
    ${heading('二、发行渠道')}${paragraph(doc.channels)}${heading('三、发行区域')}${paragraph(doc.region)}${heading('四、营销要点')}${paragraph(b.marketing)}
    ${heading('（一）额度分配和维护',true)}${paragraph(b.quota)}${heading('（二）营销宣传',true)}${paragraph(b.promotion)}${heading('（三）其它要求',true)}${paragraph(b.reporting)}${paragraph(b.printing)}${paragraph('特此通知。')}
    <div class="notice-attachments">${doc.attachments.map((a,index)=>`<p><span>${index===0?'附件：':''}</span><span>${index+1}.</span><span>${e(a.name)}</span></p>`).join('')}</div>
    <div class="notice-signoff">${paragraph(doc.issuer)}${paragraph(chineseDate(doc.date)||'〔请填写成文日期〕')}</div>`;
}
