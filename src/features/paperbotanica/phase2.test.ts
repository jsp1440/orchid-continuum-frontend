import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPaperBotanicaCollection, fetchPaperBotanicaProfile, fetchPaperBotanicaView, PAPERBOTANICA_REVIEW_STATE } from './api';
import { parsePaperBotanicaGlb } from './glb';
import { paperBotanicaDossierHref } from './navigation';
const mockedFetch = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', mockedFetch);
beforeEach(() => mockedFetch.mockReset());
const species = {
  species_id:'calypso-bulbosa', scientific_name:'Calypso bulbosa', accepted_name:'Calypso bulbosa', common_name:'Fairy Slipper', story_name:'', readiness:'READY FOR RECONSTRUCTION',publication_state:PAPERBOTANICA_REVIEW_STATE,organ_count:1,organ_evidence_classes:['HYPOTHETICAL'],missing_evidence_views:['frontal'],
  links:{canonical_species_resolve:'/api/platform/federation/resolve-species?name=Calypso%20bulbosa',paperbotanica_model:'/api/paperbotanica/species/calypso-bulbosa/model.glb',paperbotanica_evidence:'/api/paperbotanica/species/calypso-bulbosa/evidence',paperbotanica_package:'/api/paperbotanica/species/calypso-bulbosa/package'},
};
const profile = {...species,distribution:'UNKNOWN',habitat:'UNKNOWN',botanical_fact:'UNKNOWN',conservation_message:'UNKNOWN',sources:[{source_id:'fna',title:'FNA',url:'https://efloras.org',source_type:'flora',creator:'FNA',license:'Reference only',notes:''}], evidence:[{evidence_id:'e',source_id:'fna',evidence_class:'OBSERVED',structures:['flower'],view:'UNAVAILABLE',confidence:'PROBABLE',notes:''}],organs:[{organ_id:'DS',kind:'dorsal_sepal',label:'Dorsal sepal',evidence_class:'HYPOTHETICAL',attachment:'flower_center'}]};
function respond(payload:unknown){ mockedFetch.mockResolvedValue(new Response(JSON.stringify(payload),{status:200})); }
describe('strict producer/consumer boundaries',()=>{
  it.each(['organ_count','organ_evidence_classes','missing_evidence_views','links'])('rejects missing %s',async key=>{
    const bad={...species,[key]:undefined};respond({schema_version:'paperbotanica-collection-api/v1',species_count:1,species:[bad]});
    await expect(fetchPaperBotanicaCollection()).rejects.toThrow();
  });
  it.each([{sources:[null]},{sources:[{}]},{organs:[null]},{organs:[{}]},{evidence:[]},{evidence:[{...profile.evidence[0],source_id:'missing'}]}])('rejects malformed profile %j',async change=>{
    respond({...profile,...change});await expect(fetchPaperBotanicaProfile('calypso-bulbosa')).rejects.toThrow();
  });
  it('rejects another species returned by the endpoint',async()=>{respond(profile);await expect(fetchPaperBotanicaProfile('goodyera-oblongifolia')).rejects.toThrow();});
  it('rejects a PNG without review headers',async()=>{mockedFetch.mockResolvedValue(new Response('png',{headers:{'Content-Type':'image/png'}}));await expect(fetchPaperBotanicaView('/api/paperbotanica/species/calypso-bulbosa/views/front.png')).rejects.toThrow();});
  it('uses credentialed, cancellable transport for PNGs',async()=>{
    const controller=new AbortController();mockedFetch.mockResolvedValue(new Response('png',{headers:{'Content-Type':'image/png','X-PaperBotanica-Publication-State':PAPERBOTANICA_REVIEW_STATE,'X-PaperBotanica-Construction-Digest':'a'.repeat(64)}}));
    await fetchPaperBotanicaView('/api/paperbotanica/species/calypso-bulbosa/views/front.png',controller.signal);
    expect(mockedFetch.mock.calls[0][1]).toMatchObject({credentials:'include',signal:controller.signal});
  });
  it('does not widen malformed dossier identity',()=>{
    expect(paperBotanicaDossierHref({acceptedName:'123',scientificName:'Calypso bulbosa'})).toBeNull();
    expect(paperBotanicaDossierHref({acceptedName:'Calypso bulbosa'})).toBe('/paperbotanica?species=Calypso+bulbosa');
  });
});
interface TestGlb {
  meshes: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices: number }> }>;
  accessors: Array<{ bufferView: number; componentType: number; count: number; type: string; byteOffset: number }>;
  bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number }>;
}
function glb(change:(doc:TestGlb)=>void=()=>{}) {
  const doc={asset:{version:'2.0'},meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',byteOffset:4},{bufferView:1,componentType:5125,count:3,type:'SCALAR',byteOffset:0}],bufferViews:[{buffer:0,byteOffset:0,byteLength:40},{buffer:0,byteOffset:40,byteLength:12}],buffers:[{byteLength:52}]};
  change(doc);const json=new TextEncoder().encode(JSON.stringify(doc));const padded=new Uint8Array(Math.ceil(json.length/4)*4);padded.fill(32);padded.set(json);const buffer=new ArrayBuffer(28+padded.length+52);const view=new DataView(buffer);
  [0x46546c67,2,buffer.byteLength,padded.length,0x4e4f534a].forEach((v,i)=>view.setUint32(i*4,v,true));new Uint8Array(buffer,20,padded.length).set(padded);const h=20+padded.length;view.setUint32(h,52,true);view.setUint32(h+4,0x004e4942,true);
  [0,0,0,.01,0,0,0,.01,0].forEach((v,i)=>view.setFloat32(h+12+i*4,v,true));[0,1,2].forEach((v,i)=>view.setUint32(h+48+i*4,v,true));return buffer;
}
describe('GLB bounded subset',()=>{
  it('accepts an accessor ending exactly at the view boundary with a nonzero offset',()=>expect(parsePaperBotanicaGlb(glb()).vertices).toHaveLength(9));
  it('refuses access into the next view',()=>expect(()=>parsePaperBotanicaGlb(glb(d=>d.bufferViews[0].byteLength=36))).toThrow('bounds'));
  it('refuses fractional or excessive counts',()=>expect(()=>parsePaperBotanicaGlb(glb(d=>d.accessors[0].count=3.5))).toThrow());
  it('refuses distinct position buffers rather than displaying incorrect organs',()=>expect(()=>parsePaperBotanicaGlb(glb(d=>{d.accessors.push({...d.accessors[0]});d.meshes[0].primitives.push({attributes:{POSITION:2},indices:1});}))).toThrow('separate position'));
  it('refuses truncated binary chunks',()=>{const b=glb();expect(()=>parsePaperBotanicaGlb(b.slice(0,-4))).toThrow('length');});
});

describe('final review evidence regressions', () => {
  it.each([
    ['evidence', 'evidence_id', ''], ['evidence', 'evidence_id', '   '],
    ['evidence', 'confidence', ''], ['evidence', 'confidence', '   '],
    ['evidence', 'confidence', 'SCIENCE_APPROVED'],
    ['evidence', 'evidence_class', ''], ['evidence', 'evidence_class', 'UNKNOWN_CLASS'],
    ['organs', 'evidence_class', ''], ['organs', 'evidence_class', 'confirmed'],
    ['organs', 'attachment', '   '], ['organs', 'kind', ''], ['organs', 'organ_id', '   '],
  ])('rejects incomplete %s.%s (%s)', async (group, field, value) => {
    const original = group === 'evidence' ? profile.evidence[0] : profile.organs[0];
    respond({...profile, [group]: [{...original, [field]: value}]});
    await expect(fetchPaperBotanicaProfile('calypso-bulbosa')).rejects.toThrow();
  });
  it('accepts complete records with empty notes', async () => {
    respond(profile); await expect(fetchPaperBotanicaProfile('calypso-bulbosa')).resolves.toMatchObject({species_id:'calypso-bulbosa'});
  });
});

describe('declared GLB buffer boundary', () => {
  it.each([51, 50, 49, 51.5, undefined, '52'])('rejects geometry outside declared buffer %s', (length) => {
    const b = glb(d => { (d as TestGlb & {buffers: Array<{byteLength: unknown}>}).buffers[0].byteLength = length; });
    expect(() => parsePaperBotanicaGlb(b)).toThrow();
  });
});

function paddedIndexGlb(declaredLength: number) {
  const doc = {asset:{version:'2.0'}, buffers:[{byteLength:declaredLength}],
    meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}, {bufferView:1,componentType:5123,count:3,type:'SCALAR'}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36}, {buffer:0,byteOffset:36,byteLength:6}]};
  const json=new TextEncoder().encode(JSON.stringify(doc));
  const padded=new Uint8Array(Math.ceil(json.length/4)*4);padded.fill(32);padded.set(json);
  const buffer=new ArrayBuffer(28+padded.length+44);const view=new DataView(buffer);
  [0x46546c67,2,buffer.byteLength,padded.length,0x4e4f534a].forEach((v,i)=>view.setUint32(i*4,v,true));
  new Uint8Array(buffer,20,padded.length).set(padded);
  const h=20+padded.length;view.setUint32(h,44,true);view.setUint32(h+4,0x004e4942,true);
  [0,0,0,.01,0,0,0,.01,0].forEach((v,i)=>view.setFloat32(h+8+i*4,v,true));
  [0,1,2].forEach((v,i)=>view.setUint16(h+44+i*2,v,true));
  return buffer;
}
it('accepts legal BIN padding when accessors end at the declared byte boundary',()=> {
  expect(parsePaperBotanicaGlb(paddedIndexGlb(42)).primitives[0].indices).toEqual(new Uint32Array([0,1,2]));
});
it('rejects the reviewer 41-byte declared buffer with 44-byte padded BIN fixture',()=> {
  expect(()=>parsePaperBotanicaGlb(paddedIndexGlb(41))).toThrow('bounds');
});
it('rejects duplicate evidence identities', async()=> {
  respond({...profile,evidence:[...profile.evidence,...profile.evidence]});
  await expect(fetchPaperBotanicaProfile('calypso-bulbosa')).rejects.toThrow('duplicate');
});
