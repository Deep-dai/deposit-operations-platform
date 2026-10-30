import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,validate,compare} from '../dist/core.js';
import {ensureAdditionalProducts,ensureAvailableProducts} from '../dist/product-fixtures.js';
import {ensureOperations} from '../dist/operations-model.js';
import {ensureRollingSales,rollingSalesRows,rollingSalesErrors} from '../dist/rolling-sales.js';

const fixture=()=>{const state=seed();ensureAdditionalProducts(state);ensureAvailableProducts(state);ensureOperations(state);ensureRollingSales(state);return state;};
const rows=state=>rollingSalesRows(state,state.rollingSales.exampleSeriesId);

test('经营统计追加独立系列，不覆盖已有产品、系列和发行记录，重复加载保留修改',()=>{
 const state=seed();ensureAdditionalProducts(state);ensureAvailableProducts(state);ensureOperations(state);const before=clone(state);
 assert.equal(ensureRollingSales(state),true);
 for(const key of ['products','series','issues'])for(const item of before[key])assert.deepEqual(state[key].find(x=>x.id===item.id),item);
 assert.equal(state.products.length,before.products.length+5);assert.equal(state.issues.length,before.issues.length+5);
 for(const row of rows(state)){assert.deepEqual(validate(row.product,state,{ignoreId:row.product.id}),[],row.product.name);assert.equal(compare(row.product).filter(d=>!d.ok).length,0);}
 state.rollingSales.records[0].sales=999;const modified=clone(state);assert.equal(ensureRollingSales(state),false);assert.deepEqual(state,modified);
});

test('迁移遇到系列、产品和发行编号冲突时保留用户数据并另取编号',()=>{
 const state=seed();state.series.push({id:'2026年经营A',name:'已有系列'});state.products.push({id:'SR-2026-SALES-1',name:'已有产品'});state.issues.push({id:'FX-SALES-2026-1',title:'已有发行'});
 const before=clone(state);ensureRollingSales(state);
 for(const key of ['products','series','issues'])for(const item of before[key])assert.deepEqual(state[key].find(x=>x.id===item.id),item);
 assert.equal(state.rollingSales.exampleSeriesId,'2026年经营A_2');assert.ok(rows(state)[0].product.id.endsWith('_2'));
});

test('同一笔跨期本金同时计入上期流出和下期承接，金额来源及去向均勾稽',()=>{
 const state=fixture(),r=rows(state);assert.deepEqual(rollingSalesErrors(state),[]);
 assert.deepEqual(r.map(x=>[x.sales,x.incoming,x.fresh]),[[1000,0,1000],[1200,700,500],[1400,900,500],[1600,980,620],[320,null,null]]);
 for(let i=0;i<3;i++){assert.equal(r[i].outgoing,r[i+1].incoming);assert.equal(r[i].due,r[i].outgoing+r[i].unretained);assert.equal(r[i].retention,r[i].outgoing/r[i].due);}
 for(const row of r.filter(x=>x.fresh!==null))assert.equal(row.sales,row.incoming+row.fresh);
 assert.equal(r[2].retention,.7);assert.equal(r[3].sourceShare,.6125);
 const record=state.rollingSales.records[3];assert.notEqual(record.sales,r[3].product.forecast);assert.notEqual(record.sales,r[3].product.quota);
});

test('未到期、来源待统计和实际零值分开，不将未知金额自动算成新购',()=>{
 const state=fixture(),r=rows(state);assert.equal(r[3].outgoingStatus,'not_due');assert.equal(r[3].outgoing,null);assert.equal(r[3].retention,null);
 assert.equal(r[4].sales,320);assert.equal(r[4].incoming,null);assert.equal(r[4].fresh,null);assert.equal(r[4].outgoingStatus,'not_due');
 state.rollingSales.flows[0].amount=0;const zero=rows(state);assert.equal(zero[0].outgoing,0);assert.equal(zero[0].retention,0);assert.equal(zero[1].incoming,0);assert.equal(zero[1].fresh,1200);
 state.rollingSales.flows.shift();assert.equal(rows(state)[0].retention,0);
 state.rollingSales.records[0].sales=0;state.rollingSales.records[0].due=0;const empty=rows(state)[0];assert.equal(empty.outgoing,0);assert.equal(empty.retention,null);assert.equal(empty.fresh,0);
});

test('统计中的承接保留时点金额和状态，金额按分精度累加',()=>{
 const state=fixture();state.rollingSales.flows[1].status='in_progress';state.rollingSales.flows[1].amount=900.123456;
 const r=rows(state);assert.equal(r[1].outgoingStatus,'in_progress');assert.equal(r[1].outgoing,900.123456);assert.equal(r[1].unretained,299.876544);assert.equal(r[2].incoming,900.123456);assert.equal(r[2].fresh,499.876544);assert.equal(r[1].retention,900.123456/1200);
});

test('金额超限、跨系列和逆向或重复关联均提示核对，异常比例不展示',()=>{
 for(const mutate of [
  s=>s.rollingSales.flows[0].amount=1300,
  s=>s.rollingSales.flows[0].to=s.products.find(p=>p.seriesId==='2026年A').id,
  s=>s.rollingSales.flows[0].to=s.rollingSales.flows[0].from,
  s=>s.rollingSales.flows.push(clone(s.rollingSales.flows[0])),
  s=>s.rollingSales.records[0].sales=-1
 ]){const state=fixture();mutate(state);assert.ok(rollingSalesErrors(state).length);const bad=rows(state).filter(r=>r.issues.length);assert.ok(bad.length);for(const row of bad){assert.equal(row.retention,null);assert.equal(row.sourceShare,null);assert.equal(row.fresh,null);}}
});

test('既有申报系列无经营记录时不推断销量，纯查询不改写原始记录',()=>{
 const state=fixture(),before=clone(state);const old=rollingSalesRows(state,'2026年A');assert.ok(old.length);
 for(const row of old){assert.equal(row.sales,null);assert.equal(row.incoming,null);assert.equal(row.retention,null);assert.equal(row.record,null);}
 rows(state);assert.deepEqual(state,before);
});
