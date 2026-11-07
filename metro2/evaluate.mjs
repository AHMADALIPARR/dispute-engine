import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const inputFile=args[0] || path.join(path.dirname(new URL(import.meta.url).pathname),'dilute_metro2_package.json');
const outputFile=args[1] || null;
const pack=JSON.parse(fs.readFileSync(inputFile,'utf8'));
const get=(obj,k)=>k.split('.').reduce((acc,part)=>acc && typeof acc==='object'?acc[part]:undefined,obj);
function predicate(rec,p){
 const got=get(rec,p.field);
 switch(p.operator){
  case 'exists':return got!==undefined && got!==null && got!=='';
  case 'is_null':return got===null;
  case 'equals':return got!==undefined && got===p.value;
  case 'contains':return typeof got==='string' && got.includes(p.value);
  case 'not_equal_field': {const other=get(rec,p.value);return got!==undefined && got!==null && other!==undefined && other!==null && got!==other;}
  default:throw new Error(`Unknown operator: ${p.operator}`);
 }
}
function evaluate(pack){
 const records=[...pack.records.tradelines,...pack.records.inquiries];
 const cases=[];
 for(const record of records){
  const rr=pack.rules.filter(r=>r.target===record.type || r.target==='inquiry'&&record.inquiry_date);
  for(const rule of rr){
   const checks=rule.condition.all.map(p=>({field:p.field,operator:p.operator,passed:predicate(record,p)}));
   cases.push({record_id:record.id,rule_id:rule.id,issue:rule.issue,status:checks.every(x=>x.passed)?'human_review_required':'needs_evidence',checks,required_evidence:rule.evidence_required,proposed_request:rule.request,legal_basis:rule.legal_basis});
  }
 }
 return {schema_version:pack.schema_version,engine:pack.engine,mode:'dry_run',cases,matched_count:cases.filter(c=>c.status==='human_review_required').length,generated_at:null};
}
const result=evaluate(pack);
if(outputFile)fs.writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n');
else process.stdout.write(JSON.stringify(result,null,2)+'\n');
export {evaluate,predicate};
