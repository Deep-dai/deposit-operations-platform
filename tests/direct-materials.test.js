import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,eligible,createIssue,sendIssue,issueProductAvailability} from '../dist/core.js';
import {createDirectMaterials,directBatchErrors,issueProduct,materialFieldErrors} from '../dist/direct-materials.js';
import {saveNotice,noticeConfig,noticeErrors,noticeDocument} from '../dist/notice-model.js';
import {buildPosterModel,posterConfig} from '../dist/poster-model.js';
import {noticeDocx} from '../dist/notice-export.js';

function entry(n=1){
 const fields={name:`乐赢智信汇率挂钩人民币结构性存款T${10000+n}期`,marketNumber:`P26T${10000+n}`,family:'智信',currency:'人民币',underlying:'欧元兑美元',
  start:'2026-11-01',end:'2026-11-04',value:'2026-11-05',maturity:'2026-12-06',tenor:'31',low:'1.00',mid:'1.50',high:'1.90'};
 const hash=`fictional-source-${n}`,extras={risk:'R1低风险',saleStart:'08:00',saleEnd:'17:30',lastClose:'21:00',purchaseChannels:'柜面、手机银行'};
 return {fields:{...fields},result:{fields:{...fields},hash,errors:[],warnings:[],evidence:{high:{page:5,quote:'收益率1.90%'}},extras},source:{id:hash,hash,name:`fictional-${n}.pdf`,pages:5}};
}
test('上传说明书独立创建材料记录，原申报、系列与发行均不改变，不伪造复核快照',()=>{
 const state=seed(),before=clone(state),issue=createDirectMaterials(state,[entry(),entry(2)]);
 assert.equal(issue.mode,'materials');assert.equal(issue.materialProducts.length,2);
 assert.deepEqual(state.products,before.products);assert.deepEqual(state.series,before.series);assert.deepEqual(state.issues.slice(1),before.issues);
 assert.ok(issue.productIds.every(id=>!state.products.some(p=>p.id===id)));
 const p=issueProduct(state,issue,issue.productIds[0]);assert.equal(p.approved,undefined);assert.equal(p.status,undefined);assert.equal(eligible(p),false);
 assert.deepEqual(issueProductAvailability(state),issueProductAvailability(before));
});
test('直接材料复用通知与海报，通知可导出真正Word，不依赖申报一致性校验',async()=>{
 const state=seed(),issue=createDirectMaterials(state,[entry(),entry(2)]),config=noticeConfig(issue);
 assert.equal(config.saleStart,'08:00');config.date='2026-10-29';config.channelReviewed=true;
 saveNotice(state,issue,config);assert.deepEqual(noticeErrors(state,issue),[]);
 const doc=noticeDocument(issue);assert.equal(doc.rows.length,2);assert.equal(doc.rows[0].code,'P26T10001');
 assert.match(doc.title,/T10001-T10002/);assert.ok(doc.attachments.some(a=>a.productId===issue.productIds[1]));
 const blob=await noticeDocx(doc);assert.equal(Buffer.from(await blob.arrayBuffer()).subarray(0,2).toString(),'PK');
 const collection=buildPosterModel(state,issue);assert.equal(collection.products.length,2);assert.equal(collection.products[1].code,'P26T10002');assert.equal(collection.products[0].risk,'R1低风险');
 const single=buildPosterModel(state,issue,{...posterConfig(issue),template:'single',singleId:issue.productIds[1],consumerProtectionNumber:'XB-20261029-01'});
 assert.equal(single.products.length,1);assert.equal(single.products[0].code,'P26T10002');assert.equal(single.consumerProtectionNumber,'XB-20261029-01');
});
test('缺项、重复产品代码、重复原件、数量越界及原件缺失整批阻断且不写入半成品',()=>{
 for(const prepare of [()=>[],()=>[entry(),entry()],()=>{const a=entry(2);a.fields.marketNumber=entry().fields.marketNumber;return [entry(),a];},()=>{const a=entry();a.fields.maturity='';return [a];},()=>{const a=entry();a.source=null;return [a];},()=>Array.from({length:13},(_,i)=>entry(i+1))]){
  const state=seed(),before=clone(state);assert.throws(()=>createDirectMaterials(state,prepare()));assert.deepEqual(state,before);
 }
 assert.ok(materialFieldErrors({...entry().fields,mid:'-1'}).length);
 assert.ok(materialFieldErrors({...entry().fields,maturity:'2026-02-30'}).length);
});
test('保留原文提取值与人工补充值，允许补齐缺项但不接受多产品混装或不支持的收益结构',()=>{
 const state=seed(),input=entry();delete input.result.fields.underlying;input.result.errors=['未识别到完整产品名称。'];input.fields.name='人工核实产品名称';
 const issue=createDirectMaterials(state,[input]),p=issue.materialProducts[0];assert.equal(p.extractedFields.name,entry().fields.name);assert.equal(p.fields.name,'人工核实产品名称');
 assert.ok(p.source.manualFields.includes('name'));assert.ok(p.source.manualFields.includes('underlying'));assert.equal(p.source.evidence.high.page,5);
 for(const message of ['文件出现多个产品名称，不能自动归属单只产品。','文件中的产品代码不一致，请核对风险揭示书与说明书。','收益档位超过当前支持的三档，不能直接套用当前产品要素，请单独核对。']){
  const input=entry();input.result.errors=[message];assert.ok(directBatchErrors([input]).includes('第1份：'+message));
 }
});
test('直接制作材料无法下发或进入申报产品发行，旧流程的差异阻断仍有效',()=>{
 const state=seed(),issue=createDirectMaterials(state,[entry()]);issue.material='通知';issue.confirmed=true;const before=clone(state);
 assert.throws(()=>sendIssue(state,issue.id,['北京分行']),/仅供下载/);assert.deepEqual(state,before);
 assert.throws(()=>createIssue(state,issue.productIds,'不可混入普通发行'),/一致性校验/);
 const p=state.products.find(p=>p.status==='difference');assert.throws(()=>createIssue(state,[p.id],'有差异产品'),/一致性校验/);
 assert.throws(()=>createDirectMaterials(state,[entry()],{role:'reviewer'}),/产品经理/);
});
test('销售时间未识别或多份不一致时留空待填，产品来源变更使旧通知失效',()=>{
 const state=seed(),a=entry(),b=entry(2);b.result.extras.saleStart='09:00';delete b.result.extras.lastClose;
 const issue=createDirectMaterials(state,[a,b]),config=noticeConfig(issue);assert.equal(config.saleStart,'');assert.equal(config.lastClose,'');assert.equal(config.saleEnd,'17:30');
 config.date='2026-10-29';saveNotice(state,issue,config);assert.ok(noticeErrors(state,issue).some(e=>e.includes('销售开始时间')));
 config.saleStart='08:00';config.lastClose='21:00';config.channelReviewed=true;saveNotice(state,issue,config);assert.deepEqual(noticeErrors(state,issue),[]);
 issue.materialProducts[0].fields.name='后续修订名称';assert.ok(noticeErrors(state,issue).some(e=>e.includes('资料已变化')));
});
