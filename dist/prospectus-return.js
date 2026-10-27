import {COMPARE_FIELDS,clone,validate,now,log} from './core.js';
import {normalizeName} from './prospectus-parser.js';
export const sourceFields=p=>[['marketNumber','产品代码'],...COMPARE_FIELDS.filter(([key])=>p.type==='rolling'||!['observeStart','observeEnd'].includes(key))];
export function matchReturn(state,result){
 return state.products.filter(p=>p.status==='market'&&p.approved&&
   ((result.fields.marketNumber&&p.marketNumber===result.fields.marketNumber)||normalizeName(p.approved.name)===normalizeName(result.fields.name)));
}
export function validateReturn(state,id,{market,document,result,confirmed=false,role='manager'}){
 const p=state.products.find(p=>p.id===id);
 if(role!=='manager')throw Error('请切换至产品经理');
 if(!p||p.status!=='market'||!p.approved)throw Error('仅能接收金市办理中的已复核申报');
 if(result.errors.length)throw Error(result.errors[0]);
 if(!confirmed)throw Error('请核对金市最终要素、说明书识别结果及手填字段');
 if(!matchReturn(state,result).some(x=>x.id===id))throw Error('说明书名称或产品代码与当前申报不匹配，请选择正确的申报');
 if(!document.marketNumber||document.marketNumber!==result.fields.marketNumber)throw Error('说明书产品代码不能手工改写');
 if(!market.marketNumber?.trim())throw Error('请填写金市最终产品代码');
 if(market.marketNumber!==document.marketNumber)throw Error('金市最终产品代码与说明书不一致，请反馈金市核实');
 for(const [kind,data]of [['金市最终要素',market],['说明书要素',document]]){
   const errors=validate({...p,...data},state,{ignoreId:p.id});if(errors.length)throw Error(`${kind}：${errors[0].label}${errors[0].message}`);
 }
 return p;
}
export function applyReturn(state,id,payload,source){
 const p=validateReturn(state,id,payload);
 if(!source?.id||source.hash!==payload.result.hash)throw Error('说明书原件尚未保存');
 p.market=clone(payload.market);p.prospectus=clone(payload.document);p.marketNumber=payload.market.marketNumber;
 p.prospectusSource={...source,extras:clone(payload.result.extras),evidence:clone(payload.result.evidence),
   manualFields:sourceFields(p).map(([key])=>key).filter(key=>!Object.hasOwn(payload.result.fields,key)),reviewedAt:now()};
 p.status='check';p.updated=now();log(p,'金市回传',`已接收 ${source.name}，原文识别及人工补充分别留存；待一致性校验`);return p;
}
