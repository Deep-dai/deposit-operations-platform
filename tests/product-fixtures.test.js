import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,validate,eligible} from '../dist/core.js';
import {ensureAdditionalProducts,COLLECTION_ISSUE_ID} from '../dist/product-fixtures.js';
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
