import {chineseDate,shortDate} from './notice-model.js';

export async function noticeDocx(doc){
  const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,AlignmentType,BorderStyle,LineRuleType}=await import('./vendor/docx.mjs');
  const run=(text,font='仿宋_GB2312',size=32)=>new TextRun({text,font:{name:font,eastAsia:font},size,color:'000000'});
  const para=(text,{font='仿宋_GB2312',size=32,align=AlignmentType.JUSTIFIED,indent=true,...rest}={})=>new Paragraph({
    alignment:align,spacing:{line:590,lineRule:LineRuleType.AT_LEAST,before:0,after:0},
    indent:typeof indent==='object'?indent:indent?{firstLine:640}:undefined,snapToGrid:false,
    children:String(text).split('\n').flatMap((line,index)=>index?[new TextRun({break:1}),run(line,font,size)]:[run(line,font,size)]),...rest});
  const heading=text=>para(text,{font:'黑体',keepNext:true}),subheading=text=>para(text,{font:'楷体_GB2312',keepNext:true});
  const border={style:BorderStyle.SINGLE,size:4,color:'000000'},widths=[1550,3650,1660,1660];
  const cell=(value,index)=>new TableCell({width:{size:widths[index],type:WidthType.DXA},margins:{top:70,bottom:70,left:80,right:80},children:[para(value,{font:'宋体',size:22,indent:false,align:AlignmentType.CENTER,spacing:{line:290,lineRule:LineRuleType.AT_LEAST,before:0,after:0}})]});
  const rows=[['产品代码','产品名称','募集起始日','募集结束日'],...doc.rows.map(r=>[r.code,r.name,shortDate(r.start),shortDate(r.end)])];
  const table=new Table({width:{size:8520,type:WidthType.DXA},columnWidths:widths,borders:{top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border},
    rows:rows.map((values,index)=>new TableRow({tableHeader:index===0,cantSplit:true,children:values.map(cell)}))});
  const title=doc.title.startsWith('关于发行结构性存款')?doc.title.replace('关于发行结构性存款','关于发行结构性存款\n'):doc.title;
  const b=doc.body,children=[para(title,{font:'方正小标宋简体',size:44,indent:false,align:AlignmentType.CENTER}),para('',{size:16,indent:false}),
    para(`${doc.addressee}：`,{indent:false}),para(b.intro),heading('一、产品发行安排及产品概况'),para(b.schedule),table,
    heading('二、发行渠道'),para(doc.channels),heading('三、发行区域'),para(doc.region),heading('四、营销要点'),para(b.marketing),
    subheading('（一）额度分配和维护'),para(b.quota),subheading('（二）营销宣传'),para(b.promotion),subheading('（三）其它要求'),para(b.reporting),para(b.printing),para('特此通知。'),para('',{indent:false})];
  doc.attachments.forEach((a,index)=>children.push(para(`${index===0?'附件：':''}${index+1}.${a.name}`,{keepLines:true,indent:{left:1920,hanging:index===0?1280:String(index+1).length===1?320:480}})));
  children.push(para('',{indent:false}),para(doc.issuer,{align:AlignmentType.RIGHT,indent:{right:1280}}),para(chineseDate(doc.date),{align:AlignmentType.RIGHT,indent:{right:640}}));
  const file=new Document({creator:'',title:doc.title,description:'',styles:{default:{document:{run:{font:{name:'仿宋_GB2312',eastAsia:'仿宋_GB2312'},size:32,color:'000000'}}}},sections:[{
    properties:{page:{size:{width:11906,height:16838},margin:{top:1899,bottom:1843,left:1531,right:1417}}},children}]});
  return Packer.toBlob(file);
}
