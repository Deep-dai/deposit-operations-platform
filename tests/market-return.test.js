import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,blankProduct,createProduct,transition,marketReturnPreview,eligible,createIssue} from '../dist/core.js';
import {saveNotice,noticeConfig,noticeErrors} from '../dist/notice-model.js';
import {buildPosterModel} from '../dist/poster-model.js';

test('回传预览只取已复核版本，不改状态、不要求文件且受角色和环节约束',()=>{
 const state=seed(),p=state.products.find(p=>p.status==='market');p.name='尚未复核的工作副本';
 const before=clone(state),preview=marketReturnPreview(state,p.id);
 assert.equal(preview.market.name,p.approved.name);assert.equal(preview.prospectus.name,p.approved.name);
 assert.equal(preview.market.marketNumber,preview.prospectus.marketNumber);assert.deepEqual(state,before);
 assert.throws(()=>marketReturnPreview(state,p.id,{role:'reviewer'}),/产品经理/);
 assert.throws(()=>marketReturnPreview(state,state.products.find(p=>p.status==='draft').id),/已复核申报/);
});

test('自建产品可完成复核、回传、独立校验、通知和海报，全程无需真实说明书',()=>{
 const state=seed(),data={...blankProduct(),name:'乐赢智信汇率挂钩人民币结构性存款D10999期',start:'2026-11-01',end:'2026-11-08',value:'2026-11-09',maturity:'2026-12-10',tenor:31,low:'1.10',mid:'1.50',high:'1.90',quota:'8000',minimum:'10000',cost:'1.72',forecast:'5000'};
 const p=createProduct(state,data).product;transition(state,p.id,'approve',{role:'reviewer'});const approved=clone(p.approved);
 transition(state,p.id,'receive');assert.equal(p.status,'check');assert.equal(eligible(p),false);
 assert.equal(p.prospectusSource,null);assert.equal(p.marketReturnSource.type,'preset');assert.ok(p.marketNumber);
 assert.equal(p.market.marketNumber,p.marketNumber);assert.equal(p.prospectus.marketNumber,p.marketNumber);
 assert.equal(Object.hasOwn(p.prospectus,'cost'),false);assert.equal(Object.hasOwn(p.prospectus,'forecast'),false);
 assert.deepEqual(p.approved,approved);assert.throws(()=>transition(state,p.id,'receive'),/当前状态/);
 transition(state,p.id,'check');assert.equal(eligible(p),true);
 const issue=createIssue(state,[p.id],'自建产品发行'),config=noticeConfig(issue);config.date='2026-10-27';const doc=saveNotice(state,issue,config);
 assert.equal(doc.rows[0].code,p.marketNumber);assert.deepEqual(noticeErrors(state,issue),[]);
 assert.equal(buildPosterModel(state,issue).products[0].name,data.name);
});

test('回传要素与申报独立保存，差异仍阻断发行，重审清除旧回传来源',()=>{
 const state=seed(),p=state.products.find(p=>p.status==='market');transition(state,p.id,'receive');
 const original=p.approved.high;p.prospectus.high='9.99';assert.equal(p.approved.high,original);assert.equal(p.market.high,original);
 transition(state,p.id,'check');assert.equal(p.status,'difference');assert.equal(eligible(p),false);
 assert.throws(()=>createIssue(state,[p.id],'存在差异'),/一致性校验/);
 transition(state,p.id,'revise',{note:'调整后重新复核'});assert.equal(p.marketReturnSource,null);assert.equal(p.prospectus,null);
});
