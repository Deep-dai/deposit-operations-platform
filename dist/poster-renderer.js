import {rateText} from './poster-model.js';

const fonts='"PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif';
const assets={};
function source(template) {
  if(!assets[template])assets[template]=new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>{delete assets[template];reject(Error('海报模板加载失败，请刷新后重试'));};
    img.src=new URL(`./assets/posters/${template}-source.jpg`,import.meta.url).href;
  });
  return assets[template];
}
function text(ctx,value,x,y,width,size,color='#252525',weight=400,align='left') {
  const str=String(value??'');
  ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=color;
  ctx.font=`${weight} ${size}px ${fonts}`;
  while(ctx.measureText(str).width>width&&size>16){size-=.5;ctx.font=`${weight} ${size}px ${fonts}`;}
  if(ctx.measureText(str).width>width)throw Error('产品文字过长，请核对产品名称或挂钩说明');
  ctx.fillText(str,x,y);
}
function timeline(ctx,p,{xs,labelY,lineY,dateY,labelSize,dateSize}) {
  const labels=['起售','截止','起息','到期'], dates=[p.start,p.end,p.value,p.maturity];
  ctx.lineWidth=2;ctx.strokeStyle='#dfc9c2';ctx.beginPath();ctx.moveTo(xs[0],lineY);ctx.lineTo(xs[3],lineY);ctx.stroke();
  ctx.strokeStyle='#ee553f';ctx.beginPath();ctx.moveTo(xs[0],lineY);ctx.lineTo(xs[1],lineY);ctx.stroke();
  xs.forEach((x,index)=>{
    text(ctx,labels[index],x,labelY,160,labelSize,'#292929',500,'center');
    ctx.beginPath();ctx.arc(x,lineY,7,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#e94f38';ctx.stroke();
    text(ctx,dates[index].replaceAll('-','.'),x,dateY,index===0?190:210,dateSize,'#8a8a8a',400,'center');
  });
}
function drawSingle(ctx,img,p) {
  // Fixed brand artwork, disclosure, QR code and footer remain original pixels.
  ctx.drawImage(img,0,0);
  ctx.fillStyle='#fff';
  ctx.fillRect(80,2014,1330,130);
  ctx.fillRect(80,2155,1380,105);
  ctx.fillRect(80,2265,1390,155);
  text(ctx,p.name,100,2036,1300,58,'#cc000c',700);
  text(ctx,'预期',166,2181,120,25,'#222',400,'center');
  text(ctx,'年化收益率',166,2213,140,25,'#222',400,'center');
  text(ctx,rateText(p,'/'),280,2176,620,64,'#e43c22',700);
  text(ctx,p.code,925,2194,310,39,'#202020',500);
  text(ctx,p.risk||`期限：${p.tenor}天`,1260,2194,205,35,'#202020',500);
  timeline(ctx,p,{xs:[184,576,967,1360],labelY:2275,lineY:2340,dateY:2363,labelSize:33,dateSize:32});
}
function drawCard(ctx,p,y) {
  ctx.save();ctx.shadowColor='#e3a39355';ctx.shadowBlur=13;ctx.shadowOffsetY=7;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(42,y,996,386,22);ctx.fill();ctx.restore();
  ctx.lineWidth=1.5;ctx.strokeStyle='#cb8674';ctx.beginPath();ctx.roundRect(42,y,996,386,22);ctx.stroke();
  const gradient=ctx.createLinearGradient(300,y,780,y);gradient.addColorStop(0,'#ff931a');gradient.addColorStop(1,'#ff604e');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(300,y);ctx.lineTo(780,y);ctx.quadraticCurveTo(767,y+50,730,y+50);ctx.lineTo(350,y+50);ctx.quadraticCurveTo(313,y+50,300,y);ctx.fill();
  text(ctx,p.hook||`挂钩${p.underlying}`,540,y+13,430,25,'#fff',400,'center');
  text(ctx,p.name,77,y+75,927,40,'#ca000c',700);
  text(ctx,'预期',122,y+166,100,19,'#222',400,'center');
  text(ctx,'年化收益率',122,y+191,105,19,'#222',400,'center');
  text(ctx,rateText(p),184,y+158,515,47,'#e94127',700);
  text(ctx,p.code,729,y+179,165,25);
  text(ctx,`期限：${p.tenor}天`,1004,y+179,150,24,'#252525',400,'right');
  timeline(ctx,p,{xs:[137,406,676,944],labelY:y+250,lineY:y+296,dateY:y+313,labelSize:25,dateSize:24});
}
function drawCollection(ctx,img,model) {
  ctx.fillStyle='#f7efef';ctx.fillRect(0,0,model.width,model.height);
  ctx.drawImage(img,0,0,1080,640,0,0,1080,640);
  // The series label is variable too; take its neutral backdrop from the same artwork.
  ctx.drawImage(img,38,505,285,53,38,441,285,53);
  ctx.fillStyle='#e7442d';ctx.fillRect(44,452,5,33);
  text(ctx,model.seriesLabel,59,450,265,31,'#282828',600);
  model.products.forEach((p,index)=>drawCard(ctx,p,652+428*index));
  const footerY=640+428*model.products.length;
  ctx.drawImage(img,0,3208,1080,264,0,footerY,1080,264);
}

export async function renderPoster(canvas,model) {
  const img=await source(model.template);
  await document.fonts.ready;
  canvas.width=model.width;canvas.height=model.height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('当前浏览器不支持图片生成');
  ctx.imageSmoothingQuality='high';
  if(model.template==='single')drawSingle(ctx,img,model.products[0]);else drawCollection(ctx,img,model);
  canvas.setAttribute('aria-label',`${model.template==='single'?'单产品海报':'产品合集'}：${model.products.map(p=>p.name).join('、')}`);
  return canvas;
}

export async function posterBlob(model,format='png') {
  const canvas=await renderPoster(document.createElement('canvas'),model);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片导出失败，请重试')),format==='jpg'?'image/jpeg':'image/png',.95));
}
