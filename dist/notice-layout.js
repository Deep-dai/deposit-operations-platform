// Formatting rules mirror the user's current citic-gongwen preset.
export const NOTICE_LAYOUT=Object.freeze({page:{width:11906,height:16838},margin:{top:1899,bottom:1843,left:1474,right:1417},bodyHalfPoints:32,titleHalfPoints:44,lineTwips:590,gridLines:22,titleMaxEm:20.4,tableWidths:[1300,4725,1495,1495]});
export const noticeTextStyle=text=>String(text??'').replace(/\(/g,'（').replace(/\)/g,'）');
export function textEmWidth(text){return [...String(text)].reduce((sum,char)=>sum+(/[\r\n]/.test(char)?0:char.codePointAt(0)<128?.5:1),0);}
function balancedLines(tokens){
 const limit=NOTICE_LAYOUT.titleMaxEm,total=tokens.reduce((n,t)=>n+textEmWidth(t),0),sums=[0];
 for(const token of tokens)sums.push(sums.at(-1)+textEmWidth(token));
 for(let count=Math.max(2,Math.ceil(total/limit));count<=tokens.length;count++){
  const target=total/count,memo=new Map();
  function solve(start,left){
   if(!left)return start===tokens.length?{cost:0,lines:[]}:null;
   const key=start+':'+left;if(memo.has(key))return memo.get(key);let best=null;
   for(let end=start+1;end<=tokens.length-left+1;end++){
    const width=sums[end]-sums[start];if(width>limit+.001)break;const next=solve(end,left-1);if(!next)continue;
    const cost=next.cost+(width-target)**2+(width<5?60:0);
    if(!best||cost<best.cost)best={cost,lines:[tokens.slice(start,end).join(''),...next.lines]};
   }
   memo.set(key,best);return best;
  }
  const plan=solve(0,count);if(plan)return plan.lines;
 }
 return null;
}
export function noticeTitleLayout(value){
 const text=noticeTextStyle(value).trim();
 if(!text)return {lines:[''],errors:['通知标题不能为空']};
 if(text.includes('\t'))return {lines:text.split(/\r?\n/),errors:['标题不能包含制表符，请按完整词意换行']};
 if(text.includes('\n')){
  const lines=text.split(/\r?\n/).map(line=>line.trim());
  return {lines,errors:[...(lines.some(line=>!line)?['标题不能包含空行']:[]),...(lines.some(line=>textEmWidth(line)>NOTICE_LAYOUT.titleMaxEm)?['标题单行过长，请按完整词意调整换行']:[])]};
 }
 if(textEmWidth(text)<=NOTICE_LAYOUT.titleMaxEm)return {lines:[text],errors:[]};
 const standard=text.match(/^(关于发行结构性存款)(.+?)(期产品的通知)$/);let tokens;
 if(standard&&/^[A-Z\d、,，\-－—]+$/.test(standard[2])){
  const products=standard[2].match(/[A-Z]+\d+(?:[\-－—][A-Z]*\d+)?(?:、|,|，)?/g);
  if(products&&products.join('')===standard[2]){products[products.length-1]+=standard[3];tokens=[standard[1],...products];}
 }
 if(!tokens){
  tokens=[...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)].map(part=>part.segment);
  tokens=tokens.reduce((out,part)=>{if(/^[，。、；：！？）》】]+$/.test(part)&&out.length)out[out.length-1]+=part;else out.push(part);return out;},[]);
  if(tokens.at(-1)==='通知'&&tokens.length>1)tokens.splice(-2,2,tokens.at(-2)+tokens.at(-1));
 }
 const lines=balancedLines(tokens);return lines?{lines,errors:[]}:{lines:[text],errors:['标题含过长的完整词组或产品编号，请在标题栏按词意换行']};
}
export function attachmentLayout(items){
 const multiple=items.length>1;
 return items.map((item,index)=>{
  const name=noticeTextStyle(item.name??item),number=multiple?`${index+1}.`:'',prefix=index===0?'附件：'+number:number;
  const start=index===0?2:5,prefixEm=textEmWidth(prefix);return {name,prefix,nameEm:start+prefixEm,hangingEm:prefixEm};
 });
}
export function signoffLayout(issuer,date){
 const text=noticeTextStyle(issuer),rightChars=Math.round((4+(textEmWidth(date)-textEmWidth(text))/2)*100);
 return {issuer:text,date,issuerRightChars:rightChars,issuerRightTwips:Math.round(rightChars/100*320),dateRightChars:400,dateRightTwips:1280};
}
export function noticeLayoutErrors(doc,dateText){
 const errors=[...noticeTitleLayout(doc.title).errors];
 if(/[\r\n\t]/.test(doc.issuer))errors.push('发文单位不能包含换行或制表符');
 if(dateText&&signoffLayout(doc.issuer,dateText).issuerRightChars<0)errors.push('发文单位过长，请填写适合单行落款的正式署名');
 for(const attachment of doc.attachments){
  if(/[\r\n\t]/.test(attachment.name))errors.push('附件名称不能包含换行或制表符');
  if(/[。；;，,、：:！？!?]$/.test(attachment.name.trim()))errors.push('附件名称末尾不加标点符号');
 }
 return [...new Set(errors)];
}
