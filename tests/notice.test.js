import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {seed,clone,sendIssue} from '../dist/core.js';
import {ensureAdditionalProducts,COLLECTION_ISSUE_ID} from '../dist/product-fixtures.js';
import {noticeConfig,buildNoticeDocument,saveNotice,noticeErrors,assertNoticeReady,noticeText,noticeDocument,noticeHTML,productScope} from '../dist/notice-model.js';
import {noticeDocx} from '../dist/notice-export.js';
const fixture=()=>{const state=seed();ensureAdditionalProducts(state);return {state,issue:state.issues.find(i=>i.id===COLLECTION_ISSUE_ID)};};
const complete=issue=>({...noticeConfig(issue),date:'2026-10-27'});

test('通知按真实示例编排四节及产品表，只取已校验的说明书要素',()=>{
  const {state,issue}=fixture(),p=state.products[0];p.name='未复核修改';p.start='2027-01-01';
  const doc=buildNoticeDocument(state,issue,complete(issue));
  assert.equal(doc.rows.length,12);assert.equal(doc.rows[0].name,p.prospectus.name);assert.equal(doc.rows[0].start,p.prospectus.start);
  assert.equal(doc.title,'关于发行结构性存款C09001-C09012期产品的通知');
  const text=noticeText(doc);for(const heading of ['一、产品发行安排及产品概况','二、发行渠道','三、发行区域','四、营销要点'])assert.ok(text.includes(heading));
  assert.ok(!text.includes('未复核修改'));assert.equal(doc.attachments.length,15);assert.equal(doc.attachments[0].kind,'common');assert.equal(doc.attachments[3].productId,p.id);
});
test('非连续、跨系列及缺少标准期次的产品不错误合并区间',()=>{
  assert.equal(productScope([{name:'结构性存款A08079期'},{name:'结构性存款A08081期'}]),'结构性存款A08079、A08081期产品');
  assert.equal(productScope([{name:'结构性存款A08079期'},{name:'结构性存款B08080期'}]),'结构性存款A08079、B08080期产品');
  assert.equal(productScope([{name:'产品一'},{name:'产品二'}]),'2款结构性存款产品');
});
test('现有通知不自动覆盖，保存新模板后才替换且清除确认',()=>{
  const {state,issue}=fixture(),material=issue.material;const config=complete(issue);
  noticeConfig(issue);buildNoticeDocument(state,issue,config);assert.equal(issue.material,material);assert.equal(issue.notice,undefined);
  issue.confirmed=true;saveNotice(state,issue,config,{record:true});assert.equal(issue.confirmed,false);assert.equal(issue.notice.version,1);assert.equal(noticeErrors(state,issue).length,0);
  config.issuer='外部修改';assert.equal(issue.notice.config.issuer,'财富管理部');
  const revised=noticeConfig(issue);revised.region='上述产品将在指定区域发售。';revised.commonAttachments.pop();saveNotice(state,issue,revised);
  assert.ok(issue.material.includes('指定区域'));assert.equal(issue.notice.document.attachments.length,14);
});
test('成文日期、时间关系及未填充变量影响确认和导出',()=>{
  const {state,issue}=fixture();saveNotice(state,issue);assert.throws(()=>assertNoticeReady(state,issue),/成文日期/);
  const config=complete(issue);config.lastClose='16:00';saveNotice(state,issue,config);assert.throws(()=>assertNoticeReady(state,issue),/先后关系/);
  config.lastClose='21:00';config.paragraphs.intro+='{错误字段}';saveNotice(state,issue,config);assert.throws(()=>assertNoticeReady(state,issue),/无法填充/);
  config.paragraphs.intro='我行将发行{产品范围}，具体按{制度依据}执行。';saveNotice(state,issue,config);assert.doesNotThrow(()=>assertNoticeReady(state,issue));
});
test('说明书缺失、资料差异、产品代码不一致及更新后的旧通知均被拦截',()=>{
  const {state,issue}=fixture(),p=state.products[0];saveNotice(state,issue,complete(issue));
  p.prospectus=null;assert.throws(()=>buildNoticeDocument(state,issue),/一致性/);p.prospectus=clone(p.market);
  p.prospectus.marketNumber='WRONG';assert.throws(()=>buildNoticeDocument(state,issue),/代码/);p.prospectus.marketNumber=p.marketNumber;
  p.prospectus.start='2026-10-25';assert.throws(()=>buildNoticeDocument(state,issue),/一致性/);
  p.approved.start=p.market.start=p.prospectus.start;assert.throws(()=>assertNoticeReady(state,issue),/资料已变化/);
});
test('下发时保存通知快照，随后工作数据及配置不改变已下发版本',()=>{
  const {state,issue}=fixture();saveNotice(state,issue,complete(issue));assertNoticeReady(state,issue);
  const snapshot=noticeDocument(issue);issue.confirmed=true;sendIssue(state,issue.id,['北京分行']);issue.noticeSnapshot=clone(snapshot);
  issue.notice.document.title='已修改';state.products[0].prospectus.name='已修改';assert.deepEqual(noticeDocument(issue),snapshot);
  const returned=noticeDocument(issue);returned.title='再修改';assert.deepEqual(noticeDocument(issue),snapshot);
  assert.throws(()=>saveNotice(state,issue,complete(issue)),/不能修改/);
});
test('通知预览转义手填内容，产品表保留完整日期来源',()=>{
  const {state,issue}=fixture(),config=complete(issue);config.title='<img src=x onerror=alert(1)>';
  const html=noticeHTML(buildNoticeDocument(state,issue,config));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
  assert.ok(html.includes('title="2026-10-26"'));assert.ok(html.includes('2026年10月27日'));
});
test('既有通知未关联原件时不因新增来源字段而被误报资料变化',()=>{
  const {state,issue}=fixture();saveNotice(state,issue,complete(issue));
  const doc=issue.notice.document;doc.rows=doc.rows.map(({id,name,code,start,end})=>({id,name,code,start,end}));
  doc.sourceFingerprint=JSON.stringify(doc.rows);issue.material=noticeText(doc);
  assert.deepEqual(noticeErrors(state,issue),[]);
});

function zipEntry(buffer,name){
  let offset=0;
  while(offset<buffer.length-30&&buffer.readUInt32LE(offset)===0x04034b50){
    const method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18),n=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28);
    const filename=buffer.subarray(offset+30,offset+30+n).toString(),start=offset+30+n+extra;
    if(filename===name){const bytes=buffer.subarray(start,start+size);return (method===8?inflateRawSync(bytes):bytes).toString();}offset=start+size;
  }
  throw Error(`Missing ${name}`);
}
test('导出为真实Word文件，12只产品完整进入表格且表头可跨页重复',async()=>{
  const {state,issue}=fixture(),doc=buildNoticeDocument(state,issue,complete(issue));
  const blob=await noticeDocx(doc),buffer=Buffer.from(await blob.arrayBuffer());assert.equal(buffer.readUInt32LE(0),0x04034b50);
  const xml=zipEntry(buffer,'word/document.xml');assert.ok(xml.includes('w:tblHeader'));assert.equal((xml.match(/<w:tr[ >]/g)||[]).length,13);
  for(const row of doc.rows){assert.ok(xml.includes(row.name));assert.ok(xml.includes(row.code));}
  assert.ok(xml.includes('2026年10月27日'));assert.match(xml,/<w:pgSz[^>]*w:w="11906"/);assert.ok(xml.includes('仿宋_GB2312'));
});
