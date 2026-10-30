import {operationGroups,briefStats,opNumber,opRate,opPercent,operationView} from './operations-model.js';
const FONT='"PingFang SC","Microsoft YaHei",sans-serif';
const W=1600,M=72,B=W-M*2;
const COLORS={red:{main:'#a6292c',dark:'#641c25',soft:'#fff4ed'},navy:{main:'#244858',dark:'#142c39',soft:'#eff5f6'}};
const text=(ctx,str,x,y,size=26,color='#273e48',weight=400,align='left')=>{ctx.font=`${weight} ${size}px ${FONT}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(str??''),x,y);};
function lines(ctx,str,width,size=26,weight=400){
 ctx.font=`${weight} ${size}px ${FONT}`;const result=[];
 for(const paragraph of String(str??'').split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}result.push(line);}
 return result;
}
function paragraph(ctx,str,x,y,width,size=26,color='#526875',weight=400){const ls=lines(ctx,str,width,size,weight);for(const [i,line]of ls.entries())text(ctx,line,x,y+i*size*1.6,size,color,weight);return ls.length*size*1.6;}
function round(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function blockTitle(ctx,label,y,theme,detail=''){ctx.fillStyle=theme.main;ctx.fillRect(M,y+4,5,30);text(ctx,label,M+20,y,31,theme.dark,650);if(detail)text(ctx,detail,W-M,y+6,22,'#819099',400,'right');return y+54;}
function rowHeight(ctx,cells,widths,{min=72,size=25}={}){return Math.max(min,...cells.map((v,i)=>lines(ctx,v,widths[i]-30,size).length*size*1.5+30));}
function tableRow(ctx,cells,widths,y,height,{head=false,highlight=false,theme,accent=[],negative=[]}={}){
 let x=M;ctx.fillStyle=head?theme.main:highlight?theme.soft:'#fff';ctx.fillRect(x,y,B,height);
 for(let i=0;i<cells.length;i++){
  const color=head?'#fff':negative.includes(i)?'#278675':accent.includes(i)?theme.main:'#334a55';
  const size=head?23:25,weight=head||accent.includes(i)?600:400;
  const ls=lines(ctx,cells[i],widths[i]-30,size,weight),top=y+(height-ls.length*size*1.5)/2;
  for(const [j,line] of ls.entries())text(ctx,line,x+15,top+j*size*1.5,size,color,weight);
  x+=widths[i];ctx.strokeStyle=head?'#ffffff24':'#e8edef';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+height);ctx.stroke();
 }
 ctx.strokeStyle='#e8edef';ctx.beginPath();ctx.moveTo(M,y+height);ctx.lineTo(W-M,y+height);ctx.stroke();
}
function specs(doc){
 if(doc.type==='plan')return [{label:'规划月份',value:doc.month.replace('-','年')+'月'},{label:'覆盖产品',value:doc.rows.length+'只'},{label:'产品大类',value:new Set(doc.rows.map(r=>r.category)).size+'类'}];
 if(doc.type==='brief'){const s=briefStats(doc.rows);return [{label:'纳入分行',value:s.count+'家'},{label:'月日均余额合计',value:opNumber(s.balance)+' '+doc.unit},{label:'计划完成率达100%',value:s.achieved+'家'}];}
 const labeled=doc.rows.filter(r=>['低档','中档','高档'].includes(r.tier)),higher=labeled.filter(r=>['中档','高档'].includes(r.tier));return [{label:'本次到期产品',value:doc.rows.length+'只'},{label:'已标注收益档位',value:labeled.length+'只'},{label:'其中中、高档产品',value:higher.length+'只'}];
}
function layout(ctx,doc){
 const blocks=[];let y=470;
 const summaryHeight=lines(ctx,doc.summary,B-64,26).length*42+72;blocks.push({type:'summary',y,height:summaryHeight});y+=summaryHeight+42;
 if(doc.type==='plan'){
  const widths=[160,285,190,185,230,406];
  for(const group of operationGroups(doc)){
   blocks.push({type:'group',y,name:group.name,count:group.rows.length});y+=58;
   blocks.push({type:'row',y,height:62,widths,cells:['期限','产品代码','产品报价','起存金额','购买限制','额度限制及说明'],head:true});y+=62;
   for(const row of group.rows){const cells=[row.term,row.code||'—',row.quote,row.minimum,row.purchase||'—',[row.quota,row.note].filter(Boolean).join('\n')||'—'];const height=rowHeight(ctx,cells,widths);blocks.push({type:'row',y,height,widths,cells,highlight:row.highlight,accent:[1,2]});y+=height;}
   y+=32;
  }
 }else if(doc.type==='brief'){
  const widths=[85,170,180,140,140,140,175,230,196];
  for(const group of operationGroups(doc)){
   blocks.push({type:'group',y,name:group.name,count:group.rows.length});y+=58;
   blocks.push({type:'row',y,height:84,widths,cells:['序号','分行','月日均\n余额','日增','月增','年增','计划\n完成率','年日均\n余额','年增'],head:true});y+=84;
   group.rows.forEach((row,index)=>{const cells=[index+1,row.branch,...['balance','daily','monthly','annual'].map(k=>opNumber(row[k])),opPercent(row.completion),opNumber(row.yearBalance),opNumber(row.yearGrowth)];blocks.push({type:'row',y,height:58,widths,cells,accent:[6],negative:[3,4,5,8].filter(i=>String(cells[i]).startsWith('-')),highlight:Number(row.completion)>=100});y+=58;});y+=30;
  }
  const s=briefStats(doc.rows),yearBalance=doc.rows.reduce((n,r)=>n+Number(r.yearBalance),0),yearGrowth=doc.rows.reduce((n,r)=>n+Number(r.yearGrowth),0);
  blocks.push({type:'row',y,height:70,widths,cells:['','本次合计',opNumber(s.balance),opNumber(s.daily),opNumber(s.monthly),opNumber(s.annual),'—',opNumber(yearBalance),opNumber(yearGrowth)],highlight:true});y+=102;
 }else{
  blocks.push({type:'title',y,label:'本次到期产品表现',detail:'实际收益 · 逐只展示'});y+=58;
  const widths=[630,220,260,346];blocks.push({type:'row',y,height:66,widths,cells:['产品名称 / 代码','到期日','实际收益档位','实际到期年化收益率'],head:true});y+=66;
  for(const row of doc.rows){const cells=[row.name+'\n'+row.code,row.maturity,row.tier||'未标注',opRate(row.actual)],height=rowHeight(ctx,cells,widths,{min:88,size:25});blocks.push({type:'row',y,height,widths,cells,accent:[3]});y+=height;}
  y+=48;blocks.push({type:'title',y,label:'本周重点产品',detail:doc.recommendations.length+'只产品'});y+=58;
  if(!doc.recommendations.length){blocks.push({type:'text',y,text:'暂未选择本周重点产品。'});y+=68;}
  for(const product of doc.recommendations){const title=lines(ctx,product.name,B-64,29,600),height=title.length*44+224;blocks.push({type:'recommendation',y,height,product});y+=height+24;}
 }
 y+=20;const foot=lines(ctx,doc.note,B-48,23).length*37+68;blocks.push({type:'footer',y,height:foot});return {blocks,height:Math.ceil(y+foot+68)};
}
export async function renderOperation(canvas,input){
 await document.fonts.ready;const doc=operationView(input),theme=COLORS[doc.theme]||COLORS.red;
 canvas.width=W;canvas.height=100;let ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器不支持图片生成');
 const plan=layout(ctx,doc);if(plan.height>16000)throw Error('图片内容过多，请分批制作');canvas.height=plan.height;ctx=canvas.getContext('2d');
 ctx.fillStyle='#f5f3f0';ctx.fillRect(0,0,W,plan.height);
 const gradient=ctx.createLinearGradient(0,0,W,310);gradient.addColorStop(0,theme.dark);gradient.addColorStop(1,theme.main);ctx.fillStyle=gradient;ctx.fillRect(0,0,W,326);
 ctx.save();ctx.strokeStyle='#ffffff12';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(W+100,360,240+i*85,0,Math.PI*2);ctx.stroke();}ctx.restore();
 text(ctx,'存款经营管理台',M,48,25,'#ffffffd9',500);text(ctx,doc.type==='plan'?'月度产品安排':doc.type==='brief'?'经营数据 · 分行推动':'到期表现 · 产品推荐',W-M,48,24,'#ffffffbd',400,'right');
 let titleSize=50,titleLines=lines(ctx,doc.title,B,titleSize,650);while(titleLines.length>2&&titleSize>38){titleSize-=2;titleLines=lines(ctx,doc.title,B,titleSize,650);}if(titleLines.length>2)throw Error('标题过长，请缩短标题后生成');titleLines.forEach((line,i)=>text(ctx,line,M,116+i*64,titleSize,'#fff',650));
 text(ctx,doc.type==='plan'?`${doc.month.replace('-','年')}月 · 产品销售安排`:`数据日期：${doc.date}${doc.type==='brief'?'    单位：'+doc.unit:''}`,M,276,24,'#ffe2cf');
 const cards=specs(doc),cw=(B-32)/3;
 cards.forEach((card,i)=>{const x=M+i*(cw+16);round(ctx,x,354,cw,92,12,'#fff');text(ctx,card.label,x+24,370,21,'#82919a');text(ctx,card.value,x+24,402,31,theme.dark,650);});
 for(const block of plan.blocks){
  if(block.type==='summary'){round(ctx,M,block.y,B,block.height,12,'#fff');text(ctx,doc.type==='brief'?'经营摘要':'工作提示',M+32,block.y+20,22,theme.main,600);paragraph(ctx,doc.summary,M+32,block.y+58,B-64,26);}
  if(block.type==='group'){round(ctx,M,block.y,B,46,8,'#e9e4dc');text(ctx,block.name,M+18,block.y+8,26,theme.dark,600);text(ctx,block.count+(doc.type==='plan'?'只产品':'家分行'),W-M-18,block.y+10,22,'#7d817e',400,'right');}
  if(block.type==='row')tableRow(ctx,block.cells,block.widths,block.y,block.height,{...block,theme});
  if(block.type==='title')blockTitle(ctx,block.label,block.y,theme,block.detail);
  if(block.type==='text')text(ctx,block.text,M,block.y,26,'#82919a');
  if(block.type==='recommendation'){
   const p=block.product,x=M,y=block.y;round(ctx,x,y,B,block.height,14,'#fff','#dfd9d0');ctx.fillStyle=theme.main;ctx.fillRect(x,y+20,5,40);
   const titleH=paragraph(ctx,p.name,x+32,y+24,B-64,29,theme.dark,600);text(ctx,p.code||'—',x+32,y+titleH+38,22,'#8a979e');
   const rateY=y+titleH+82,rates=['low','mid','high'].filter(k=>p[k]!==''&&p[k]!==null&&p[k]!==undefined).map(k=>opRate(p[k])).join(' / ');
   text(ctx,rates,x+32,rateY,40,theme.main,650);text(ctx,'预期年化收益率',x+32,rateY+54,22,'#85939b');
   text(ctx,`期限：${p.tenor}天     起存金额：${opNumber(p.minimum,0)}${p.minimumUnit||'元'}`,x+760,rateY+8,25,theme.dark,500);
   text(ctx,`募集期：${p.start} 至 ${p.end}`,x+32,y+block.height-50,25,'#667b86');
  }
  if(block.type==='footer'){round(ctx,M,block.y,B,block.height,10,'#eae7e1');paragraph(ctx,doc.note,M+24,block.y+22,B-48,23,'#74838b');}
 }
 text(ctx,'产品规划 · 经营推动 · 统一下发',M,plan.height-42,20,'#8d979b');text(ctx,'存款经营管理台',W-M,plan.height-42,20,'#8d979b',400,'right');
 canvas.setAttribute('aria-label',`${doc.title}，共${doc.rows.length}条数据`);return canvas;
}
export async function operationBlob(doc,format='png'){
 const canvas=await renderOperation(document.createElement('canvas'),doc);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片导出失败，请分批制作')),format==='jpg'?'image/jpeg':'image/png',.94));
}
