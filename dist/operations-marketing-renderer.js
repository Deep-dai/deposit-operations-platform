import {operationGroups,briefStats,opNumber,opRate,opPercent} from './operations-model.js';

const W=1600,M=64,B=W-M*2;
const FONT='"PingFang SC","Microsoft YaHei",sans-serif';
const DISPLAY='"Songti SC","STSong","SimSun",serif';
const COLORS={red:{top:'#b61620',bottom:'#760b18',dark:'#6b1420',main:'#b21c28',head:'#cf5539',sub:'#e78b65'},navy:{top:'#173c55',bottom:'#081b30',dark:'#173b50',main:'#225574',head:'#2d647c',sub:'#588493'}};
let ribbonPromise;
export function marketingRibbon(){return ribbonPromise||(ribbonPromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{ribbonPromise=null;reject(Error('装饰模板未能加载，请刷新后重试'));};img.src=new URL('./assets/operations/gold-ribbon.webp',import.meta.url).href;}));}
function font(ctx,size,weight=400,display=false){ctx.font=`${weight} ${size}px ${display?DISPLAY:FONT}`;ctx.textAlign='left';ctx.textBaseline='top';}
function wrap(ctx,value,width,size=26,weight=400,display=false){font(ctx,size,weight,display);const result=[];for(const p of String(value??'').split('\n')){let line='';for(const char of p){if(line&&ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}result.push(line);}return result;}
function text(ctx,value,x,y,size=26,color='#4b3329',weight=400,align='left',display=false){font(ctx,size,weight,display);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
function fitted(ctx,value,x,y,width,size=26,color='#4b3329',weight=400,align='left',display=false){font(ctx,size,weight,display);while(ctx.measureText(String(value)).width>width&&size>16){size-=1;font(ctx,size,weight,display);}text(ctx,value,x,y,size,color,weight,align,display);}
function paragraph(ctx,value,x,y,width,size=26,color='#725549',weight=400,display=false){const ls=wrap(ctx,value,width,size,weight,display);ls.forEach((line,i)=>text(ctx,line,x,y+i*size*1.55,size,color,weight,'left',display));return ls.length*size*1.55;}
function gradient(ctx,x,y,w,h,stops){const g=ctx.createLinearGradient(x,y,x+w,y+h);stops.forEach(([at,color])=>g.addColorStop(at,color));return g;}
function gold(ctx,x,y,w,h){return gradient(ctx,x,y,w,h,[[0,'#e4b568'],[.3,'#fff0c1'],[.65,'#efd19a'],[1,'#ce9650']]);}
function box(ctx,x,y,w,h,r,fill,stroke='',lineWidth=1){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}}
function frame(ctx,x,y,w,h,r=20){
 ctx.save();ctx.shadowColor='#3c090730';ctx.shadowBlur=16;ctx.shadowOffsetY=6;box(ctx,x,y,w,h,r,'#ffefcf');ctx.restore();
 box(ctx,x,y,w,h,r,null,gold(ctx,x,y,w,h),3);box(ctx,x+9,y+9,w-18,h-18,Math.max(8,r-5),null,'#fff9df',1.4);
 const k=26;ctx.strokeStyle='#edc88b';ctx.lineWidth=2;for(const [cx,cy,dx,dy]of [[x+19,y+19,1,1],[x+w-19,y+19,-1,1],[x+19,y+h-19,1,-1],[x+w-19,y+h-19,-1,-1]]){ctx.beginPath();ctx.moveTo(cx,cy+dy*k);ctx.lineTo(cx,cy);ctx.lineTo(cx+dx*k,cy);ctx.stroke();}
}
function plaque(ctx,label,y,theme,{caption='',small=false}={}){
 const pw=small?430:1040,ph=small?68:caption?118:94,x=(W-pw)/2;
 const lineY=y+ph/2;ctx.strokeStyle='#e8c28a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(M+10,lineY);ctx.lineTo(x-20,lineY);ctx.moveTo(x+pw+20,lineY);ctx.lineTo(W-M-10,lineY);ctx.stroke();
 box(ctx,x,y,pw,ph,small?4:24,gold(ctx,x,y,pw,ph),'#fff0c1',2.5);box(ctx,x+7,y+7,pw-14,ph-14,small?2:19,null,'#a46a38',1.4);
 for(const side of [-1,1]){const px=side<0?x-10:x+pw+10;ctx.save();ctx.translate(px,lineY);ctx.rotate(Math.PI/4);ctx.fillStyle='#f6dba4';ctx.fillRect(-6,-6,12,12);ctx.restore();}
 fitted(ctx,label,W/2,y+(small?16:caption?16:22),pw-80,small?34:46,theme.dark,700,'center',true);
 if(caption)fitted(ctx,caption,W/2,y+76,pw-80,24,'#99543b',400,'center');
 return ph;
}
function heroLayout(ctx,doc){let size=78,ls=wrap(ctx,doc.title,B,size,700,true);while(ls.length>2&&size>48){size-=2;ls=wrap(ctx,doc.title,B,size,700,true);}return {size,lines:ls,height:Math.max(504,168+ls.length*(size+22)+136)};}
function drawHero(ctx,doc,theme,asset,hero){
 ctx.fillStyle=gradient(ctx,0,0,W,hero.height,[[0,theme.top],[1,theme.bottom]]);ctx.fillRect(0,0,W,hero.height);
 ctx.save();ctx.beginPath();ctx.rect(0,0,W,hero.height);ctx.clip();ctx.globalAlpha=.8;const ah=W/asset.width*asset.height;ctx.drawImage(asset,0,hero.height-ah+75,W,ah);ctx.restore();
 ctx.fillStyle=gradient(ctx,0,0,W,0,[[0,theme.dark+'a0'],[.7,theme.dark+'00']]);ctx.fillRect(0,0,W,hero.height);
 text(ctx,'存款经营管理台',M,49,28,'#ffedc8',600);box(ctx,W-M-420,42,420,48,24,theme.dark+'95','#f1d29b33');text(ctx,doc.type==='brief'?'个人存款 · 经营通报':'结构性存款 · 营销素材',W-M-20,54,24,'#f7d7ab',400,'right');
 const fill=gold(ctx,0,150,W,150);ctx.save();ctx.shadowColor='#37030a99';ctx.shadowBlur=8;ctx.shadowOffsetY=4;
 hero.lines.forEach((line,i)=>text(ctx,line,M,154+i*(hero.size+22),hero.size,fill,700,'left',true));ctx.restore();
 const dateY=hero.height-105;box(ctx,M,dateY-13,doc.type==='brief'?760:545,58,29,'#4f081a65','#f5d59b55');
 text(ctx,`数据日期  ${doc.date}${doc.type==='brief'?'    单位  '+doc.unit:''}`,M+25,dateY,26,'#fff0d2',500);
 ctx.fillStyle=gold(ctx,0,hero.height-3,W,3);ctx.fillRect(0,hero.height-3,W,3);
}
function metrics(doc){
 if(doc.type==='brief'){const s=briefStats(doc.rows);return [{label:'纳入分行',value:s.count+'家'},{label:'月日均余额合计',value:opNumber(s.balance)+' '+doc.unit},{label:'计划完成率达到100%',value:s.achieved+'家'}];}
 const labeled=doc.rows.filter(r=>['低档','中档','高档'].includes(r.tier)),higher=labeled.filter(r=>['中档','高档'].includes(r.tier));
 const low=Math.min(...doc.rows.map(r=>Number(r.actual))),high=Math.max(...doc.rows.map(r=>Number(r.actual)));
 return [{label:'本次到期产品',value:doc.rows.length+'只'},{label:'实际到期年化收益率',value:low===high?opRate(low):opRate(low)+'—'+opRate(high)},{label:`中高档占比（已标注${labeled.length}只）`,value:labeled.length?opPercent(Math.round(higher.length/labeled.length*10000)/100):'—'}];
}
function drawMetrics(ctx,doc,theme,y){const width=(B-36)/3;metrics(doc).forEach((m,i)=>{const x=M+i*(width+18);box(ctx,x,y,width,132,14,gradient(ctx,x,y,width,132,[[0,theme.dark+'e8'],[1,theme.main+'c0']]),'#edc992',1.4);text(ctx,m.label,x+24,y+22,24,'#ebcba0');fitted(ctx,m.value,x+24,y+66,width-48,45,'#fff0c2',700);});}
const briefWidths=[74,170,200,140,140,140,178,218,212];
function briefRowHeight(ctx,row){return Math.max(66,...[row.branch,...['balance','daily','monthly','annual','completion','yearBalance','yearGrowth'].map(k=>opNumber(row[k]))].map((v,i)=>wrap(ctx,v,briefWidths[i+1]-26,27).length*39+22));}
function drawBriefHeader(ctx,y,theme){
 let x=M;const top=48,sub=58,total=top+sub;ctx.fillStyle=gradient(ctx,M,y,0,total,[[0,theme.head],[1,theme.main]]);ctx.fillRect(M,y,B,total);
 const line=(x1,y1,x2,y2)=>{ctx.strokeStyle='#f7d6b08c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 for(let i=0;i<2;i++){fitted(ctx,i===0?'序号':'分行',x+briefWidths[i]/2,y+41,briefWidths[i]-18,25,'#fff5df',600,'center');x+=briefWidths[i];line(x,y,x,y+total);}
 const monthWidth=briefWidths.slice(2,7).reduce((a,b)=>a+b,0),yearWidth=briefWidths.slice(7).reduce((a,b)=>a+b,0);
 text(ctx,'月日均',x+monthWidth/2,y+9,26,'#fff4da',600,'center');text(ctx,'年日均',x+monthWidth+yearWidth/2,y+9,26,'#fff4da',600,'center');line(x,y+top,W-M,y+top);line(x+monthWidth,y,W-M-yearWidth,y+total);
 for(const [i,label]of ['余额','日增','月增','年增','计划完成率','余额','年增'].entries()){fitted(ctx,label,x+briefWidths[i+2]/2,y+top+17,briefWidths[i+2]-20,24,'#fff4da',600,'center');x+=briefWidths[i+2];line(x,y+top,x,y+total);}
}
function drawBriefRow(ctx,row,index,y,h,theme,total=false){
 ctx.fillStyle=total?'#ffe6ad':index%2===0?'#fffdf7':'#fff4e4';ctx.fillRect(M,y,B,h);
 const values=total?['','本次合计',opNumber(row.balance),opNumber(row.daily),opNumber(row.monthly),opNumber(row.annual),'—',opNumber(row.yearBalance),opNumber(row.yearGrowth)]:[index+1,row.branch,...['balance','daily','monthly','annual'].map(k=>opNumber(row[k])),opPercent(row.completion),opNumber(row.yearBalance),opNumber(row.yearGrowth)];
 let x=M;
 for(let i=0;i<values.length;i++){
  if(total&&i===0){x+=briefWidths[i];continue;}
  const width=total&&i===1?briefWidths[0]+briefWidths[1]:briefWidths[i],left=total&&i===1?M:x;
  const color=i===6?theme.main:[3,4,5,8].includes(i)&&String(values[i]).startsWith('-')?'#23804a':'#533d31';
  const align=i<2?'center':'right',px=align==='center'?left+width/2:left+width-15;
  fitted(ctx,values[i],px,y+(h-29)/2,width-24,27,color,i===6||total?700:400,align);
  x+=briefWidths[i];ctx.strokeStyle='#e4caa15e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.stroke();
 }
 ctx.strokeStyle='#d8b58370';ctx.beginPath();ctx.moveTo(M,y+h);ctx.lineTo(W-M,y+h);ctx.stroke();
}
function shortName(row){const family=row.name.match(/乐赢(智信|慧信)/)?.[1],period=row.name.match(/结构性存款([A-Z]+\d+)期/)?.[1];return family&&period?`${family}${period}期`:row.code;}
function rateRuns(ctx,row,x,y,width,theme){const values=['low','mid','high'].filter(k=>row[k]!==''&&row[k]!==null&&row[k]!==undefined).map(k=>opRate(row[k]));fitted(ctx,values.join(' / ')||'未列明',x+width/2,y,width-30,30,'#926a48',500,'center');}
function drawMaturityRow(ctx,row,index,y,h,theme){
 const x=M+18,w=B-36;ctx.fillStyle=index%2===0?'#fff3dc':'#ffead0';ctx.fillRect(x,y,w,h);box(ctx,x+24,y+20,410,50,25,gradient(ctx,x,y,410,50,[[0,theme.main],[1,theme.head]]));fitted(ctx,shortName(row),x+229,y+30,370,29,'#fff2d4',650,'center');
 paragraph(ctx,row.name,x+25,y+82,520,19,'#917353');text(ctx,`${row.code}  ·  ${row.maturity}`,x+25,y+h-35,18,'#a58361');
 rateRuns(ctx,row,M+575,y+49,485,theme);text(ctx,'参考收益档位',M+818,y+100,20,'#a98b6c',400,'center');
 fitted(ctx,opRate(row.actual),M+B-203,y+28,340,55,theme.main,750,'center');text(ctx,row.tier||'档位未标注',M+B-203,y+98,23,'#9e6c44',500,'center');
 ctx.setLineDash([7,7]);ctx.strokeStyle='#d3ac7b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+24,y+h);ctx.lineTo(x+w-24,y+h);ctx.stroke();ctx.setLineDash([]);
}
function minimumText(p){const unit=p.minimumUnit||'元',currency=p.currency||'人民币';return opNumber(p.minimum,0)+(unit==='万元'?(currency==='人民币'?'万元':'万'+currency):currency==='人民币'?'元':currency);}
function recommendationHeight(ctx,p){return wrap(ctx,p.name,B-110,30,600).length*47+310;}
function drawRecommendation(ctx,p,index,y,h,theme){
 frame(ctx,M,y,B,h,18);const header=gold(ctx,M,y,B,72);ctx.save();ctx.beginPath();ctx.roundRect(M+11,y+11,B-22,68,12);ctx.clip();ctx.fillStyle=header;ctx.fillRect(M+11,y+11,B-22,68);ctx.restore();
 text(ctx,String(index+1).padStart(2,'0'),M+34,y+24,31,theme.dark,700,'left',true);text(ctx,`${p.family?'乐赢'+p.family+'系列':'本周重点产品'}${p.currency?' · '+p.currency:''}`,M+112,y+29,27,theme.dark,600);
 const titleH=paragraph(ctx,p.name,M+36,y+101,B-80,30,theme.dark,650),rateY=y+titleH+127;
 const rates=['low','mid','high'].filter(k=>p[k]!==''&&p[k]!==null&&p[k]!==undefined).map(k=>opRate(p[k])).join(' / ');
 fitted(ctx,rates,M+40,rateY,870,52,theme.main,750);text(ctx,'预期年化收益率',M+42,rateY+66,24,'#a47e5c');
 for(const [i,label]of [`期限  ${p.tenor}天`,`起存金额  ${minimumText(p)}`].entries()){box(ctx,M+1000,rateY-6+i*55,430,46,10,'#f5d5b1');fitted(ctx,label,M+1020,rateY+4+i*55,390,26,'#8c422f',500);}
 box(ctx,M+36,y+h-63,B-72,41,10,'#f7d9b6');fitted(ctx,`产品代码 ${p.code||'—'}    募集期 ${p.start} 至 ${p.end}`,W/2,y+h-55,B-110,23,'#945740',500,'center');
}
function layout(ctx,doc){
 const hero=heroLayout(ctx,doc),blocks=[];let y=hero.height+24;blocks.push({kind:'metrics',y});y+=160;
 const summaryHeight=wrap(ctx,doc.summary,B-80,26).length*41+82;blocks.push({kind:'summary',y,h:summaryHeight});y+=summaryHeight+36;
 if(doc.type==='brief'){
  for(const group of operationGroups(doc)){
   const headY=y+84,rowHeights=group.rows.map(row=>briefRowHeight(ctx,row)),h=106+rowHeights.reduce((a,b)=>a+b,0);blocks.push({kind:'brief',y,headY,group,rowHeights,h});y=headY+h+32;
  }
  const s=briefStats(doc.rows),row={...s,yearBalance:doc.rows.reduce((n,r)=>n+Number(r.yearBalance),0),yearGrowth:doc.rows.reduce((n,r)=>n+Number(r.yearGrowth),0)};
  blocks.push({kind:'total',y,row,h:78});y+=112;
 }else{
  const dates=doc.rows.map(r=>r.maturity).sort(),caption=dates[0]===dates.at(-1)?dates[0]:dates[0]+' 至 '+dates.at(-1);
  blocks.push({kind:'plaque',y,label:'本次到期产品表现',caption});y+=144;
  const rowHeights=doc.rows.map(r=>Math.max(150,wrap(ctx,r.name,520,19).length*30+110)),h=rowHeights.reduce((a,b)=>a+b,0)+100;
  blocks.push({kind:'maturity',y,h,rowHeights});y+=h+40;
  blocks.push({kind:'plaque',y,label:'本周重点推荐产品',caption:doc.recommendations.length+'只产品 · 以当期发行安排为准'});y+=144;
  if(!doc.recommendations.length){blocks.push({kind:'empty',y,h:100});y+=132;}
  doc.recommendations.forEach((product,index)=>{const h=recommendationHeight(ctx,product);blocks.push({kind:'recommendation',y,h,product,index});y+=h+28;});
 }
 const footerH=wrap(ctx,doc.note,B-60,25).length*40+64;blocks.push({kind:'footer',y,h:footerH});return {hero,blocks,height:Math.ceil(y+footerH+112)};
}
export async function renderMarketingOperation(canvas,doc){
 const asset=await marketingRibbon();await document.fonts.ready;canvas.width=W;canvas.height=100;let ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器不支持图片生成');
 const p=layout(ctx,doc);if(p.height>16000)throw Error('图片内容过多，请分批制作');canvas.height=p.height;ctx=canvas.getContext('2d');const theme=COLORS[doc.theme]||COLORS.red;
 ctx.fillStyle=gradient(ctx,0,0,W,p.height,[[0,theme.top],[.55,theme.main],[1,theme.bottom]]);ctx.fillRect(0,0,W,p.height);
 ctx.save();ctx.strokeStyle='#ffe3b322';ctx.lineWidth=1;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(12+i*11,0);ctx.lineTo(12+i*11,p.height);ctx.moveTo(W-12-i*11,0);ctx.lineTo(W-12-i*11,p.height);ctx.stroke();}ctx.restore();
 drawHero(ctx,doc,theme,asset,p.hero);
 for(const block of p.blocks){
  const {y,h}=block;
  if(block.kind==='metrics')drawMetrics(ctx,doc,theme,y);
  if(block.kind==='summary'){box(ctx,M,y,B,h,16,'#fff1d9','#f2d0a0',2);text(ctx,doc.type==='brief'?'经营摘要':'到期表现摘要',M+30,y+20,25,theme.main,650);paragraph(ctx,doc.summary,M+40,y+62,B-80,26,'#7f5742');}
  if(block.kind==='brief'){
   plaque(ctx,block.group.name,y,theme,{small:true});drawBriefHeader(ctx,block.headY,theme);let rowY=block.headY+106;block.group.rows.forEach((row,i)=>{drawBriefRow(ctx,row,i,rowY,block.rowHeights[i],theme);rowY+=block.rowHeights[i];});box(ctx,M,block.headY,B,h,0,null,'#f0cd91',2);
  }
  if(block.kind==='total'){drawBriefRow(ctx,block.row,0,y,h,theme,true);box(ctx,M,y,B,h,0,null,'#f0cd91',2);}
  if(block.kind==='plaque')plaque(ctx,block.label,y,theme,{caption:block.caption});
  if(block.kind==='maturity'){
   frame(ctx,M,y,B,h);const widths=[560,500,376];let x=M+18;['产品名称 / 代码','参考收益档位','实际到期年化收益率'].forEach((label,i)=>{fitted(ctx,label,x+widths[i]/2,y+34,widths[i]-25,26,theme.dark,700,'center');x+=widths[i];});let rowY=y+80;doc.rows.forEach((r,i)=>{drawMaturityRow(ctx,r,i,rowY,block.rowHeights[i],theme);rowY+=block.rowHeights[i];});
  }
  if(block.kind==='recommendation')drawRecommendation(ctx,block.product,block.index,y,h,theme);
  if(block.kind==='empty'){frame(ctx,M,y,B,h);text(ctx,'暂未选择本周重点产品',W/2,y+34,28,'#9c7958',400,'center');}
  if(block.kind==='footer'){box(ctx,M,y,B,h,12,'#ffffff0b','#f3d59b55');paragraph(ctx,doc.note,M+30,y+26,B-60,25,'#f9e2bd');}
 }
 text(ctx,'存款经营管理台',M,p.height-63,25,'#f0cea0',500);text(ctx,doc.type==='brief'?'经营数据 · 分行推动':'产品表现 · 营销支持',W-M,p.height-61,22,'#e8c79c',400,'right');
 canvas.setAttribute('aria-label',`${doc.title}，共${doc.rows.length}条数据`);return canvas;
}
