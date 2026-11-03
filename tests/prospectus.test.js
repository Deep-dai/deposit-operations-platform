import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProspectus} from '../dist/prospectus-parser.js';
import {applyReturn,validateReturn,matchReturn} from '../dist/prospectus-return.js';
import {seed,blankProduct,compare,transition,eligible,createIssue} from '../dist/core.js';
import {saveNotice,noticeConfig,noticeErrors,assertNoticeReady} from '../dist/notice-model.js';

// Fictional compact text fixture. Original user PDFs are intentionally not in the repository.
function pages(){return [{page:1,text:'本产品名称为乐赢智信汇率挂钩人民币结构性存款C00901期，产品编码为P26C00901'},
 {page:3,text:'三、产品基本要素\n产品名称 乐赢智信汇率挂钩人民币结构性存款 C00901 期\n产品编码 P26C00901\n收益计算天数 31 天\nR1 级（低风险）\n2026 年 10 月 01 日到 2026 年 10 月 04 日，募集期'},
 {page:4,text:'本产品交易时间为8：00-17：30；募集期最后一天交易截止时间为21：00。\n计划募集金额为人民币2亿元\n本产品本金与收益币种均为人民币，初始认购金额不低于1万元\n2026年10月05日 扣款日\n2026年10月05日 收益起计日\n2026年11月05日 到期日\n联系标的 澳元/美元\n期初价格:2026年10月06日\n联系标的观察日:2026年11月03日\n基础利率1.00000%\n收益区间1.00000%-1.90000%'},
 {page:5,text:'结构性存款利率确定方式如下：（1）期末价格大于期初价格的103.50%，产品年化收益率为预期最高收益率1.90000%；（2）期末价格在95.50%至103.50%之间，产品年化收益率定方式为1.50000%；（3）低于95.50%，产品年化收益率为预期最低收益率1.00000%。\n购买渠道 投资者可通过中信银行指定网点柜面等渠道购买本产品。\n质押条款 可质押\n四、投资团队'}];}
function fixture(){const result={...parseProspectus(pages()),hash:'fixture-hash'},state=seed(),fields={...result.fields,structure:'三元'};
 const p={...blankProduct(),...fields,id:'RETURN-TEST',status:'market',version:1,history:[],approved:{...fields,low:'1.00',mid:'1.50',high:'1.90',minimum:'1',minimumUnit:'万元'}};
 state.products.push(p);return {state,p,result,payload:{result,market:{...fields},document:{...fields},confirmed:true,role:'manager'},source:{id:'fixture-hash',hash:'fixture-hash',name:'fictional.pdf',pages:5}};}

