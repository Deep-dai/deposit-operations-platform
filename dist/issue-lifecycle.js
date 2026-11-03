// Download progress is separate from the editable draft / published lifecycle.
// A later WeCom integration can set its delivery state; no sending is done here.
export function isIssueLocked(issue){
 return !!issue&&(['sent','wecom_sent'].includes(issue.status)||['sent','wecom_sent'].includes(issue.deliveryStatus));
}
export const isIssueEditable=issue=>!!issue&&issue.status==='draft'&&!isIssueLocked(issue);
export const canCancelIssue=(issue,role='manager')=>role==='manager'&&isIssueEditable(issue);
export function assertIssueEditable(issue){
 if(!issue)throw Error('未找到发行记录');
 if(isIssueLocked(issue))throw Error('已下发的发行记录不能修改或取消');
 if(!isIssueEditable(issue))throw Error('当前发行状态不能修改或取消');
 return issue;
}
export function issueDeliveryState(issue){
 if(issue?.status==='wecom_sent'||issue?.deliveryStatus==='wecom_sent')return 'wecom_sent';
 if(isIssueLocked(issue))return 'sent';
 return issue?.deliveryStatus==='downloaded'||issue?.downloadedAt||issue?.downloads?.notice||issue?.downloads?.poster?'downloaded':'pending';
}
export const issueDeliveryLabel=issue=>({pending:'待下载',downloaded:'已下载',sent:'已下发',wecom_sent:'已企微下发'}[issueDeliveryState(issue)]);
export function recordIssueDownload(state,id,kind,{format='',filename='',role='manager',time=new Date().toLocaleString('sv-SE').slice(0,16)}={}){
 const issue=state.issues.find(i=>i.id===id);
 if(!issue)throw Error('发行记录已取消，不能继续下载');
 if(!['notice','poster'].includes(kind))throw Error('发行材料类型无效');
 // Published records and read-only users may download without changing the record.
 if(role!=='manager'||!isIssueEditable(issue))return false;
 const prior=issue.downloads?.[kind];
 issue.downloads={...issue.downloads,[kind]:{time,format,filename,count:(prior?.count||0)+1}};
 issue.downloadedAt ||=time;issue.lastDownloadedAt=time;issue.deliveryStatus='downloaded';
 (issue.history ||= []).unshift({time,action:'下载发行材料',note:`${kind==='notice'?'发行通知':'发行海报'}${format?'（'+format.toUpperCase()+'）':''}`});
 return true;
}
export function cancelIssue(state,id,{role='manager'}={}){
 if(role!=='manager')throw Error('请切换至产品经理取消发行');
 const index=state.issues.findIndex(i=>i.id===id);
 assertIssueEditable(state.issues[index]);
 return state.issues.splice(index,1)[0];
}
