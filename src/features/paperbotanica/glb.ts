export interface GlbModel {
  vertices: Float32Array;
  primitives: Array<{ indices: Uint32Array; color: [number, number, number, number] }>;
}

function fail(message: string): never {
  throw new Error(`Unsupported PaperBotanica GLB: ${message}`);
}

export function parsePaperBotanicaGlb(buffer: ArrayBuffer): GlbModel {
  if (buffer.byteLength > 16 * 1024 * 1024) fail("resource limit");
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    fail("expected a GLB 2.0 document");
  }
  if (view.getUint32(8, true) !== buffer.byteLength) fail("length mismatch");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) fail("missing JSON chunk");
  if (jsonLength % 4 || 20 + jsonLength + 8 > buffer.byteLength) fail("JSON chunk bounds");
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as {
    nodes?: Array<{ mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }>;
    buffers?: Array<{ byteLength: number; uri?: string }>;
    extensionsUsed?: string[];
    meshes?: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices: number; material?: number; mode?: number }> }>;
    accessors?: Array<{ bufferView: number; componentType: number; count: number; type: string; byteOffset?: number; sparse?: unknown; normalized?: boolean }>;
    bufferViews?: Array<{ byteOffset?: number; byteLength: number; byteStride?: number; buffer?: number }>;
    materials?: Array<{ pbrMetallicRoughness?: { baseColorFactor?: [number, number, number, number] } }>;
  };
  const binaryHeader = 20 + jsonLength;
  if (binaryHeader + 8 > buffer.byteLength || view.getUint32(binaryHeader + 4, true) !== 0x004e4942) {
    fail("missing binary chunk");
  }
  const binaryStart = binaryHeader + 8;
  const binaryLength = view.getUint32(binaryHeader, true);
  if (binaryLength % 4 || binaryStart + binaryLength !== buffer.byteLength) fail("binary chunk bounds");
  if (document.meshes?.length !== 1) fail("expected one mesh");
  if (document.extensionsUsed?.length || document.buffers?.length !== 1 || document.buffers[0].uri ||
      document.buffers[0].byteLength > binaryLength || document.buffers[0].byteLength < binaryLength - 3) fail("unsupported buffers or extensions");
  if (document.nodes && (document.nodes.length !== 1 || document.nodes[0].mesh !== 0 ||
      document.nodes[0].matrix || document.nodes[0].translation || document.nodes[0].rotation || document.nodes[0].scale || document.nodes[0].children)) fail("node transforms are not supported");
  const accessors = document.accessors ?? [];
  const bufferViews = document.bufferViews ?? [];
  const primitives = document.meshes?.[0]?.primitives;
  if (!primitives?.length || primitives.length > 24) fail("invalid primitive count");

  function accessorBytes(index: number, elementSize: number, type: string) {
    const accessor = accessors[index];
    const sourceView = bufferViews[accessor?.bufferView];
    if (!Number.isInteger(index) || !accessor || !sourceView || accessor.type !== type || accessor.sparse || accessor.normalized || (sourceView.buffer ?? 0) !== 0) fail("invalid or unsupported accessor");
    const offset = accessor.byteOffset ?? 0;
    const start = sourceView.byteOffset ?? 0;
    const stride = sourceView.byteStride ?? elementSize;
    if (![offset,start,sourceView.byteLength,stride,accessor.count].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        accessor.count < 1 || accessor.count > 200000 || stride < elementSize || stride > 252 ||
        offset + (accessor.count - 1) * stride + elementSize > sourceView.byteLength ||
        start + sourceView.byteLength > binaryLength) fail("accessor bounds or resource limit");
    const length = sourceView.byteLength - offset;
    return { bytes: new Uint8Array(buffer, binaryStart+start+offset, length),
      data: new DataView(buffer, binaryStart+start+offset, length), stride,
      count: accessor.count, componentType: accessor.componentType };
  }

  const positionAccessorIndex = primitives[0].attributes.POSITION;
  const positionAccessor = accessors[positionAccessorIndex];
  if (positionAccessor?.componentType !== 5126 || positionAccessor.type !== "VEC3") fail("positions must be float VEC3");
  const positions = accessorBytes(positionAccessorIndex, 12, "VEC3");
  if (positions.count > 20000) fail("vertex limit");
  const positionStride = positions.stride || 12;
  const vertices = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) vertices[index * 3 + axis] = positions.data.getFloat32(index * positionStride + axis * 4, true);
  }

  if (!vertices.every(Number.isFinite)) fail("nonfinite positions");
  return {
    vertices,
    primitives: primitives.map((primitive) => {
      if ((primitive.mode ?? 4) !== 4) fail("only triangles supported");
      if (primitive.attributes.POSITION !== positionAccessorIndex) fail("separate position buffers are not supported");
      const componentType = accessors[primitive.indices]?.componentType;
      const size = componentType === 5125 ? 4 : componentType === 5123 ? 2 : componentType === 5121 ? 1 : 0;
      if (!size) fail("invalid index component type");
      const source = accessorBytes(primitive.indices, size, "SCALAR");
      if (!size || source.count % 3 !== 0) fail("indices must be complete triangles");
      const stride = source.stride || size;
      const indices = new Uint32Array(source.count);
      for (let index = 0; index < source.count; index += 1) {
        const offset = index * stride;
        indices[index] = size === 4 ? source.data.getUint32(offset, true) : size === 2 ? source.data.getUint16(offset, true) : source.bytes[offset];
        if (indices[index] >= positions.count) fail("index outside position buffer");
      }
      const color = document.materials?.[primitive.material ?? -1]?.pbrMetallicRoughness?.baseColorFactor ?? [0.45, 0.65, 0.5, 1];
      if (color.length !== 4 || !color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) fail("invalid material");
      return { indices, color };
    }),
  };
}

