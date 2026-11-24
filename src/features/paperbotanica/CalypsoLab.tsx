import { useEffect, useState } from "react";
import { FlowerCanvas } from "./PaperBotanicaModel";
import { GlbModel, parsePaperBotanicaGlb } from "./glb";
import record from "./calypso/morphology.json";
import comparison from "./calypso/comparison.json";
import identity from "./calypso/identity.json";
import freeze from "./calypso/freeze.json";
import glbUrl from "./calypso/flower.glb?url";
import plate from "./calypso/plate.svg?url";

const organs = import.meta.glob<string>("./calypso/*.svg", {eager:true, query:"?url", import:"default"});
const reference = "https://runeberg.org/nordflor/";

export default function CalypsoLab() {
  const [id, select] = useState<keyof typeof identity.organs>("DS");
  const [scale, resize] = useState(1);
  const [width, setWidth] = useState(1);
  const [angle, setAngle] = useState(0);
  const [revealed, reveal] = useState(false);
  const [model, setModel] = useState<GlbModel>();
  const [error, setError] = useState("");
  const organ = record.parameters.organs.find(o => o.id === id)!;
  const character = record.characters.find(c => c.id === organ.character)!;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const response = await fetch(glbUrl, {signal:controller.signal});
      if (!response.ok) throw Error("Model unavailable");
      const bytes = await response.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2,"0")).join("");
      if (hash !== freeze.sha256["flower.glb"]) throw Error("Model differs from frozen reconstruction");
      if (!controller.signal.aborted) setModel(parsePaperBotanicaGlb(bytes));
    })().catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, []);
  return <main className="paperbotanica-page calypso-lab">
    <header><p>Botanical Reconstruction Laboratory · Review only</p><h1><i>Calypso bulbosa</i></h1>
      <p>{record.version} · Fully open flower · {record.review}</p></header>
    <section><h2>From description to character</h2>{record.characters.map(c => <p key={c.id}><strong>{c.id}</strong> · {c.statement} ({c.sources.join(", ")})</p>)}
      <details><summary>Sources and rights</summary>{record.sources.map(s => <p key={s.id}><a href={s.url}>{s.id} · {s.title}</a> · {s.creator} · {s.license}</p>)}</details></section>
    <p>Registry identity · <a href={identity.registry_source}>{identity.accepted_name} (registry source)</a>.
      Variety and voucher unresolved. Organs attach at the modeled floral center.</p>
    <section><h2>Inspect an organ</h2><label htmlFor="calypso-organ">Organ</label> <select id="calypso-organ" value={id} onChange={e=>{select(e.target.value as keyof typeof identity.organs);resize(1);setWidth(1);setAngle(0);}}>{record.parameters.organs.map(o=><option key={o.id} value={o.id}>{identity.organs[o.id as keyof typeof identity.organs].label} ({o.id})</option>)}</select>
      <p>{character.statement} {organ.shape} mesh · {organ.length_mm} × {organ.width_mm} mm · orientation {organ.angle_deg}°.</p>
      {character.reported_mm && <p>Reported range · length {character.reported_mm.length.join("–")} mm, width {character.reported_mm.width.join("–")} mm.</p>}
      <p>{record.parameters.status} · {record.parameters.basis}</p>
      <label>Educational length experiment · {(scale*organ.length_mm).toFixed(1)} mm <input type="range" min=".75" max="1.25" step=".01" value={scale} onChange={e=>resize(Number(e.target.value))}/></label>
      <label>Width experiment · {(organ.width_mm * width).toFixed(1)} mm <input type="range" min=".75" max="1.25" step=".01" value={width} onChange={e=>setWidth(Number(e.target.value))}/></label>
      <label>Orientation experiment · {organ.angle_deg + angle}° <input type="range" min="-30" max="30" value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label>
      <p>Projected length / width · {(scale * organ.length_mm / (width * organ.width_mm)).toFixed(2)}.
      Attachment · {identity.organs[id].attachment.replaceAll("_"," ")}. These controls change the isolated projection only.</p>
      <button onClick={()=>{resize(1);setWidth(1);setAngle(0);}}>Restore nominal organ</button>
      <svg width="250" height="250" viewBox="-23 -23 46 46" aria-label={id+" length experiment"} role="img">
        <g transform={`rotate(${-organ.angle_deg-angle}) scale(${width} ${scale}) rotate(${organ.angle_deg})`}><image x="-23" y="-23" width="46" height="50" href={organs[`./calypso/${id}.svg`]} /></g></svg></section>
    <section><h2>Flower assembly and surface</h2><p>{record.limitations.join(" ")}</p><p>Unknown · {record.unknown.join(", ")}.</p>
      {model ? <FlowerCanvas model={model} speciesName={record.scientific_name}/> : <p role="status">{error || "Loading frozen mesh…"}</p>}</section>
    <section><h2>Compare the frozen plate</h2><button onClick={()=>reveal(!revealed)} aria-expanded={revealed}>{revealed?"Hide reference":"Reveal historical illustration"}</button>
      <div style={{display:"flex",flexWrap:"wrap",alignItems:"start"}}><img width="320" src={plate} alt="Annotated reconstruction, frontal projection"/>
      {revealed && <a href={reference+"416.html"}><img width="220" src={reference+"pics/416.jpg"} alt="Lindman plate 416, drawing after Swartz, Project Runeberg"/></a>}</div>
      {revealed && <><p>Retrospective comparison · Prior developers saw this plate. One illustrated plant, unknown scale. Lindman, Bilder ur Nordens Flora, plate 416, drawing after Swartz.</p>
      <p>Projected lip to dorsal reach · model {comparison.model_ratio.toFixed(2)}, figure 1 {comparison.reference_ratio.toFixed(2)}. {comparison.interpretation}</p>
      <p><a href="https://commons.wikimedia.org/wiki/File:Calypso_bulbosa_140620a.jpg">Original living-flower photograph</a> · Dirk Huizenga (Zenhaus), CC BY-SA 3.0.
      Author-identified var. americana. Excluded from the numerical comparison.</p>
      <ul>{comparison.diagnostic.map(x=><li key={x}>{x}</li>)}</ul><p>{comparison.unavailable}</p></>}</section>
  </main>;
}
