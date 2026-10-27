import {parseProspectus} from './prospectus-parser.js';
let zipLoading;
async function jszip(){if(globalThis.JSZip)return globalThis.JSZip;if(!zipLoading)zipLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/jszip.min.js',import.meta.url).href;script.onload=()=>resolve(globalThis.JSZip);script.onerror=()=>reject(Error('Word读取组件未能加载，请刷新后重试'));document.head.append(script);});return zipLoading;}
export async function readProspectus(file){
  if(file.size>20*1024*1024)throw Error('单份说明书请控制在20MB以内');
  const data=new Uint8Array(await file.arrayBuffer()),extension=file.name.split('.').at(-1).toLowerCase();let pages;
  if(extension==='pdf'){
    const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
    const task=pdfjs.getDocument({data:data.slice(),isEvalSupported:false,useSystemFonts:true,stopAtErrors:true});
    const pdf=await task.promise;
    try{
      if(pdf.numPages>50)throw Error('单份说明书超过50页，请拆分后识别');pages=[];
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n),content=await page.getTextContent();let lineY=null,line=[],lines=[];
        const flush=()=>{if(line.length)lines.push(line.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' '));line=[];};
        for(const item of content.items){if(!('str'in item))continue;const y=item.transform[5];if(lineY!==null&&Math.abs(y-lineY)>3)flush();lineY=y;line.push(item);if(item.hasEOL){flush();lineY=null;}}
        flush();pages.push({page:n,text:lines.join('\n')});page.cleanup();
      }
    }finally{await pdf.destroy();}
  }else if(extension==='docx'){
    const Zip=await jszip(),zip=await Zip.loadAsync(data);const entry=zip.file('word/document.xml');if(!entry)throw Error('文件不是有效的Word文档');
    if(entry._data?.uncompressedSize>8*1024*1024)throw Error('Word正文过大，请拆分后识别');
    const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
    if(xml.getElementsByTagName('parsererror').length)throw Error('Word正文格式损坏');
    pages=[{page:null,text:[...xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','p')].map(p=>[...p.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','t')].map(t=>t.textContent).join('')).join('\n')}];
  }else if(extension==='doc')throw Error('旧版.doc暂不能直接识别，请另存为.docx或可提取文字的PDF。');
  else throw Error('请选择PDF或.docx产品说明书');
  if(pages.map(p=>p.text).join('').replace(/\s/g,'').length<100)throw Error('未提取到足够文字，扫描PDF请提供可提取文字的版本。');
  const digest=await crypto.subtle.digest('SHA-256',data);
  return {...parseProspectus(pages),file,pages,hash:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')};
}
let database;
function db(){return database||(database=new Promise((resolve,reject)=>{const req=indexedDB.open('deposit-original-files',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('未能打开本地文件存储'));}));}
export async function storeOriginal(result){
  const store=await db(),id=result.hash;
  await new Promise((resolve,reject)=>{const tx=store.transaction('files','readwrite');tx.objectStore('files').put({id,blob:result.file,name:result.file.name});tx.oncomplete=resolve;tx.onerror=()=>reject(Error('原件保存失败，请检查浏览器可用空间'));});
  return {id,name:result.file.name,type:result.file.type,size:result.file.size,pages:result.pages[0]?.page===null?null:result.pages.length,hash:result.hash};
}
export async function originalFile(id){const store=await db();return new Promise((resolve,reject)=>{const req=store.transaction('files').objectStore('files').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('未能读取原件'));});}
