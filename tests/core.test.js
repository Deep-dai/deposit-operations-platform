import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,validate,createProduct,transition,compare,eligible,validateBatch,commitBatch,createIssue,sendIssue,KNOWLEDGE_BASE} from '../dist/core.js';
const fresh=()=>{const s=seed();const p=clone(s.products.find(p=>p.status==='review'&&p.type==='ordinary'));p.id='NEW';p.name='测试新产品';return {s,p};};
test('普通产品完整申报，角色控制及完整发行前状态',()=>{const {s,p}=fresh();const r=createProduct(s,p).product;assert.equal(r.status,'review');assert.throws(()=>transition(s,r.id,'approve'),/产品复核岗/);transition(s,r.id,'approve',{role:'reviewer'});assert.equal(r.status,'market');transition(s,r.id,'receive');assert.equal(r.status,'check');assert.equal(eligible(r),false);transition(s,r.id,'check');assert.equal(eligible(r),true);});
test('说明书差异阻断发行，修正回传后重新校验',()=>{const s=seed(),p=s.products.find(p=>p.status==='market');transition(s,p.id,'receive',{difference:true});transition(s,p.id,'check');assert.equal(p.status,'difference');assert.equal(eligible(p),false);assert.throws(()=>createIssue(s,[p.id],'异常产品发行'),/一致性/);assert.throws(()=>transition(s,p.id,'correct'),/反馈意见/);transition(s,p.id,'correct',{note:'请修正说明书高收益率'});assert.equal(p.status,'market');transition(s,p.id,'receive');transition(s,p.id,'check');assert.equal(p.status,'ready');});
test('业务调整必须重新复核且清空旧回传版本',()=>{const s=seed(),p=s.products.find(p=>p.status==='difference');transition(s,p.id,'revise',{note:'调整收益率'});assert.equal(p.approved,null);assert.equal(p.market,null);p.high='1.99';transition(s,p.id,'submit');assert.equal(p.status,'review');assert.equal(p.version,2);assert.equal(eligible(p),false);transition(s,p.id,'approve',{role:'reviewer'});assert.equal(p.approved.high,'1.99');});
test('退回必须有意见，修改后的申报可再次提交',()=>{const {s,p}=fresh();const r=createProduct(s,p).product;assert.throws(()=>transition(s,r.id,'return',{role:'reviewer'}),/退回意见/);transition(s,r.id,'return',{role:'reviewer',note:'核实日期'});assert.equal(r.status,'returned');transition(s,r.id,'submit');assert.equal(r.status,'review');assert.ok(r.history.some(h=>h.note==='核实日期'));});
test('日期关系、期限、金额均校验，非适用收益留空',()=>{const {s,p}=fresh();p.maturity='2026-02-30';p.quota='-1';const errors=validate(p,s);assert.ok(errors.some(e=>e.field==='maturity'));assert.ok(errors.some(e=>e.field==='quota'));p.maturity='2026-12-03';p.quota=1000;p.mid='';assert.deepEqual(validate(p,s),[]);p.tenor=5;assert.ok(validate(p,s).some(e=>e.field==='tenor'));});
test('滚存系列不得静默新增，共性字段必须匹配，期次不可重复',()=>{const s=seed(),p=clone(s.products.find(p=>p.type==='rolling'));p.seriesId='不存在';assert.ok(validate(p,s).some(e=>e.field==='seriesId'));p.seriesId='2026年A';assert.ok(validate(p,s).some(e=>e.field==='period'));p.period=99;p.currency='美元';assert.ok(validate(p,s).some(e=>e.field==='currency'));});
test('首期审核通过后才激活新系列',()=>{const {s,p}=fresh();const sid='2027年C';s.series.push({id:sid,status:'pending',family:p.family,structure:p.structure,currency:p.currency,underlying:p.underlying});Object.assign(p,{type:'rolling',seriesId:sid,period:1,firstPeriod:true,observeStart:p.value,observeEnd:p.maturity});const r=createProduct(s,p,{newSeries:true}).product;assert.equal(s.series.at(-1).status,'pending');transition(s,r.id,'approve',{role:'reviewer'});assert.equal(s.series.at(-1).status,'active');});
test('批量预览不落库；有错误时整批阻断；重试不重复导入',()=>{const {s,p}=fresh();const before=s.products.length;const second={...p,name:'批量第二只',quota:-1};let preview=validateBatch([p,second],s,'ordinary');assert.equal(s.products.length,before);assert.throws(()=>commitBatch(s,preview),/存在问题/);assert.equal(s.products.length,before);second.quota=1000;preview=validateBatch([p,second],s,'ordinary');assert.equal(commitBatch(s,preview).length,2);assert.equal(s.products.length,before+2);assert.throws(()=>commitBatch(s,preview),/存在问题/);});
test('同一批中重复产品与重复期次会被识别',()=>{const {s,p}=fresh();assert.ok(validateBatch([p,p],s,'ordinary')[1].errors.some(e=>e.field==='name'));const r={...s.products.find(p=>p.type==='rolling'),period:99};assert.ok(validateBatch([r,r],s,'rolling')[1].errors.some(e=>e.field==='period'));});
test('发行要求产品校验通过、材料已确认和接收对象，下发统一成功',()=>{const s=seed(),p=s.products.find(p=>p.status==='ready');const i=createIssue(s,[p.id],'测试发行');assert.throws(()=>createIssue(s,[p.id],'重复发行'),/已加入/);assert.throws(()=>sendIssue(s,i.id,['北京分行']),/确认/);i.material='发行通知';i.confirmed=true;assert.throws(()=>sendIssue(s,i.id,[]),/选择/);sendIssue(s,i.id,['北京分行','上海分行']);assert.equal(i.status,'sent');assert.ok(i.recipients.every(r=>r.status==='sent'));assert.equal(i.recipients[0].read,false);assert.equal(p.status,'issued');});

