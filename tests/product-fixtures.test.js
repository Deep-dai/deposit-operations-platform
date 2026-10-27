import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,validate,eligible,issueProductAvailability,createIssue} from '../dist/core.js';
import {ensureAdditionalProducts,ensureAvailableProducts,availableProductFixtures,COLLECTION_ISSUE_ID} from '../dist/product-fixtures.js';
import {buildPosterModel,posterConfig,rateText} from '../dist/poster-model.js';

test('追加12只不同产品，日期、滚存共性要素及最终快照均有效',()=>{
 const state=seed();ensureAdditionalProducts(state);
 const products=state.products.filter(p=>p.fixtureBundle);
 assert.equal(products.length,12);assert.equal(products.filter(p=>p.type==='rolling').length,2);
 assert.equal(new Set(products.map(p=>p.tenor)).size,11);
 for(const p of products){assert.deepEqual(validate(p,state,{ignoreId:p.id}),[],p.name);assert.ok(eligible(p));}
 const issue=state.issues.find(i=>i.id===COLLECTION_ISSUE_ID);assert.equal(issue.productIds.length,12);assert.equal(issue.confirmed,false);assert.ok(issue.material);
});

test('迁移保留全部原有记录，重复加载不覆盖修改或重复追加',()=>{
 const state=seed(),previous=clone(state);
 ensureAdditionalProducts(state);const counts=[state.products.length,state.series.length,state.issues.length];
 for(const key of ['products','series','issues'])for(const item of previous[key])assert.deepEqual(state[key].find(x=>x.id===item.id),item);
 state.products[0].name='用户已修改的产品';state.issues[0].poster.selectedIds=state.issues[0].productIds.slice(0,3);
 assert.equal(ensureAdditionalProducts(state),false);
 assert.deepEqual([state.products.length,state.series.length,state.issues.length],counts);
 assert.equal(state.products[0].name,'用户已修改的产品');assert.equal(state.issues[0].poster.selectedIds.length,3);
});

test('用户已有C系列时自动另建系列，产品及快照归属同步',()=>{
 const state=seed(),existing={id:'2026年C',name:'用户系列',family:'慧信'};state.series.push(existing);
 ensureAdditionalProducts(state);assert.deepEqual(state.series.find(s=>s.id==='2026年C'),existing);
 const rolling=state.products.filter(p=>p.fixtureBundle&&p.type==='rolling');
 assert.ok(rolling.every(p=>p.seriesId==='2026年C-1'&&p.market.seriesId===p.seriesId&&p.approved.seriesId===p.seriesId));
});

test('同一发行支持3、6、12只合集，空收益档位不填零且保留三位小数',()=>{
 const state=seed();ensureAdditionalProducts(state);const issue=state.issues.find(i=>i.id===COLLECTION_ISSUE_ID);
 for(const count of [3,6,12]){const config=posterConfig(issue);config.selectedIds=config.order.slice(0,count);const model=buildPosterModel(state,issue,config);assert.equal(model.products.length,count);assert.equal(model.height,640+428*count+264);}
 const model=buildPosterModel(state,issue);assert.equal(model.seriesLabel,'结构性存款系列');
 assert.equal(rateText(model.products[9]),'1.075%或1.875%');assert.equal(rateText(model.products[6]),'1.25%或2.15%');
});

test('补充12只未占用产品，可新建发行且不自动创建发行记录',()=>{
 const state=seed();ensureAdditionalProducts(state);const before=clone(state),count=issueProductAvailability(state).available.length;
 assert.equal(ensureAvailableProducts(state),true);
 const products=availableProductFixtures().products.map(p=>state.products.find(x=>x.id===p.id));
 assert.equal(products.length,12);assert.equal(issueProductAvailability(state).available.length,count+12);
 assert.deepEqual(state.issues,before.issues);
 for(const p of products){
  assert.deepEqual(validate(p,state,{ignoreId:p.id}),[],p.name);assert.ok(eligible(p));
  assert.ok(p.name.includes(p.marketNumber.slice(3)),p.name);
  for(const key of ['approved','market','prospectus'])assert.equal(p[key].marketNumber,p.marketNumber);
 }
 const issue=createIssue(state,products.map(p=>p.id),'新增产品发行');
 assert.equal(issue.productIds.length,12);assert.equal(buildPosterModel(state,issue,{...posterConfig(issue),template:'collection'}).products.length,12);
});

test('补充数据不改写原记录，刷新不重复追加也不释放已占用产品',()=>{
 const state=seed();ensureAdditionalProducts(state);state.products[0].notes='已修改';state.issues[0].poster.selectedIds=state.issues[0].productIds.slice(0,3);
 const before=clone(state);ensureAvailableProducts(state);
 for(const key of ['products','series','issues'])for(const record of before[key])assert.deepEqual(state[key].find(x=>x.id===record.id),record);
 const ids=availableProductFixtures().products.map(p=>p.id);createIssue(state,ids,'已占用的新增产品');
 const after=clone(state);assert.equal(ensureAvailableProducts(state),false);assert.deepEqual(state,after);
 assert.ok(ids.every(id=>!issueProductAvailability(state).available.some(p=>p.id===id)));
 assert.throws(()=>createIssue(state,ids,'重复发行'),/已加入未完成/);
});

test('新增可选产品遇到记录冲突不覆盖，系列重名时独立编号',()=>{
 const state=seed(),id=availableProductFixtures().products[0].id;state.products.push({id,name:'用户产品'});
 const before=clone(state);assert.equal(ensureAvailableProducts(state),false);assert.deepEqual(state,before);
 const another=seed();another.series.push({id:'2026年D',name:'用户系列'});ensureAvailableProducts(another);
 assert.equal(another.series.find(s=>s.id==='2026年D').name,'用户系列');
 for(const p of another.products.filter(p=>p.fixtureBundle==='available-products-20261027-v1'&&p.type==='rolling')){
  assert.equal(p.seriesId,'2026年D-1');for(const key of ['approved','market','prospectus'])assert.equal(p[key].seriesId,p.seriesId);
 }
});

test('可选、已占用、办理中和已下发产品分开统计，不放行资料差异',()=>{
 const state=seed(),ready=state.products.filter(eligible),selected=ready[0];
 createIssue(state,[selected.id],'占用产品');
 const invalid=ready[1];invalid.prospectus.high='9.99';
 const groups=issueProductAvailability(state),allIds=[...groups.available,...groups.reserved.map(r=>r.product),...groups.processing,...groups.issued].map(p=>p.id);
 assert.equal(allIds.length,state.products.length);assert.equal(new Set(allIds).size,state.products.length);
 assert.ok(groups.reserved.some(r=>r.product.id===selected.id&&r.issue.title==='占用产品'));
 assert.ok(groups.processing.some(p=>p.id===invalid.id));
 assert.ok(!groups.available.some(p=>[invalid.id,selected.id].includes(p.id)));
 assert.ok(groups.issued.every(p=>p.status==='issued'));
});
