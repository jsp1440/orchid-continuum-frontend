import { useCallback, useEffect, useRef, useState } from "react";
import { requireArtifact, paperBotanicaRequest } from "./api";
import { GlbModel, parsePaperBotanicaGlb } from "./glb";

interface ProjectedTriangle {
  points: Array<[number, number]>;
  depth: number;
  color: [number, number, number, number];
}

export function PaperBotanicaModel({ url, speciesName }: { url: string; speciesName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [model, setModel] = useState<GlbModel | null>(null);
  const [error, setError] = useState("");
  const [yaw, setYaw] = useState(0.65);
  const [pitch, setPitch] = useState(-0.18);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setModel(null);
    setError("");
    void paperBotanicaRequest(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Reconstruction request failed (${response.status}).`);
        requireArtifact(response, "model/gltf-binary");
        return response.arrayBuffer();
      })
      .then((buffer) => { if (!controller.signal.aborted) setModel(parsePaperBotanicaGlb(buffer)); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Reconstruction could not be loaded.");
      });
    return () => controller.abort();
  }, [url]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const center = [0, 0, 0];
    for (let index = 0; index < model.vertices.length; index += 1) center[index % 3] += model.vertices[index] / (model.vertices.length / 3);
    let extent = 1e-6;
    for (let index = 0; index < model.vertices.length; index += 3) {
      extent = Math.max(extent, ...[0, 1, 2].map((axis) => Math.abs(model.vertices[index + axis] - center[axis])));
    }
    const scale = (Math.min(width, height) * 0.39 * zoom) / extent;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const projected = model.vertices.length / 3;
    const screen = new Float32Array(projected * 3);
    for (let index = 0; index < projected; index += 1) {
      const x = model.vertices[index * 3] - center[0];
      const y = model.vertices[index * 3 + 1] - center[1];
      const z = model.vertices[index * 3 + 2] - center[2];
      const rotatedX = x * cosYaw + z * sinYaw;
      const depthYaw = -x * sinYaw + z * cosYaw;
      screen[index * 3] = width / 2 + rotatedX * scale;
      screen[index * 3 + 1] = height / 2 - (y * cosPitch - depthYaw * sinPitch) * scale;
      screen[index * 3 + 2] = y * sinPitch + depthYaw * cosPitch;
    }
    const triangles: ProjectedTriangle[] = [];
    for (const primitive of model.primitives) {
      for (let index = 0; index < primitive.indices.length; index += 3) {
        const ids = [primitive.indices[index], primitive.indices[index + 1], primitive.indices[index + 2]];
        triangles.push({
          points: ids.map((id) => [screen[id * 3], screen[id * 3 + 1]]),
          depth: ids.reduce((sum, id) => sum + screen[id * 3 + 2], 0) / 3,
          color: primitive.color,
        });
      }
    }
    triangles.sort((a, b) => a.depth - b.depth);
    for (const triangle of triangles) {
      const lightness = 0.78 + Math.max(-0.15, Math.min(0.15, triangle.depth / extent / 8));
      context.fillStyle = `rgb(${triangle.color.slice(0, 3).map((channel) => Math.round(255 * Math.min(1, channel * lightness))).join(",")})`;
      context.beginPath();
      context.moveTo(...triangle.points[0]);
      context.lineTo(...triangle.points[1]);
      context.lineTo(...triangle.points[2]);
      context.closePath();
      context.fill();
    }
  }, [model, pitch, yaw, zoom]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  if (error) return <div className="paperbotanica-viewer-message" role="alert">{error}</div>;
  if (!model) return <div className="paperbotanica-viewer-message">Loading original parametric reconstruction…</div>;

  return (
    <div className="paperbotanica-model">
      <canvas
        ref={canvasRef}
        className="paperbotanica-canvas"
        role="img"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","-","="].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "ArrowLeft") setYaw((v) => v - .15);
          if (event.key === "ArrowRight") setYaw((v) => v + .15);
          if (event.key === "ArrowUp") setPitch((v) => Math.min(1.2, v + .15));
          if (event.key === "ArrowDown") setPitch((v) => Math.max(-1.2, v - .15));
          if (["+","="].includes(event.key)) setZoom((v) => Math.min(2.2, v + .1));
          if (event.key === "-") setZoom((v) => Math.max(.55, v - .1));
        }}
        aria-label={`Interactive draft 3D reconstruction of ${speciesName}; drag or arrow keys to rotate, plus/minus to zoom`}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const dx = event.clientX - dragRef.current.x;
          const dy = event.clientY - dragRef.current.y;
          dragRef.current = { x: event.clientX, y: event.clientY };
          setYaw((value) => value + dx * 0.012);
          setPitch((value) => Math.max(-1.2, Math.min(1.2, value + dy * 0.012)));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onWheel={(event) => setZoom((value) => Math.max(0.55, Math.min(2.2, value - event.deltaY * 0.001)))}
      />
      <div className="paperbotanica-viewer-toolbar">
        <span>Drag or arrow keys to rotate · scroll or +/- to zoom</span>
        <button type="button" onClick={() => { setYaw(0.65); setPitch(-0.18); setZoom(1); }}>Reset view</button>
      </div>
    </div>
  );
}