test('支持仅分行、仅总行知识库及混合下发，并保留接收对象类型',()=>{
 for(const targets of [['北京分行'],[KNOWLEDGE_BASE],['北京分行',KNOWLEDGE_BASE]]){
  const state=seed(),p=state.products.find(p=>p.status==='ready'),issue=createIssue(state,[p.id],'下发对象核验');issue.material='通知';issue.confirmed=true;
  sendIssue(state,issue.id,targets);assert.deepEqual(issue.recipients.map(r=>r.name),targets);assert.ok(issue.recipients.every(r=>r.status==='sent'));
  for(const r of issue.recipients)assert.equal(r.type,r.name===KNOWLEDGE_BASE?'knowledge':'branch');
  assert.equal(issue.history[0].action,'下发成功');assert.ok(issue.history[0].note.includes(targets.join('、')));
 }
});

test('无效接收对象不改变发行，重复勾选同一对象不会重复下发',()=>{
 const state=seed(),p=state.products.find(p=>p.status==='ready'),issue=createIssue(state,[p.id],'接收对象校验');issue.material='通知';issue.confirmed=true;
 const before=clone(state);assert.throws(()=>sendIssue(state,issue.id,['其他地址']),/无效/);assert.deepEqual(state,before);
 sendIssue(state,issue.id,[KNOWLEDGE_BASE,KNOWLEDGE_BASE]);assert.equal(issue.recipients.length,1);
});
test('错误状态不可跳跃，资料不完整不可发行',()=>{const s=seed(),p=s.products.find(p=>p.status==='draft');assert.throws(()=>transition(s,p.id,'check'),/当前状态/);p.status='ready';assert.equal(eligible(p),false);assert.equal(eligible(undefined),false);});
test('序列化保留工作流状态和历史，不改变已复核快照',()=>{const {s,p}=fresh();const r=createProduct(s,p).product;transition(s,r.id,'approve',{role:'reviewer'});r.name='不应改变快照';const persisted=JSON.parse(JSON.stringify(s));assert.equal(persisted.products[0].approved.name,'测试新产品');assert.equal(persisted.products[0].history.length,2);});
