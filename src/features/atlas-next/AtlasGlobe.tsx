import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import type { Focus } from './scale';

/**
 * ATLAS-NEXT — the globe.
 *
 * Adapted from the Orchid Bloom Globe prototype's GlobeCanvas. What was worth
 * keeping is kept: the rotate-the-globe camera model, the eased focus targets
 * with shortest-path longitude wrap, the drag-suppresses-click rule, the star
 * field, the atmosphere. Four things were rebuilt:
 *
 *  1. TEXTURES. The prototype pulled its Earth and topology maps from
 *     unpkg.com at runtime. A scientific instrument cannot have a third-party
 *     CDN in its render path. Land is drawn instead from Natural Earth
 *     coastlines shipped as a package dependency (world-atlas, public domain),
 *     which also gives the country geometry the scale ladder needs later.
 *
 *  2. PICKING. The prototype raycast into three-globe's internal meshes and
 *     tagged them from a setTimeout, relying on undocumented internals and on
 *     points not being merged. Here each mark's screen position is projected
 *     directly and the nearest within a radius wins — deterministic, works with
 *     merged geometry, and lets the hit radius grow on touch without changing
 *     what is drawn.
 *
 *  3. TOUCH. The prototype zoomed on wheel only, which does not exist on an
 *     iPad. Two-finger pinch is handled, and the canvas takes touch-action:none
 *     so a drag rotates the globe instead of scrolling the page.
 *
 *  4. RESPECT FOR MOTION AND MEMORY. Auto-rotation stops under
 *     prefers-reduced-motion; device pixel ratio is capped so an iPad is not
 *     asked to fill a 3x buffer; geometry and materials are disposed.
 */

export interface GlobeMark {
  id: string;
  lat: number;
  lng: number;
  /** Drawn size. Aggregate tallies are larger than single records. */
  radius: number;
  color: string;
  /** Ring drawn around the mark to show a generalised area rather than a point. */
  haloDeg?: number;
}

interface Props {
  marks: GlobeMark[];
  focus: Focus | null;
  autoRotate: boolean;
  onSelect: (id: string | null) => void;
  onHover?: (id: string | null, clientX: number, clientY: number) => void;
  /** Reported whenever the camera settles, so the shell can show where it is. */
  onCameraChange?: (view: { lat: number; lng: number; distance: number }) => void;
}

const GLOBE_UNITS = 100; // three-globe's radius
const MIN_DISTANCE = 130;
const MAX_DISTANCE = 520;

type Land = { type: 'FeatureCollection'; features: unknown[] };

