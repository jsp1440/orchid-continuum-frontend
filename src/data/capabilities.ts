/** Capability model from the Famous AI lexicon. Counts are derived from stored fields only. */
import { LexiconAsset, LexiconEntry, MediaType } from './types';

export type CapabilityKey = 'indexed' | 'defined' | 'enriched' | 'illustrated' | 'evidence_linked' | 'conservation_ready' | 'reviewed' | 'published';
export interface CapabilityDefinition { key: CapabilityKey; label: string; meaning: string; tone: 'stone' | 'fern' | 'orchid' | 'gold'; }
export const CAPABILITIES: CapabilityDefinition[] = [
  { key:'indexed', label:'Indexed', meaning:'The term exists as a governed concept with an identifier and a preferred label.', tone:'stone' },
  { key:'defined', label:'Defined', meaning:'A concise definition has been written for the concept.', tone:'stone' },
  { key:'enriched', label:'Scientifically enriched', meaning:'The record carries explanatory material beyond the definition — mechanism, significance, etymology, character states or taxa.', tone:'fern' },
  { key:'illustrated', label:'Illustrated', meaning:'At least one figure is linked to the concept. Illustration is a capability, not a statement that the science is finished.', tone:'orchid' },
  { key:'evidence_linked', label:'Evidence-linked', meaning:'One or more literature or evidence records are attached to the concept.', tone:'fern' },
  { key:'conservation_ready', label:'Conservation-ready', meaning:'The record carries structured field guidance: what to record, minimum evidence and what must not be inferred.', tone:'fern' },
  { key:'reviewed', label:'Reviewed', meaning:'A named reviewer has assessed the record. Absent until a real review exists.', tone:'gold' },
  { key:'published', label:'Published', meaning:'The record has been released as a published concept of the lexicon.', tone:'gold' },
];
export const CAPABILITY_LABEL = CAPABILITIES.reduce((acc,c)=>({ ...acc,[c.key]:c.label }),{} as Record<CapabilityKey,string>);
export const CAPABILITY_MEANING = CAPABILITIES.reduce((acc,c)=>({ ...acc,[c.key]:c.meaning }),{} as Record<CapabilityKey,string>);
const has=(v:unknown):boolean=>Array.isArray(v)?v.length>0:!!v;
export function hasFigure(entry:LexiconEntry):boolean{return (entry.assets??[]).some((a)=>!!a.url||!!a.schematic);}
export function conceptCapabilities(entry:LexiconEntry):CapabilityKey[]{const m=entry.maturity??[];const out:CapabilityKey[]=['indexed'];if(has(entry.quick_definition?.trim()))out.push('defined');if(m.includes('scientifically_enriched')||has(entry.expanded_definition)||has(entry.mechanism_blocks)||has(entry.significance_blocks)||has(entry.etymology?.segments)||has(entry.character_states)||has(entry.example_taxa))out.push('enriched');if(hasFigure(entry)||m.includes('illustrated'))out.push('illustrated');if(has(entry.literature)||m.includes('literature_linked'))out.push('evidence_linked');const c=entry.conservation;if(c&&(has(c.what_to_record)||has(c.minimum_evidence)||has(c.why_it_matters)))out.push('conservation_ready');if(m.includes('expert_reviewed')||entry.review_state==='expert_reviewed'||!!entry.provenance?.scientific_reviewer)out.push('reviewed');if(entry.review_state==='published')out.push('published');return out;}
export function hasCapability(entry:LexiconEntry,key:CapabilityKey):boolean{return conceptCapabilities(entry).includes(key);}
export function hasIdentificationRelevance(entry:LexiconEntry):boolean{return has(entry.identification_significance)||has(entry.identification_cautions)||has(entry.character_states)||(entry.maturity??[]).includes('identification_linked');}
export const MEDIA_TYPE_LABEL:Record<MediaType,string>={static_illustration:'Static illustration',annotated_photo:'Annotated photograph',interactive_diagram:'Interactive diagram',animation:'Animation',video:'Video',model_3d:'3D / interactive model'};
export const mediaTypeOf=(asset:LexiconAsset):MediaType=>asset.media_type??(asset.kind==='annotated_photograph'?'annotated_photo':'static_illustration');
export interface CatalogueFigure{asset:LexiconAsset;entry:LexiconEntry;}
export function figureCatalogue(entries:LexiconEntry[]):CatalogueFigure[]{const out:CatalogueFigure[]=[];entries.forEach((entry)=>(entry.assets??[]).forEach((asset)=>{if(asset.url||asset.schematic)out.push({asset,entry});}));return out;}
export interface CorpusStats{capability:Record<CapabilityKey,number>;categories:number;with_etymology:number;with_identification:number;with_relationships:number;figures_catalogued:number;imported_records:number;}
export function computeCorpusStats(entries:LexiconEntry[]):CorpusStats{const capability=CAPABILITIES.reduce((acc,c)=>({...acc,[c.key]:0}),{} as Record<CapabilityKey,number>);const figureIds=new Set<string>();let with_etymology=0,with_identification=0,with_relationships=0,imported_records=0;entries.forEach((e)=>{conceptCapabilities(e).forEach((k)=>{capability[k]+=1;});if(has(e.etymology?.segments))with_etymology+=1;if(hasIdentificationRelevance(e))with_identification+=1;if(has(e.relationships))with_relationships+=1;if(e.source_system||e.import_batch)imported_records+=1;(e.assets??[]).forEach((a)=>{if(a.url||a.schematic)figureIds.add(a.id||`${e.slug}:${a.title??'figure'}`);});});return{capability,categories:new Set(entries.map((e)=>e.category).filter(Boolean)).size,with_etymology,with_identification,with_relationships,figures_catalogued:figureIds.size,imported_records};}
export function capabilityLedger(stats:CorpusStats):{label:string;value:number;meaning:string}[]{return CAPABILITIES.map((c)=>({label:c.label,value:stats.capability[c.key],meaning:c.meaning}));}
