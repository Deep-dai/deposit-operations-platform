import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,createIssue,sendIssue} from '../dist/core.js';
import {posterConfig,buildPosterModel,rateText,posterDimensions,updatePosterConfig} from '../dist/poster-model.js';

function fixture(){const state=seed();const issue=createIssue(state,['SB-202610-0003','SB-202610-0009'],'本期产品发行');return {state,issue};}
test('海报取一致性校验后的金市最终要素，不读未复核的工作副本',()=>{
 const {state,issue}=fixture();state.products.find(p=>p.id===issue.productIds[0]).name='未复核名称';
 const model=buildPosterModel(state,issue);assert.equal(model.products[0].name,'智信稳享 2026103 期');
 assert.equal(model.products[0].code,'CP-2026-3');assert.equal(model.products[0].risk,'');assert.equal(model.products[0].hook,'挂钩欧元兑美元');
});
test('收益率保留零值和原始精度，略过不适用档位，至少显示两位小数',()=>{
 assert.equal(rateText({low:0,mid:'',high:'1.5'}),'0.00%或1.50%');
 assert.equal(rateText({low:'1.00',mid:null,high:1.9},'/'),'1.00%/1.90%');
 assert.equal(rateText({low:'1.055',high:'1.875'}),'1.055%或1.875%');
 assert.throws(()=>rateText({low:'NaN'}),/无效/);
});
test('模板选择、合集筛选及排列顺序决定海报产品',()=>{
 const {state,issue}=fixture(),config=posterConfig(issue);config.order.reverse();
 assert.equal(buildPosterModel(state,issue,config).products[0].id,issue.productIds[1]);
 config.selectedIds=[issue.productIds[0]];assert.equal(buildPosterModel(state,issue,config).products.length,1);
 config.template='single';config.singleId=issue.productIds[1];assert.equal(buildPosterModel(state,issue,config).products[0].id,issue.productIds[1]);
 assert.deepEqual(posterDimensions('collection',6),{width:1080,height:3472});
});
test('空合集、越界产品及要素差异阻止生成',()=>{
 const {state,issue}=fixture(),config=posterConfig(issue);config.selectedIds=[];assert.throws(()=>buildPosterModel(state,issue,config),/至少/);
 config.template='single';config.singleId='other';assert.throws(()=>buildPosterModel(state,issue,config),/本次发行/);
 state.products.find(p=>p.id===issue.productIds[0]).prospectus.high='9.99';assert.throws(()=>buildPosterModel(state,issue),/一致性/);
});
test('补充说明按产品保存，修改海报清除材料确认',()=>{
 const {state,issue}=fixture(),config=posterConfig(issue);issue.confirmed=true;
 config.supplements[issue.productIds[0]]={risk:'R1低风险',hook:'挂钩看涨欧元兑美元即期汇率'};
 updatePosterConfig(issue,config);assert.equal(issue.confirmed,false);
 const model=buildPosterModel(state,issue);assert.equal(model.products[0].risk,'R1低风险');assert.equal(model.products[1].risk,'');
 config.supplements[issue.productIds[0]].risk='changed';assert.equal(issue.poster.supplements[issue.productIds[0]].risk,'R1低风险');
});
test('下发快照不受后续工作数据变化影响，已下发配置不可编辑',()=>{
 const {state,issue}=fixture();issue.material='发行通知';issue.confirmed=true;
 const snapshot=buildPosterModel(state,issue);sendIssue(state,issue.id,['北京分行']);issue.posterSnapshot=clone(snapshot);
 state.products.find(p=>p.id===issue.productIds[0]).market.name='changed';
 assert.deepEqual(buildPosterModel(state,issue),snapshot);
 const read=buildPosterModel(state,issue);read.products[0].name='mutated';assert.deepEqual(buildPosterModel(state,issue),snapshot);
 assert.throws(()=>updatePosterConfig(issue,posterConfig(issue)),/不能修改/);
});