const AtlasGlobe: React.FC<Props> = ({
  marks,
  focus,
  autoRotate,
  onSelect,
  onHover,
  onCameraChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<ThreeGlobe | null>(null);
  const marksRef = useRef<GlobeMark[]>(marks);
  // The scene is built once, so its DOM listeners would otherwise close over
  // the FIRST render's callbacks — which resolve a click against an empty
  // dataset and silently do nothing. Every handler is reached through a ref
  // that each render refreshes.
  const cameraChangeRef = useRef(onCameraChange);
  const selectRef = useRef(onSelect);
  const hoverRef = useRef(onHover);
  const rebuildRef = useRef<null | (() => void)>(null);

  const state = useRef({
    autoRotate: true,
    reducedMotion: false,
    dragging: false,
    last: null as { x: number; y: number } | null,
    rotY: 0,
    rotX: 0,
    distance: 350,
    targetRotY: null as number | null,
    targetRotX: null as number | null,
    targetDistance: null as number | null,
    pressX: 0,
    pressY: 0,
    moved: false,
    pointers: new Map<number, { x: number; y: number }>(),
    pinchStart: 0,
    pinchDistance: 0,
    coarsePointer: false,
    lastReport: 0,
  });

  const landFeatures = useMemo(() => {
    const topo = countries110m as unknown as Topology;
    return (feature(topo, topo.objects.countries) as unknown as Land).features;
  }, []);

  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  useEffect(() => {
    cameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);
  useEffect(() => {
    state.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // Ease toward a focus target. Kept from the prototype, including the
  // shortest-path longitude wrap, which is the part that makes descent feel
  // like one continuous move rather than a cut.
  useEffect(() => {
    const s = state.current;
    if (!focus) {
      s.targetRotY = null;
      s.targetRotX = null;
      s.targetDistance = null;
      return;
    }
    // three-globe places a point at
    //   x = r·cos(lat)·sin(lng),  y = r·sin(lat),  z = r·cos(lat)·cos(lng)
    // and the camera sits on +Z. With the default XYZ euler order the Y
    // rotation is applied to the vector first, so bringing (lat,lng) to face
    // the camera needs rotY = -lng and rotX = +lat.
    //
    // The prototype used `Math.PI / 2 - lonRad` here, which lands the target a
    // quarter turn away — on the limb rather than under the camera. It was not
    // obvious against a photographic texture, but it is plainly wrong once a
    // record has to sit where the viewer is looking.
    s.targetRotY = -(focus.lng * Math.PI) / 180;
    s.targetRotX = (focus.lat * Math.PI) / 180;
    s.targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, focus.distance));
  }, [focus]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const s = state.current;
    s.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    s.coarsePointer = !!window.matchMedia?.('(pointer: coarse)').matches;

    let width = mount.clientWidth || 1;
    let height = mount.clientHeight || 1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070b);

    // Star field — atmosphere, and a fixed frame that makes rotation readable.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1600;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 900 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 3000);
    camera.position.z = s.distance;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // No WebGL. The shell renders its own fallback; leave the mount empty.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xdfe8ff, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(1, 0.6, 1);
    scene.add(key);

    const globe = new ThreeGlobe()
      .showAtmosphere(true)
      .atmosphereColor('#6ea8d8')
      .atmosphereAltitude(0.15)
      .polygonsData(landFeatures as object[])
      .polygonCapColor(() => '#16241c')
      .polygonSideColor(() => 'rgba(28,48,38,0.35)')
      .polygonStrokeColor(() => '#3d5a49')
      .polygonAltitude(() => 0.006);

    globe.globeMaterial(
      new THREE.MeshPhongMaterial({ color: 0x0a1420, emissive: 0x04080e, shininess: 3 }),
    );

    scene.add(globe);
    globeRef.current = globe;

    // -----------------------------------------------------------------------
    // Marks
    // -----------------------------------------------------------------------
    // Drawn as our own sprites rather than three-globe's points layer, so that
    // the same positions used for drawing are the positions used for picking.
    const markGroup = new THREE.Group();
    globe.add(markGroup);

    // Marks are INSTANCED. A mesh per mark meant one draw call per record, and
    // at a few thousand records that alone stalled the frame — a limit reached
    // long before the data runs out. Two instanced meshes now draw the whole
    // layer in two calls regardless of count.
    const markGeo = new THREE.CircleGeometry(1, 16);
    const haloGeo = new THREE.RingGeometry(0.86, 1, 32);
    const discMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    let discMesh: THREE.InstancedMesh | null = null;
    let haloMesh: THREE.InstancedMesh | null = null;

    const rendered: Array<{ id: string; local: THREE.Vector3 }> = [];

    // Scratch objects, reused per instance so a rebuild allocates nothing.
    const up = new THREE.Vector3(0, 0, 1);
    const normal = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();

    const buildMarks = () => {
      const g = globeRef.current;
      if (!g) return;
      const marks = marksRef.current;

      if (discMesh) {
        markGroup.remove(discMesh);
        discMesh.dispose();
        discMesh = null;
      }
      if (haloMesh) {
        markGroup.remove(haloMesh);
        haloMesh.dispose();
        haloMesh = null;
      }
      rendered.length = 0;
      if (marks.length === 0) {
        mount.dataset.markCount = '0';
        return;
      }

      const haloed = marks.filter((m) => (m.haloDeg ?? 0) > 0);
      discMesh = new THREE.InstancedMesh(markGeo, discMat, marks.length);
      discMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (haloed.length) {
        haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, haloed.length);
        haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }

      let h = 0;
      marks.forEach((m, i) => {
        const c = g.getCoords(m.lat, m.lng, 0.012);
        const local = new THREE.Vector3(c.x, c.y, c.z);
        normal.copy(local).normalize();
        quat.setFromUnitVectors(up, normal); // face outward from the surface

        scale.setScalar(m.radius);
        matrix.compose(local, quat, scale);
        discMesh!.setMatrixAt(i, matrix);
        discMesh!.setColorAt(i, colour.set(m.color));

        if ((m.haloDeg ?? 0) > 0 && haloMesh) {
          // The ring shows the area a generalised record lies somewhere within.
          // Drawn to the real cell size, so it shrinks as precision improves.
          const radiusUnits = ((m.haloDeg as number) / 180) * Math.PI * GLOBE_UNITS;
          scale.setScalar(Math.max(m.radius * 1.7, radiusUnits));
          matrix.compose(local, quat, scale);
          haloMesh.setMatrixAt(h, matrix);
          haloMesh.setColorAt(h, colour.set(m.color));
          h += 1;
        }

        rendered.push({ id: m.id, local });
      });

      discMesh.instanceMatrix.needsUpdate = true;
      if (discMesh.instanceColor) discMesh.instanceColor.needsUpdate = true;
      markGroup.add(discMesh);
      if (haloMesh) {
        haloMesh.instanceMatrix.needsUpdate = true;
        if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
        markGroup.add(haloMesh);
      }

      // Surfaced so a test can assert that what is drawn is what is pickable.
      mount.dataset.markCount = String(rendered.length);
    };
    buildMarks();
    rebuildRef.current = buildMarks;

    // -----------------------------------------------------------------------
    // Picking — project, don't raycast
    // -----------------------------------------------------------------------
    const projected = new THREE.Vector3();

    const pickAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      // Touch targets need to be forgiving; a fingertip is not a cursor.
      const hitPx = s.coarsePointer ? 26 : 14;

      let bestId: string | null = null;
      let bestDist = hitPx * hitPx;

      for (const r of rendered) {
        projected.copy(r.local).applyMatrix4(globe.matrixWorld);
        // Reject the far side of the globe: a mark facing away from the camera
        // is behind the Earth and must not be clickable through it.
        if (projected.clone().sub(camera.position).dot(projected.clone().normalize()) > 0) continue;
        projected.project(camera);
        const sx = ((projected.x + 1) / 2) * rect.width;
        const sy = ((1 - projected.y) / 2) * rect.height;
        const d = (sx - px) ** 2 + (sy - py) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestId = r.id;
        }
      }
      return bestId;
    };

    // -----------------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------------
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.style.cursor = 'grab';

    const pinchSpan = () => {
      const pts = Array.from(s.pointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      dom.setPointerCapture?.(e.pointerId);
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      s.pressX = e.clientX;
      s.pressY = e.clientY;
      s.moved = false;
      if (s.pointers.size === 2) {
        s.pinchStart = pinchSpan();
        s.pinchDistance = s.distance;
        s.dragging = false;
        return;
      }
      s.dragging = true;
      s.last = { x: e.clientX, y: e.clientY };
      dom.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (s.pointers.has(e.pointerId)) {
        s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (s.pointers.size === 2 && s.pinchStart > 0) {
        const span = pinchSpan();
        if (span > 0) {
          s.distance = Math.max(
            MIN_DISTANCE,
            Math.min(MAX_DISTANCE, (s.pinchDistance * s.pinchStart) / span),
          );
          s.targetDistance = null;
        }
        s.moved = true;
        return;
      }

      // Only movement WHILE the pointer is down counts as a drag. Tracking any
      // movement made a click unreliable: a pointer that merely travelled to the
      // target before pressing was treated as having dragged, and the selection
      // was swallowed.
      if (s.pointers.size > 0 && Math.abs(e.clientX - s.pressX) + Math.abs(e.clientY - s.pressY) > 5) {
        s.moved = true;
      }

      if (s.dragging && s.last) {
        const dx = e.clientX - s.last.x;
        const dy = e.clientY - s.last.y;
        // Drag sensitivity scales with zoom: at close range a small movement
        // should travel a small distance on the ground, not spin the planet.
        const k = 0.0045 * (s.distance / 300);
        s.rotY += dx * k;
        s.rotX = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, s.rotX + dy * k));
        s.last = { x: e.clientX, y: e.clientY };
        s.targetRotY = null;
        s.targetRotX = null;
        return;
      }

      if (hoverRef.current && !s.coarsePointer) {
        const id = pickAt(e.clientX, e.clientY);
        hoverRef.current(id, e.clientX, e.clientY);
        dom.style.cursor = id ? 'pointer' : 'grab';
      }
    };

    const endPointer = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      if (s.pointers.size < 2) s.pinchStart = 0;
      if (s.pointers.size === 0) {
        s.dragging = false;
        s.last = null;
        dom.style.cursor = 'grab';
      }
    };

    const onClick = (e: MouseEvent) => {
      if (s.moved) return; // a drag is not a selection
      selectRef.current(pickAt(e.clientX, e.clientY));
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, s.distance + e.deltaY * 0.35));
      s.targetDistance = null;
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', endPointer);
    dom.addEventListener('pointercancel', endPointer);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('click', onClick);

    // -----------------------------------------------------------------------
    // Frame loop
    // -----------------------------------------------------------------------
    let raf = 0;
    let lastFrame = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);

      // Easing is expressed per second, not per frame. Frame-rate-dependent
      // easing glides at whatever speed the hardware happens to run at — which
      // means a slower iPad takes visibly longer to arrive than a desktop, and
      // an offscreen capture may never arrive at all.
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;

      const focusing = s.targetRotY !== null || s.targetRotX !== null || s.targetDistance !== null;

      if (s.autoRotate && !s.reducedMotion && !s.dragging && !focusing) {
        s.rotY += 0.054 * dt; // ~one turn every two minutes
      }

      // 0.075 per frame at 60fps, restated as a fraction of the remaining
      // distance to close per second.
      const ease = 1 - Math.pow(1 - 0.075, dt * 60);
      if (s.targetRotY !== null) {
        let diff = s.targetRotY - s.rotY;
        diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI; // shortest way round
        s.rotY += diff * ease;
        if (Math.abs(diff) < 0.001) s.targetRotY = null;
      }
      if (s.targetRotX !== null) {
        const diff = s.targetRotX - s.rotX;
        s.rotX += diff * ease;
        if (Math.abs(diff) < 0.001) s.targetRotX = null;
      }
      if (s.targetDistance !== null) {
        const diff = s.targetDistance - s.distance;
        s.distance += diff * ease;
        if (Math.abs(diff) < 0.4) s.targetDistance = null;
      }

      globe.rotation.y = s.rotY;
      globe.rotation.x = s.rotX;
      camera.position.z = s.distance;

      renderer.render(scene, camera);

      if (cameraChangeRef.current && now - s.lastReport > 220) {
        s.lastReport = now;
        cameraChangeRef.current({
          lat: (s.rotX * 180) / Math.PI,
          lng: ((((-s.rotY * 180) / Math.PI) % 360) + 540) % 360 - 180,
          distance: s.distance,
        });
      }
    };
    animate();

    const resize = () => {
      if (!mountRef.current) return;
      width = mountRef.current.clientWidth || 1;
      height = mountRef.current.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', endPointer);
      dom.removeEventListener('pointercancel', endPointer);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('click', onClick);
      rebuildRef.current = null;
      globeRef.current = null;
      discMesh?.dispose();
      haloMesh?.dispose();
      markGeo.dispose();
      haloGeo.dispose();
      discMat.dispose();
      haloMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
      renderer.dispose();
    };
    // Scene is built once; everything dynamic flows through refs, so this
    // genuinely has no other dependency.
  }, [landFeatures]);

  // Rebuild the mark layer whenever the resolved marks change.
  useEffect(() => {
    rebuildRef.current?.();
  }, [marks]);

  return <div ref={mountRef} className="absolute inset-0" data-testid="atlas-globe" />;
};

export default AtlasGlobe;