test('识别产品基本要素，收益率不混入触发比例，观测日不套起息日',()=>{
 const result=parseProspectus(pages());assert.deepEqual(result.errors,[]);assert.equal(result.fields.name,'乐赢智信汇率挂钩人民币结构性存款C00901期');
 assert.equal(result.fields.start,'2026-10-01');assert.equal(result.fields.maturity,'2026-11-05');assert.equal(result.fields.observeStart,'2026-10-06');
 assert.equal(result.fields.low,'1.00000');assert.equal(result.fields.mid,'1.50000');assert.equal(result.fields.high,'1.90000');
 assert.equal(result.fields.minimum,'10000');assert.equal(result.fields.quota,'20000');assert.equal(result.fields.structure,undefined);
 assert.equal(result.evidence.mid.page,5);assert.equal(result.extras.risk,'R1低风险');assert.equal(result.extras.lastClose,'21:00');
});
test('通用协议、多个产品代码及日期期限矛盾均不能当作可接收的说明书',()=>{
 assert.ok(parseProspectus([{page:1,text:'中信银行结构性存款产品总协议'}]).errors.length);
 const multi=pages();multi[0].text+=' 产品编码P26C00902';assert.ok(parseProspectus(multi).errors.some(s=>s.includes('代码不一致')));
 const wrong=pages();wrong[1].text=wrong[1].text.replace('31 天','30 天');assert.ok(parseProspectus(wrong).errors.some(s=>s.includes('期限')));
});
test('自动滚存保留完整本期子产品名称，系列概述不替代本期要素或证据页码',()=>{
 const input=pages(),name='自动滚存2028F款12号-乐赢智信汇率挂钩人民币结构性存款C00901期';
 input[0].text=input[0].text.replace('乐赢智信汇率挂钩人民币结构性存款C00901期',name);
 input.splice(1,0,{page:2,text:'第一部分：产品概述\n二、产品基本要素\n产品名称 自动滚存2028F款\n产品联系标的 澳元/美元\n本产品于2028年01月01日到2028年12月31日运作。'});
 input[2].text=input[2].text.replace('乐赢智信汇率挂钩人民币结构性存款 C00901 期',name).replace('收益计算天数 31 天','收益计算天数31天，收益计算天数含收益起计日，不含到期日。');
 input[3].text=input[3].text.replace('本产品交易时间为8：00-17：30','本期子产品手机银行APP渠道交易时间为0:00-23:59');
 input[3].text=input[3].text.replace('2026年10月05日 收益起计日','收益起计日/起\n息日\n2026年10月05日（如调整募集期，则收益起计日相应调整）').replace('2026年11月05日 到期日','到期日\n2026年11月05日（受收益起计日及提前终止条款等约束）');
 input[4].text=input[4].text.replace('结构性存款利率确定方式','子产品收益率确定方式').replaceAll('产品年化收益率','子产品年化收益率');
 const result=parseProspectus(input);assert.deepEqual(result.errors,[]);assert.equal(result.fields.name,name);assert.equal(result.evidence.name.page,3);
 assert.equal(result.fields.value,'2026-10-05');assert.equal(result.fields.maturity,'2026-11-05');assert.equal(result.fields.mid,'1.50000');
 assert.equal(result.evidence.underlying.page,4);assert.equal(result.extras.saleStart,'00:00');assert.equal(result.extras.saleEnd,'23:59');
 input[0].text+=' 本期子产品名称为自动滚存2028G款12号-乐赢智信汇率挂钩人民币结构性存款C00901期';
 assert.ok(parseProspectus(input).errors.some(e=>e.includes('多个产品名称')));
});
test('按标的字段边界读取伦敦金及其他标的，保留原文名称与取数页码',()=>{
 for(const [row,expected] of [
  ['联系标的 伦敦金\n联系标的定义 伦敦黄金，表示为一盎司黄金的美元标价','伦敦金'],
  ['联系标的：伦敦黄金\n联系标的定义 黄金的美元报价','伦敦黄金'],
  ['联系标的：黄金\n联系标的定义 黄金价格','黄金'],
  ['挂钩标的：“伦敦金”\n挂钩标的定义 黄金的美元报价','伦敦金'],
  ['联系标的 新西兰元／美元','新西兰元兑美元'],
  ['挂钩标的：美元/日元','美元兑日元'],
  ['联系标的 中证测试指数','中证测试指数'],
  ['联系标的 伦敦金（XAU/USD）','伦敦金(XAU/USD)']
 ]){
  const input=pages();input[2].text=input[2].text.replace('联系标的 澳元/美元',row).replace('基础利率','如因节假日无法获得联系标的的定盘价格，则使用前一交易日的定盘价格。\n基础利率');
  const result=parseProspectus(input);assert.equal(result.fields.underlying,expected,row);
  assert.equal(result.evidence.underlying.page,4);assert.match(result.evidence.underlying.quote,/标的/);
  assert.equal(result.evidence.underlying.quote.includes('定义'),false);
 }
});
test('标的字段缺失、空值、未知边界或取值冲突时明确提示，不从名称、定义或收益情景猜测',()=>{
 for(const row of ['',
  '联系标的\n联系标的定义 伦敦黄金，表示为一盎司黄金的美元标价',
  '联系标的 待定\n联系标的定义 待金市确认',
  '联系标的 伦敦金。下面是其他内容',
  '联系标的 伦敦金\n联系标的定义 伦敦黄金\n联系标的 欧元/美元\n联系标的定义 欧元兑美元汇率'
 ]){
  const input=pages();input[0].text=input[0].text.replace('汇率挂钩','黄金挂钩');input[1].text=input[1].text.replace('汇率挂钩','黄金挂钩');
  input[2].text=input[2].text.replace('联系标的 澳元/美元',row).replace('基础利率','如因节假日无法获得联系标的的定盘价格，则使用前一交易日的定盘价格。\n基础利率');
  input[3].text=input[3].text.replace('（1）','（1）联系标的“伦敦金”');
  const result=parseProspectus(input);assert.equal(result.fields.underlying,undefined,row);assert.equal(result.evidence.underlying,undefined);
  assert.ok(result.warnings.includes('未识别字段：挂钩标的'));
  if(row.includes('欧元/美元'))assert.ok(result.warnings.some(message=>message.includes('多个不同取值')));
 }
 const noBoundary=pages();noBoundary[2].text=noBoundary[2].text.split('联系标的')[0]+'联系标的 伦敦金';
 assert.equal(parseProspectus(noBoundary).fields.underlying,undefined);
});
test('仅有收益区间时不擅自补齐中档收益，复杂档位也不套三档',()=>{
 const input=pages();input[3].text='购买渠道 网点等渠道 质押条款 可质押 四、投资团队';const result=parseProspectus(input);
 assert.equal(result.fields.low,undefined);assert.equal(result.fields.mid,undefined);assert.ok(result.warnings.some(s=>s.includes('收益档位')));
 const complex=pages();complex[3].text=complex[3].text.replace('购买渠道','产品年化收益率为1.60000%；购买渠道');assert.ok(parseProspectus(complex).errors.some(s=>s.includes('超过')));
});
test('本金及存款利息收益币种写法和起存金额可识别，缺项或冲突不从标的及名称代填',()=>{
 for(const phrase of ['本金及存款利息收益币种均为人民币','本金和利息收益币种为人民币','本金与收益币种均为美元']){
  const input=pages();input[2].text=input[2].text.replace('本金与收益币种均为人民币',phrase).replace('初始认购金额','起存金额');
  const result=parseProspectus(input);assert.equal(result.fields.currency,phrase.includes('美元')?'美元':'人民币');assert.equal(result.fields.minimum,'10000');assert.equal(result.evidence.currency.page,4);
 }
 const absent=pages();absent[2].text=absent[2].text.replace('本产品本金与收益币种均为人民币，','');const missing=parseProspectus(absent);
 assert.equal(missing.fields.currency,undefined);assert.ok(missing.warnings.includes('未识别字段：币种'));
 const conflicting=pages();conflicting[2].text+=' 本金及存款利息收益币种均为美元';const result=parseProspectus(conflicting);assert.equal(result.fields.currency,undefined);assert.ok(result.warnings.some(w=>w.includes('币种出现不同取值')));
});
test('公式型收益从明确的最低最高年化收益率读取区间，不把系数和触发比例作为中档',()=>{
 const input=pages();input[3].text='结构性存款利率确定方式如下：R=1.00000%+0.57000%×n/N，n为价格在97.97%与102.03%之间的天数。产品预期最低年化收益率为1.00000%，预期最高年化收益率为1.57%。购买渠道 手机银行 质押条款 可质押 四、投资团队';
 const result=parseProspectus(input);assert.deepEqual(result.errors,[]);assert.equal(result.fields.rateMode,'range');assert.equal(result.extras.rateMode,'range');assert.equal(result.fields.low,'1.00000');assert.equal(result.fields.high,'1.57');assert.equal(result.fields.mid,'');assert.equal(result.evidence.high.page,5);assert.equal(result.evidence.high.quote,'预期最高年化收益率为1.57%');
 const incomplete=pages();incomplete[3].text='结构性存款利率确定方式如下：R=1.00000%+0.57000%×n/N，预期最低年化收益率为1.00000%。购买渠道 手机银行 质押条款 可质押 四、投资团队';
 const missing=parseProspectus(incomplete);assert.equal(missing.fields.low,'1.00000');assert.equal(missing.fields.high,undefined);assert.ok(missing.warnings.some(w=>w.includes('未识别到明确列示的最高')));
 input[3].text=input[3].text.replace('购买渠道','另列预期最高年化收益率为1.60%。购买渠道');const conflict=parseProspectus(input);assert.equal(conflict.fields.high,undefined);assert.ok(conflict.warnings.some(w=>w.includes('最高年化收益率存在不同')));
});
test('分段收益包含公式浮动项时，保留明确上下限并标明浮动区间',()=>{
 const input=pages();input[3].text='结构性存款利率确定方式如下：若R≥120%，产品年化收益率为预期最高收益率4.7%；若100%<R<120%，产品年化收益率=预期最低收益率+0.21*(R-100%)=0.5%+0.21*(R-100%)；若R≤100%，产品年化收益率为预期最低收益率0.5%。购买渠道 网点 质押条款 可质押 四、投资团队';
 const r=parseProspectus(input);assert.equal(r.fields.rateMode,'range');assert.equal(r.fields.low,'0.5');assert.equal(r.fields.high,'4.7');assert.equal(r.fields.mid,'');assert.ok(r.warnings.some(w=>w.includes('公式浮动')));
});
test('数值精度、空值与起存单位比对正确，真实差异仍被识别',()=>{
 const {state,p,result,payload,source}=fixture();applyReturn(state,p.id,payload,source);
 assert.ok(compare(p).every(r=>r.ok));p.prospectus.low='';assert.equal(compare(p).find(r=>r.key==='low').ok,false);
 p.prospectus.low=0;assert.equal(compare(p).find(r=>r.key==='low').ok,false);p.prospectus.low='1.00000';p.prospectus.high='1.91';assert.equal(compare(p).find(r=>r.key==='high').ok,false);
 assert.equal(result.fields.high,'1.90000');
});
test('接收要求明确核对、匹配申报和保存原件，且不改写已复核申报',()=>{
 const {state,p,result,payload,source}=fixture(),approved=structuredClone(p.approved);assert.equal(matchReturn(state,result)[0].id,p.id);
 assert.throws(()=>validateReturn(state,p.id,{...payload,confirmed:false}),/核对/);
 assert.throws(()=>applyReturn(state,p.id,payload,null),/原件/);assert.equal(p.status,'market');
 assert.throws(()=>validateReturn(state,p.id,{...payload,role:'branch'}),/产品经理/);
 applyReturn(state,p.id,payload,source);assert.equal(p.status,'check');assert.deepEqual(p.approved,approved);assert.ok(p.prospectusSource.manualFields.includes('structure'));
 transition(state,p.id,'check');assert.equal(eligible(p),true);
});
test('回传差异阻断发行，通知渠道要求人工核对，修改渠道后再次确认',()=>{
 const {state,p,payload,source}=fixture();applyReturn(state,p.id,payload,source);p.market.high='1.95';transition(state,p.id,'check');assert.equal(p.status,'difference');assert.throws(()=>createIssue(state,[p.id],'错误发行'),/一致性/);
 const next=fixture();applyReturn(next.state,next.p.id,next.payload,next.source);transition(next.state,next.p.id,'check');
 const issue=createIssue(next.state,[next.p.id],'通知测试'),config={...noticeConfig(issue),date:'2026-10-01'};saveNotice(next.state,issue,config);
 assert.ok(noticeErrors(next.state,issue).some(s=>s.includes('渠道')));config.channelReviewed=true;saveNotice(next.state,issue,config);assert.doesNotThrow(()=>assertNoticeReady(next.state,issue));
 config.channels='仅柜面';saveNotice(next.state,issue,config);assert.ok(noticeErrors(next.state,issue).some(s=>s.includes('渠道')));
});
