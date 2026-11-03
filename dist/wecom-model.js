import {assertIssueEditable} from './issue-lifecycle.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const time=()=>new Date().toLocaleString('sv-SE').slice(0,16);
export function beginWecomDelivery(issue,{jobId,revision,serviceId,target,files,noticeSnapshot,posterSnapshot},role='manager'){
 if(role!=='manager')throw Error('请切换至产品经理发送材料');
 assertIssueEditable(issue);
 if(!issue.notice||!noticeSnapshot||!target?.id||!target?.name||!serviceId||!/^[a-f0-9]{64}$/.test(revision)||!/^[A-Za-z0-9_-]{16,90}$/.test(jobId||'')||!Array.isArray(files)||files.length<1||files.length>2||files.filter(f=>f.kind==='notice').length!==1||files.some(f=>!['notice','poster'].includes(f.kind))||new Set(files.map(f=>f.kind)).size!==files.length)throw Error('请先生成并核对本次发送材料');
 issue.wecomDelivery={jobId,revision,serviceId,targetId:target.id,targetName:target.name,status:'pending',created:time(),items:copy(files.map(({kind,name})=>({kind,name,status:'pending',message:'等待发送'})))};
 issue.noticeSnapshot=copy(noticeSnapshot);if(posterSnapshot)issue.posterSnapshot=copy(posterSnapshot);else delete issue.posterSnapshot;
 (issue.history ||= []).unshift({time:time(),action:'发起企微发送',note:`${target.name}；${files.length}份文件`});
 return issue.wecomDelivery;
}
export function applyWecomReceipt(state,issue,receipt){
 const delivery=issue.wecomDelivery;
 if(!delivery||receipt.issueId!==issue.id||receipt.revision!==delivery.revision||receipt.targetId!==delivery.targetId||!/^[A-Za-z0-9_-]{16,90}$/.test(receipt.id||''))throw Error('企微发送结果与当前材料不一致');
 if(!Array.isArray(receipt.items)||receipt.items.length!==delivery.items.length||receipt.items.some((item,index)=>item.kind!==delivery.items[index].kind||item.name!==delivery.items[index].name||!['pending','uploading','sending','sent','failed','unknown'].includes(item.status)))throw Error('企微文件发送结果不完整');
 const items=receipt.items,derived=items.every(x=>x.status==='sent')?'sent':items.some(x=>['pending','uploading','sending'].includes(x.status))?'pending':items.some(x=>x.status==='unknown')?'unknown':items.some(x=>x.status==='sent')?'partial':'failed';
 if(receipt.status!==derived)throw Error('企微发送状态与文件结果不一致');
 if(delivery.items.some((old,index)=>old.status==='sent'&&items[index].status!=='sent'))throw Error('已成功发送的文件不能退回待发送状态');
 const previous=delivery.status;
 Object.assign(delivery,{jobId:receipt.id,status:derived,items:copy(items),updated:time()});
 if(derived==='sent'){
  issue.status='wecom_sent';issue.deliveryStatus='wecom_sent';issue.wecomSentAt=receipt.updated||time();
  if(issue.mode!=='materials')for(const id of issue.productIds){const product=state.products.find(p=>p.id===id);if(product&&product.status!=='issued'){product.status='issued';product.updated=time();(product.history ||= []).unshift({time:time(),action:'发行材料已企微下发',note:issue.title,actor:'产品经理'});}}
 }else if(derived==='failed'){
  delete issue.noticeSnapshot;delete issue.posterSnapshot;
 }
 if(previous!==derived)(issue.history ||= []).unshift({time:time(),action:({sent:'企微下发成功',partial:'企微下发部分成功',unknown:'企微发送结果待核实',failed:'企微发送失败',pending:'企微发送中'}[derived]),note:`${delivery.targetName}；${items.filter(x=>x.status==='sent').length}/${items.length}份文件成功`});
 return derived;
}
