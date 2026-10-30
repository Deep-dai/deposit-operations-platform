import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone} from '../dist/core.js';
import {OP_COLUMNS,ensureOperations,exampleRows,parseOperationGrid,operationErrors,operationGroups,briefStats,autoSummary,createOperation,updateOperation,sendOperation,operationView,visibleOperations,recommendedProducts} from '../dist/operations-model.js';

test('经营支持迁移只增加独立材料，三份示例完整且不改变原产品和发行',()=>{
 const state=seed(),before=clone(state);assert.equal(ensureOperations(state),true);assert.equal(state.operations.documents.length,3);
 assert.deepEqual(state.products,before.products);assert.deepEqual(state.series,before.series);assert.deepEqual(state.issues,before.issues);
 for(const doc of state.operations.documents)assert.deepEqual(operationErrors(doc.type,doc.rows),[]);
 state.operations.documents[0].title='保留本次修改';assert.equal(ensureOperations(state),false);assert.equal(state.operations.documents[0].title,'保留本次修改');
});
test('产品规划从真实合并区域展开类别及条件，不擅自填充未合并空值',()=>{
 const header=OP_COLUMNS.plan.map(c=>c[1]);header[3]='我行产品报价';
 const result=parseOperationGrid('plan',[header,['大额存单','一年期','TEST01','1.20%','20万元','名单制','分行额度内销售','可转让','是'],['','六个月','TEST02','1.10%','20万元','','','','']], [{s:{r:1,c:0},e:{r:2,c:0}},{s:{r:1,c:6},e:{r:2,c:6}}]);
 assert.deepEqual(result.errors,[]);assert.equal(result.rows[1].category,'大额存单');assert.equal(result.rows[1].quota,'分行额度内销售');assert.equal(result.rows[1].purchase,'');assert.equal(result.rows[0].highlight,true);assert.equal(result.rows[1].highlight,false);
});
test('经营报表读取双层表头、分组及负值，合计行不参与分行排名',()=>{
 const result=parseOperationGrid('brief',[
  ['分组','分行','月日均','','','','','年日均',''],['分组','分行','余额','日增','月增','年增','计划完成率','余额','年增'],
  ['第一组','北京分行',100,-.2,3,10,'108%',94,8],['第一组','上海分行',120,.1,4,12,'95%',114,9],['','全行',220,-.1,7,22,'101%',208,17]
 ],[{s:{r:0,c:2},e:{r:0,c:6}},{s:{r:0,c:7},e:{r:0,c:8}}]);
 assert.deepEqual(result.errors,[]);assert.equal(result.rows.length,2);assert.equal(result.rows[0].completion,108);assert.equal(result.rows[0].daily,-.2);assert.equal(result.rows[1].yearGrowth,9);assert.ok(result.warnings[0].includes('合计'));
 const stats=briefStats(result.rows);assert.equal(stats.balance,220);assert.equal(stats.achieved,1);assert.equal(stats.declined,1);assert.equal(stats.completion,undefined);
 assert.equal(operationGroups({type:'brief',rows:result.rows})[0].rows[0].branch,'北京分行');
});
test('缺少指标不补零，重复分行及复杂或矛盾到期收益阻止生成',()=>{
 const rows=exampleRows('brief');rows[0].daily='';assert.ok(operationErrors('brief',rows).some(e=>e.includes('不能为空')));rows[0].daily=0;rows[1].branch=rows[0].branch;assert.ok(operationErrors('brief',rows).some(e=>e.includes('重复')));
 const campaign=exampleRows('campaign');campaign[0].actual=2.5;assert.ok(operationErrors('campaign',campaign).some(e=>e.includes('收益区间')));campaign[0].actual=1.5;campaign[0].tier='高档';assert.ok(operationErrors('campaign',campaign).some(e=>e.includes('不一致')));
 const state=seed(),before=clone(state);assert.throws(()=>createOperation(state,'brief',rows));assert.deepEqual(state,before);
});
test('到期收益统计明确已标注范围，既不猜档位也不把预期收益当实际收益',()=>{
 const state=seed(),rows=exampleRows('campaign');rows[0].tier='';const doc=createOperation(state,'campaign',rows);
 assert.ok(doc.summary.includes('本次纳入8只'));assert.ok(doc.summary.includes('已标注收益档位7只'));assert.ok(doc.summary.includes('占已标注产品'));
 doc.rows.forEach(r=>r.tier='');assert.ok(autoSummary(doc).includes('未标注'));assert.ok(!autoSummary(doc).includes('100.0%'));
});
test('下发保存独立版本，分行按接收对象查看，知识库单独下发也成功',()=>{
 const state=seed(),doc=createOperation(state,'plan',exampleRows('plan'));const before=clone(doc);
 assert.throws(()=>sendOperation(doc,[]),/请选择/);assert.deepEqual(doc,before);assert.throws(()=>sendOperation(doc,['未知对象']),/无效/);assert.deepEqual(doc,before);
 sendOperation(doc,['北京分行','总行知识库','北京分行']);assert.equal(doc.status,'sent');assert.equal(doc.recipients.length,2);
 const snapshot=clone(operationView(doc));doc.rows[0].quote='错误修改';assert.deepEqual(operationView(doc),snapshot);assert.throws(()=>updateOperation(doc,{title:'不能改'}),/不可编辑/);
 assert.equal(visibleOperations(state,'plan','branch','北京分行').length,1);assert.equal(visibleOperations(state,'plan','branch','上海分行').length,0);
 const another=createOperation(state,'brief',exampleRows('brief'));sendOperation(another,['总行知识库']);assert.equal(another.recipients[0].status,'sent');assert.equal(visibleOperations(state,'brief','branch','北京分行').length,0);
});
test('复核岗和分行不能创建、编辑及下发，标题日期等无效时不落库',()=>{
 const state=seed(),doc=createOperation(state,'plan',exampleRows('plan'));
 for(const role of ['reviewer','branch']){assert.throws(()=>createOperation(state,'plan',exampleRows('plan'),{},role),/产品经理/);assert.throws(()=>updateOperation(doc,{title:'修改'},role),/不可编辑/);assert.throws(()=>sendOperation(doc,['北京分行'],role),/不可下发/);}
 const before=clone(state);assert.throws(()=>createOperation(state,'plan',exampleRows('plan'),{date:'2026-02-30'}),/日期/);assert.deepEqual(state,before);
 assert.throws(()=>updateOperation(doc,{theme:'未知'}),/配色/);assert.throws(()=>updateOperation(doc,{title:''}),/标题/);
});
test('重点产品只使用已通过一致性校验的最终要素，并按材料保存副本',()=>{
 const state=seed(),available=recommendedProducts(state);assert.ok(available.length);const product=state.products.find(p=>p.id===available[0].id),doc=createOperation(state,'campaign',exampleRows('campaign'));
 const name=doc.recommendations[0].name;product.market.name='后续变更';assert.equal(doc.recommendations[0].name,name);assert.ok(!recommendedProducts(state).some(p=>p.id===product.id));
});
