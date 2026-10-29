import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {seed,clone} from '../dist/core.js';
import {ensureAdditionalProducts,COLLECTION_ISSUE_ID} from '../dist/product-fixtures.js';
import {buildNoticeDocument,noticeConfig,saveNotice,noticeErrors} from '../dist/notice-model.js';
import {noticeDocx} from '../dist/notice-export.js';
import {noticeTitleLayout,textEmWidth} from '../dist/notice-layout.js';

function zipFiles(buffer){
 const files={};let offset=0;
 while(offset<buffer.length-30&&buffer.readUInt32LE(offset)===0x04034b50){
  const method=buffer.readUInt16LE(offset+8),size=buffer.readUInt32LE(offset+18),n=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),name=buffer.subarray(offset+30,offset+30+n).toString(),start=offset+30+n+extra;
  const data=buffer.subarray(start,start+size);if(name.endsWith('.xml'))files[name]=(method===8?inflateRawSync(data):data).toString();offset=start+size;
 }
 return files;
}
function fixture(count=12){const state=seed();ensureAdditionalProducts(state);const issue=state.issues.find(i=>i.id===COLLECTION_ISSUE_ID);issue.productIds=issue.productIds.slice(0,count);const config={...noticeConfig(issue),date:'2026-10-29',issuer:'零售银行部'};return {state,issue,config,doc:buildNoticeDocument(state,issue,config)};}
const paragraphs=xml=>[...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map(m=>m[1]);
const styled=(xml,name)=>paragraphs(xml).filter(p=>p.includes(`w:pStyle w:val="Gongwen${name}"`));
const filesFor=async doc=>zipFiles(Buffer.from(await (await noticeDocx(doc)).arrayBuffer()));

test('公文导出固定A4、四边边距、22行网格及28字版心，无黑点或孤行控制属性',async()=>{
 const {doc}=fixture(),before=clone(doc),files=await filesFor(doc),xml=files['word/document.xml'];assert.deepEqual(doc,before);
 for(const [key,value]of Object.entries({top:1899,bottom:1843,left:1474,right:1417,gutter:0}))assert.match(xml,new RegExp('w:'+key+'="'+value+'"'));
 assert.match(xml,/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);assert.equal(Math.floor((11906-1474-1417)/320),28);
 assert.match(xml,/<w:docGrid[^>]*w:type="lines"/);assert.match(xml,/<w:docGrid[^>]*w:linePitch="595"/);assert.match(xml,/<w:docGrid[^>]*w:charSpace="0"/);
 for(const [name,part]of Object.entries(files))assert.doesNotMatch(part,/<w:(?:keepNext|keepLines|pageBreakBefore|suppressLineNumbers|widowControl)\b/,name);
 for(const p of paragraphs(xml)){assert.match(p,/<w:adjustRightInd w:val="0"\/>/);assert.match(p,/<w:snapToGrid w:val="0"\/>/);}
 for(const name of ['H1','H2','H3'])for(const p of styled(xml,name)){assert.match(p,/w:firstLineChars="200"/);assert.match(p,/w:firstLine="640"/);assert.match(p,/w:line="590"/);}
 for(const p of styled(xml,'H1'))assert.match(p,/w:eastAsia="黑体"/);
 for(const p of styled(xml,'H2'))assert.match(p,/w:eastAsia="楷体_GB2312"/);
 for(const p of styled(xml,'H3')){assert.match(p,/w:eastAsia="仿宋_GB2312"/);assert.doesNotMatch(p,/<w:b\s*\/>/);}
 const table=xml.match(/<w:tbl>([\s\S]*?)<\/w:tbl>/)[1];assert.match(table,/w:tblCaption w:val="GongwenDataTable"/);assert.match(table,/w:tblLayout w:type="fixed"/);
 for(const p of paragraphs(table)){assert.match(p,/w:eastAsia="宋体"/);assert.match(p,/w:sz w:val="24"/);}
});
test('标题按完整词意分行，单期短标题不强制换行，显式换行在同一标题段且各run格式一致',async()=>{
 const single=fixture(1),multiple=fixture(3);assert.equal(noticeTitleLayout(single.doc.title).lines.length,1);
 assert.deepEqual(noticeTitleLayout(multiple.doc.title).lines,['关于发行结构性存款','C09001-C09003期产品的通知']);
 const many='关于发行结构性存款'+Array.from({length:12},(_,i)=>'A'+(80000+i*2)).join('、')+'期产品的通知';
 const plan=noticeTitleLayout(many);assert.deepEqual(plan.errors,[]);assert.equal(plan.lines.join(''),many);assert.ok(plan.lines.every(line=>textEmWidth(line)<=20.4));
 single.doc.title='关于发行结构性存款\nC09001期产品的通知';const xml=(await filesFor(single.doc))['word/document.xml'],titles=styled(xml,'MainTitle');assert.equal(titles.length,1);assert.match(titles[0],/<w:br\/>/);
 for(const run of titles[0].matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)){assert.match(run[1],/w:eastAsia="方正小标宋简体"/);assert.match(run[1],/w:sz w:val="44"/);}
});
test('单附件不编号，多个附件序号与续行对齐；日期右空四字，单位与日期中心对齐',async()=>{
 const {doc}=fixture(),xml=(await filesFor(doc))['word/document.xml'];
 const first=styled(xml,'AttachmentFirst')[0],items=styled(xml,'AttachmentItem');assert.match(first,/w:left="1920"/);assert.match(first,/w:hanging="1280"/);
 assert.match(items[8],/w:left="2080"/);assert.match(items[8],/w:hanging="480"/);assert.match(items[8],/>10\./);
 const issuer=styled(xml,'Issuer')[0],date=styled(xml,'Date')[0];assert.match(date,/w:right="1280"/);assert.match(date,/w:rightChars="400"/);
 assert.match(issuer,/w:right="1600"/);assert.match(issuer,/w:rightChars="500"/);
 doc.attachments=[{name:'产品说明书'}];const only=styled((await filesFor(doc))['word/document.xml'],'AttachmentFirst')[0];assert.match(only,/>附件：产品说明书</);assert.doesNotMatch(only,/>附件：1\./);assert.match(only,/w:left="1600"/);assert.match(only,/w:hanging="960"/);
});
test('排版无法满足的标题、附件或落款明确阻止导出，预览仍能供用户修改',async()=>{
 const {state,issue,config}=fixture(1);config.title='A'.repeat(80);saveNotice(state,issue,config);assert.ok(noticeErrors(state,issue).some(e=>e.includes('标题')));await assert.rejects(()=>noticeDocx(issue.notice.document),/标题/);
 config.title='发行通知';config.commonAttachments=['产品说明书。'];saveNotice(state,issue,config);assert.ok(noticeErrors(state,issue).some(e=>e.includes('末尾不加标点')));
 config.commonAttachments=[];config.issuer='某'.repeat(40);saveNotice(state,issue,config);assert.ok(noticeErrors(state,issue).some(e=>e.includes('发文单位过长')));
});
