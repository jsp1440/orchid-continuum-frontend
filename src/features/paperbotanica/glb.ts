export interface GlbModel {
  vertices: Float32Array;
  primitives: Array<{ indices: Uint32Array; color: [number, number, number, number] }>;
}

function fail(message: string): never {
  throw new Error(`Unsupported PaperBotanica GLB: ${message}`);
}

export function parsePaperBotanicaGlb(buffer: ArrayBuffer): GlbModel {
  const view = new DataView(buffer);
  if (buffer.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    fail("expected a GLB 2.0 document");
  }
  if (view.getUint32(8, true) !== buffer.byteLength) fail("length mismatch");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) fail("missing JSON chunk");
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as {
    meshes?: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices: number; material?: number }> }>;
    accessors?: Array<{ bufferView: number; componentType: number; count: number; type: string; byteOffset?: number }>;
    bufferViews?: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
    materials?: Array<{ pbrMetallicRoughness?: { baseColorFactor?: [number, number, number, number] } }>;
  };
  const binaryHeader = 20 + jsonLength;
  if (binaryHeader + 8 > buffer.byteLength || view.getUint32(binaryHeader + 4, true) !== 0x004e4942) {
    fail("missing binary chunk");
  }
  const binaryStart = binaryHeader + 8;
  const accessors = document.accessors ?? [];
  const bufferViews = document.bufferViews ?? [];
  const primitives = document.meshes?.[0]?.primitives;
  if (!primitives?.length) fail("no mesh primitives");

  function accessorBytes(index: number): { bytes: Uint8Array; data: DataView; stride: number; count: number; componentType: number } {
    const accessor = accessors[index];
    const bufferView = bufferViews[accessor?.bufferView];
    if (!accessor || !bufferView) fail("invalid accessor");
    const offset = binaryStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return {
      bytes: new Uint8Array(buffer, offset, bufferView.byteLength),
      data: new DataView(buffer, offset),
      stride: bufferView.byteStride ?? 0,
      count: accessor.count,
      componentType: accessor.componentType,
    };
  }

  const positionAccessorIndex = primitives[0].attributes.POSITION;
  const positionAccessor = accessors[positionAccessorIndex];
  if (positionAccessor?.componentType !== 5126 || positionAccessor.type !== "VEC3") fail("positions must be float VEC3");
  const positions = accessorBytes(positionAccessorIndex);
  const positionStride = positions.stride || 12;
  const vertices = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) vertices[index * 3 + axis] = positions.data.getFloat32(index * positionStride + axis * 4, true);
  }

  return {
    vertices,
    primitives: primitives.map((primitive) => {
      const source = accessorBytes(primitive.indices);
      const size = source.componentType === 5125 ? 4 : source.componentType === 5123 ? 2 : source.componentType === 5121 ? 1 : 0;
      if (!size || source.count % 3 !== 0) fail("indices must be complete triangles");
      const stride = source.stride || size;
      const indices = new Uint32Array(source.count);
      for (let index = 0; index < source.count; index += 1) {
        const offset = index * stride;
        indices[index] = size === 4 ? source.data.getUint32(offset, true) : size === 2 ? source.data.getUint16(offset, true) : source.bytes[offset];
        if (indices[index] >= positions.count) fail("index outside position buffer");
      }
      const color = document.materials?.[primitive.material ?? -1]?.pbrMetallicRoughness?.baseColorFactor ?? [0.45, 0.65, 0.5, 1];
      return { indices, color };
    }),
  };
}
