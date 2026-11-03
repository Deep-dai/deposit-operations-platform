import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,clone,createIssue,issueProductAvailability,sendIssue} from '../dist/core.js';
import {createDirectMaterials} from '../dist/direct-materials.js';
import {noticeConfig,saveNotice,noticeDocument} from '../dist/notice-model.js';
import {posterConfig,buildPosterModel,updatePosterConfig} from '../dist/poster-model.js';
import {isIssueEditable,canCancelIssue,cancelIssue,issueDeliveryState,issueDeliveryLabel,recordIssueDownload} from '../dist/issue-lifecycle.js';

function fixture(){
 const state=seed(),fields={name:'乐赢智信汇率挂钩人民币结构性存款Z98001期',marketNumber:'P28Z98001',family:'智信',currency:'人民币',underlying:'欧元兑美元',start:'2028-11-01',end:'2028-11-04',value:'2028-11-05',maturity:'2028-12-06',tenor:31,low:'1',mid:'1.5',high:'1.9'},hash='fictional-lifecycle-source';
 const issue=createDirectMaterials(state,[{fields,result:{fields,hash,errors:[],warnings:[],extras:{saleStart:'08:00',saleEnd:'17:30',lastClose:'21:00'}},source:{id:hash,hash,name:'fictional.docx'}}]);
 const config={...noticeConfig(issue),date:'2026-11-03'};saveNotice(state,issue,config);
 return {state,issue};
}
test('下载状态独立于办理状态，通知及海报下载后仍可修改与取消，修改不抹除下载记录',()=>{
 const {state,issue}=fixture(),before=clone(state.products);assert.equal(issueDeliveryState(issue),'pending');
 recordIssueDownload(state,issue.id,'notice',{format:'docx',time:'2026-11-03 10:00'});assert.equal(issue.status,'draft');assert.equal(issueDeliveryLabel(issue),'已下载');assert.equal(isIssueEditable(issue),true);assert.equal(canCancelIssue(issue),true);
 const config=noticeConfig(issue);config.title='下载后修改通知';saveNotice(state,issue,config);assert.equal(noticeDocument(issue).title,config.title);
 const poster=posterConfig(issue);poster.consumerProtectionNumber='XB-UPDATED';updatePosterConfig(issue,poster);
 recordIssueDownload(state,issue.id,'poster',{format:'png',time:'2026-11-03 10:02'});recordIssueDownload(state,issue.id,'notice',{format:'docx',time:'2026-11-03 10:03'});
 assert.equal(issue.downloads.notice.count,2);assert.equal(issue.downloads.poster.format,'png');assert.equal(issue.downloadedAt,'2026-11-03 10:00');assert.equal(issue.lastDownloadedAt,'2026-11-03 10:03');
 const restored=JSON.parse(JSON.stringify(state));assert.equal(issueDeliveryLabel(restored.issues[0]),'已下载');assert.equal(isIssueEditable(restored.issues[0]),true);
 cancelIssue(state,issue.id);assert.equal(state.issues.some(i=>i.id===issue.id),false);assert.deepEqual(state.products,before);
});
test('取消普通待发行记录只移除该批次并释放产品占用，不删除或改写产品与其他记录',()=>{
 const state=seed(),products=clone(state.products),series=clone(state.series),issues=clone(state.issues),id='SB-202610-0003';
 const issue=createIssue(state,[id],'待取消的发行');recordIssueDownload(state,issue.id,'poster',{format:'jpg'});
 assert.ok(issueProductAvailability(state).reserved.some(r=>r.product.id===id));cancelIssue(state,issue.id);
 assert.ok(issueProductAvailability(state).available.some(p=>p.id===id));assert.deepEqual(state.products,products);assert.deepEqual(state.series,series);assert.deepEqual(state.issues,issues);
 assert.throws(()=>recordIssueDownload(state,issue.id,'notice'),/已取消/);assert.throws(()=>cancelIssue(state,issue.id),/未找到/);
});
test('已下发及预留的已企微下发状态不能修改、取消或再次下发，下载不改写锁定记录',()=>{
 for(const patch of [{status:'sent'},{deliveryStatus:'wecom_sent'},{status:'wecom_sent'}]){
  const {state,issue}=fixture();issue.noticeSnapshot=noticeDocument(issue);issue.posterSnapshot=buildPosterModel(state,issue);Object.assign(issue,patch);
  const before=clone(state);assert.equal(isIssueEditable(issue),false);assert.equal(canCancelIssue(issue),false);
  assert.equal(issueDeliveryLabel(issue),patch.status==='sent'?'已下发':'已企微下发');
  assert.throws(()=>saveNotice(state,issue,noticeConfig(issue)),/不能修改/);assert.throws(()=>updatePosterConfig(issue,posterConfig(issue)),/不能修改/);assert.throws(()=>cancelIssue(state,issue.id),/不能修改或取消/);assert.throws(()=>sendIssue(state,issue.id,['北京分行']),/状态/);
  assert.equal(recordIssueDownload(state,issue.id,'notice',{format:'docx'}),false);assert.deepEqual(state,before);
  assert.deepEqual(noticeDocument(issue),issue.noticeSnapshot);assert.deepEqual(buildPosterModel(state,issue),issue.posterSnapshot);
 }
});
test('取消受角色约束，预览不记下载，非经办角色及错误类型不改变记录',()=>{
 const {state,issue}=fixture(),before=clone(state);buildPosterModel(state,issue);noticeDocument(issue);assert.deepEqual(state,before);
 for(const role of ['reviewer','branch']){assert.equal(canCancelIssue(issue,role),false);assert.throws(()=>cancelIssue(state,issue.id,{role}),/产品经理/);assert.equal(recordIssueDownload(state,issue.id,'poster',{role}),false);}
 assert.throws(()=>recordIssueDownload(state,issue.id,'prospectus'),/类型无效/);assert.deepEqual(state,before);
});
