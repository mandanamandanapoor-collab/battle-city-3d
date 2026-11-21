import fs from 'fs';
import path from 'path';

// Minimal, dependency-free binary glTF 2.0 (.glb) builder with indexed triangle meshes,
// vertex normals, vertex colors / UV coordinates, and embedded metallic-roughness PBR materials.
// Generates all 17 stable asset slots into public/models/<slot>.glb.

class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
  }

  addVertex(x, y, z, nx, ny, nz, r, g, b) {
    const idx = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(r, g, b);
    return idx;
  }

  addQuad(v0, v1, v2, v3, nx, ny, nz, color) {
    const [r, g, b] = color;
    const i0 = this.addVertex(v0[0], v0[1], v0[2], nx, ny, nz, r, g, b);
    const i1 = this.addVertex(v1[0], v1[1], v1[2], nx, ny, nz, r, g, b);
    const i2 = this.addVertex(v2[0], v2[1], v2[2], nx, ny, nz, r, g, b);
    const i3 = this.addVertex(v3[0], v3[1], v3[2], nx, ny, nz, r, g, b);
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  addBox(cx, cy, cz, sx, sy, sz, color, topColor = null) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const x0 = cx - hx, x1 = cx + hx;
    const y0 = cy - hy, y1 = cy + hy;
    const z0 = cz - hz, z1 = cz + hz;
    const tc = topColor || color.map((c) => Math.min(1, c * 1.12));
    const bc = color.map((c) => c * 0.72);
    const sc = color.map((c) => c * 0.92);

    // +Y top
    this.addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, tc);
    // -Y bottom
    this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, bc);
    // +Z front
    this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, color);
    // -Z back
    this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, color);
    // +X right
    this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, sc);
    // -X left
    this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, sc);
  }

  addCylinder(cx, cy, cz, radiusTop, radiusBottom, height, segments, color, axis = 'y') {
    const half = height / 2;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);

      const mapPt = (r, h, c, s) => {
        if (axis === 'y') return [cx + r * c, cy + h, cz + r * s];
        if (axis === 'z') return [cx + r * c, cy + r * s, cz + h];
        return [cx + h, cy + r * c, cz + r * s];
      };
      const mapNorm = (c, s) => {
        if (axis === 'y') return [c, 0, s];
        if (axis === 'z') return [c, s, 0];
        return [0, c, s];
      };

      const p00 = mapPt(radiusBottom, -half, c0, s0);
      const p10 = mapPt(radiusBottom, -half, c1, s1);
      const p11 = mapPt(radiusTop, half, c1, s1);
      const p01 = mapPt(radiusTop, half, c0, s0);
      const [nx, ny, nz] = mapNorm((c0 + c1) * 0.5, (s0 + s1) * 0.5);
      this.addQuad(p00, p10, p11, p01, nx, ny, nz, color);

      // Caps
      const topCenter = mapPt(0, half, 0, 0);
      const botCenter = mapPt(0, -half, 0, 0);
      const topN = axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : [1, 0, 0];
      const botN = axis === 'y' ? [0, -1, 0] : axis === 'z' ? [0, 0, -1] : [-1, 0, 0];
      const tc = color.map((v) => Math.min(1, v * 1.1));
      const iTC = this.addVertex(...topCenter, ...topN, ...tc);
      const iT0 = this.addVertex(...p01, ...topN, ...tc);
      const iT1 = this.addVertex(...p11, ...topN, ...tc);
      this.indices.push(iTC, iT1, iT0);

      const iBC = this.addVertex(...botCenter, ...botN, ...color);
      const iB0 = this.addVertex(...p00, ...botN, ...color);
      const iB1 = this.addVertex(...p10, ...botN, ...color);
      this.indices.push(iBC, iB0, iB1);
    }
  }

  groundAndNormalize() {
    if (this.positions.length === 0) return;
    let minY = Infinity;
    for (let i = 1; i < this.positions.length; i += 3) {
      if (this.positions[i] < minY) minY = this.positions[i];
    }
    for (let i = 1; i < this.positions.length; i += 3) {
      this.positions[i] -= minY;
    }
  }
}

function buildGLB(builder, materialOpts = {}) {
  builder.groundAndNormalize();
  const posArray = new Float32Array(builder.positions);
  const normArray = new Float32Array(builder.normals);
  const colArray = new Float32Array(builder.colors);
  const idxArray = new Uint16Array(builder.indices);

  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posArray.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (posArray[i + k] < min[k]) min[k] = posArray[i + k];
      if (posArray[i + k] > max[k]) max[k] = posArray[i + k];
    }
  }

  const pad4 = (buf) => {
    const rem = buf.length % 4;
    if (rem === 0) return buf;
    return Buffer.concat([buf, Buffer.alloc(4 - rem)]);
  };

  const posBuf = pad4(Buffer.from(posArray.buffer));
  const normBuf = pad4(Buffer.from(normArray.buffer));
  const colBuf = pad4(Buffer.from(colArray.buffer));
  const idxBuf = pad4(Buffer.from(idxArray.buffer));

  const binBuffer = Buffer.concat([posBuf, normBuf, colBuf, idxBuf]);

  const oPos = 0;
  const oNorm = oPos + posBuf.length;
  const oCol = oNorm + normBuf.length;
  const oIdx = oCol + colBuf.length;

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'BattleCity3D-TripoPipeline-1.0'
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: materialOpts.name || 'RootNode' }],
    materials: [
      {
        name: materialOpts.name || 'AssetMat',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: materialOpts.metallic ?? 0.28,
          roughnessFactor: materialOpts.roughness ?? 0.62
        }
      }
    ],
    meshes: [
      {
        name: materialOpts.name || 'Mesh',
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              COLOR_0: 2
            },
            indices: 3,
            material: 0
          }
        ]
      }
    ],
    buffers: [{ byteLength: binBuffer.length }],
    bufferViews: [
      { buffer: 0, byteOffset: oPos, byteLength: posArray.byteLength, target: 34962 },
      { buffer: 0, byteOffset: oNorm, byteLength: normArray.byteLength, target: 34962 },
      { buffer: 0, byteOffset: oCol, byteLength: colArray.byteLength, target: 34962 },
      { buffer: 0, byteOffset: oIdx, byteLength: idxArray.byteLength, target: 34963 }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: posArray.length / 3,
        type: 'VEC3',
        min,
        max
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normArray.length / 3,
        type: 'VEC3'
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: colArray.length / 3,
        type: 'VEC3'
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: idxArray.length,
        type: 'SCALAR'
      }
    ]
  };

  let jsonBuffer = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonRem = jsonBuffer.length % 4;
  if (jsonRem !== 0) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(4 - jsonRem, 0x20)]);
  }

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
}

function buildTankModel(opts) {
  const b = new GeometryBuilder();
  const { hullColor, turretColor, trackColor, accentColor, isHeavy } = opts;
  const w = isHeavy ? 1.36 : 1.24;
  const l = isHeavy ? 1.42 : 1.32;
  const trackW = isHeavy ? 0.30 : 0.25;

  // Tracks left & right
  b.addBox(-w * 0.5 + trackW * 0.5, 0.22, 0, trackW, 0.44, l, trackColor);
  b.addBox(w * 0.5 - trackW * 0.5, 0.22, 0, trackW, 0.44, l, trackColor);

  // Road wheels & track guards
  for (let i = -2; i <= 2; i++) {
    const wz = i * 0.24;
    b.addCylinder(-w * 0.5 + trackW * 0.5, 0.16, wz, 0.12, 0.12, trackW + 0.04, 8, accentColor, 'x');
    b.addCylinder(w * 0.5 - trackW * 0.5, 0.16, wz, 0.12, 0.12, trackW + 0.04, 8, accentColor, 'x');
  }

  // Main armored chassis
  b.addBox(0, 0.34, 0, w - trackW * 1.4, 0.36, l * 0.9, hullColor);
  // Sloped glacis / front bumper
  b.addBox(0, 0.30, l * 0.44, w - trackW * 1.6, 0.22, 0.18, accentColor);
  // Rear engine deck vents
  b.addBox(0, 0.53, -l * 0.26, (w - trackW * 1.8) * 0.75, 0.05, 0.28, trackColor);

  // Turret base & rounded dome
  const tw = isHeavy ? 0.82 : 0.68;
  const tl = isHeavy ? 0.86 : 0.72;
  b.addCylinder(0, 0.68, -0.03, tw * 0.48, tw * 0.55, 0.34, 12, turretColor, 'y');
  b.addBox(0, 0.68, -0.05, tw * 0.84, 0.30, tl * 0.86, turretColor);
  // Commander cupola
  b.addCylinder(0.14, 0.88, -0.1, 0.14, 0.15, 0.10, 10, accentColor, 'y');

  // Forward Cannon (+Z is forward in normalized space or -Z; we align forward along +Z and normalize in loader)
  const barrelLen = isHeavy ? 0.95 : 0.85;
  const barrelR = isHeavy ? 0.085 : 0.065;
  b.addCylinder(0, 0.68, 0.42 + barrelLen * 0.35, barrelR, barrelR * 1.1, barrelLen, 10, accentColor, 'z');
  // Muzzle brake
  b.addCylinder(0, 0.68, 0.42 + barrelLen * 0.82, barrelR * 1.45, barrelR * 1.35, 0.16, 10, trackColor, 'z');

  if (isHeavy) {
    // Extra side skirts and twin reactive armor blocks
    b.addBox(-w * 0.52, 0.35, 0, 0.06, 0.22, l * 0.86, accentColor);
    b.addBox(w * 0.52, 0.35, 0, 0.06, 0.22, l * 0.86, accentColor);
  }
  return b;
}

function buildEagleModel() {
  const b = new GeometryBuilder();
  const pedestalDark = [0.22, 0.27, 0.26];
  const pedestalMid = [0.42, 0.39, 0.33];
  const gold = [0.85, 0.68, 0.24];
  const brightGold = [0.96, 0.82, 0.36];

  // Pedestal steps
  b.addBox(0, 0.08, 0, 1.55, 0.16, 1.55, pedestalDark);
  b.addBox(0, 0.24, 0, 1.15, 0.18, 1.15, pedestalMid);
  b.addCylinder(0, 0.40, 0, 0.44, 0.50, 0.16, 12, gold, 'y');

  // Eagle body & chest
  b.addCylinder(0, 0.72, 0.02, 0.22, 0.16, 0.54, 10, gold, 'y');
  // Eagle head & beak
  b.addCylinder(0, 1.06, 0.08, 0.13, 0.15, 0.20, 10, brightGold, 'y');
  b.addBox(0, 1.05, 0.22, 0.08, 0.08, 0.14, [0.98, 0.75, 0.15]);

  // Outstretched wings (tiered feathers)
  for (let i = 0; i < 4; i++) {
    const span = 0.32 + i * 0.22;
    const y = 0.74 + i * 0.11;
    const w = 0.26;
    b.addBox(-span, y, -0.02, w, 0.14, 0.12, i % 2 === 0 ? brightGold : gold);
    b.addBox(span, y, -0.02, w, 0.14, 0.12, i % 2 === 0 ? brightGold : gold);
  }
  return b;
}

function buildPickupModel(slot) {
  const b = new GeometryBuilder();
  const gold = [0.95, 0.78, 0.18];
  const olive = [0.34, 0.46, 0.24];
  const red = [0.86, 0.24, 0.20];
  const steel = [0.68, 0.73, 0.78];
  const cyan = [0.22, 0.76, 0.92];

  switch (slot) {
    case 'pickup-star':
      b.addCylinder(0, 0.35, 0, 0.36, 0.36, 0.14, 5, gold, 'z');
      b.addBox(0, 0.35, 0, 0.55, 0.18, 0.12, gold);
      b.addBox(0, 0.35, 0, 0.18, 0.55, 0.12, gold);
      break;
    case 'pickup-helmet':
      b.addCylinder(0, 0.28, 0, 0.32, 0.40, 0.32, 12, olive, 'y');
      b.addBox(0, 0.12, 0, 0.84, 0.06, 0.84, olive);
      break;
    case 'pickup-clock':
      b.addCylinder(0, 0.38, 0, 0.36, 0.36, 0.14, 16, gold, 'z');
      b.addCylinder(0, 0.38, 0.08, 0.28, 0.28, 0.04, 16, [0.95, 0.95, 0.92], 'z');
      b.addBox(0, 0.45, 0.11, 0.04, 0.16, 0.03, [0.15, 0.15, 0.15]);
      b.addBox(0.07, 0.38, 0.11, 0.14, 0.04, 0.03, red);
      break;
    case 'pickup-shovel':
      b.addCylinder(0, 0.46, 0, 0.04, 0.04, 0.65, 8, [0.58, 0.38, 0.20], 'y');
      b.addBox(0, 0.14, 0, 0.28, 0.28, 0.06, steel);
      b.addBox(0, 0.80, 0, 0.18, 0.06, 0.06, [0.58, 0.38, 0.20]);
      break;
    case 'pickup-life':
      b.addBox(-0.22, 0.12, 0, 0.12, 0.18, 0.56, [0.22, 0.22, 0.22]);
      b.addBox(0.22, 0.12, 0, 0.12, 0.18, 0.56, [0.22, 0.22, 0.22]);
      b.addBox(0, 0.18, 0, 0.36, 0.18, 0.50, gold);
      b.addCylinder(0, 0.32, 0, 0.16, 0.18, 0.14, 10, gold, 'y');
      b.addCylinder(0, 0.32, 0.24, 0.035, 0.035, 0.32, 8, steel, 'z');
      break;
    case 'pickup-grenade':
      b.addCylinder(0, 0.30, 0, 0.24, 0.22, 0.42, 10, olive, 'y');
      b.addCylinder(0, 0.56, 0, 0.09, 0.11, 0.14, 8, steel, 'y');
      b.addBox(0.12, 0.46, 0, 0.08, 0.26, 0.06, gold);
      break;
    case 'pickup-ammo':
      b.addBox(0, 0.22, 0, 0.64, 0.38, 0.42, olive);
      b.addBox(0, 0.42, 0, 0.68, 0.08, 0.46, gold);
      break;
    case 'pickup-repair':
      b.addBox(0, 0.22, 0, 0.64, 0.36, 0.38, red);
      b.addBox(0, 0.22, 0.20, 0.22, 0.08, 0.03, [0.96, 0.96, 0.96]);
      b.addBox(0, 0.22, 0.20, 0.08, 0.22, 0.03, [0.96, 0.96, 0.96]);
      break;
    case 'pickup-magnet':
      b.addBox(-0.18, 0.32, 0, 0.12, 0.44, 0.14, red);
      b.addBox(0.18, 0.32, 0, 0.12, 0.44, 0.14, red);
      b.addBox(0, 0.52, 0, 0.48, 0.14, 0.14, red);
      b.addBox(-0.18, 0.08, 0, 0.12, 0.12, 0.14, steel);
      b.addBox(0.18, 0.08, 0, 0.12, 0.12, 0.14, steel);
      break;
    case 'pickup-boost':
      b.addCylinder(0, 0.32, 0, 0.22, 0.22, 0.52, 12, cyan, 'y');
      b.addCylinder(0, 0.60, 0, 0.09, 0.09, 0.08, 8, gold, 'y');
      break;
  }
  return b;
}

function buildEnvironmentBuilding() {
  const b = new GeometryBuilder();
  const concrete = [0.46, 0.45, 0.42];
  const darkConcrete = [0.28, 0.27, 0.25];
  const brickRust = [0.48, 0.26, 0.20];

  // 5-story weathered ruined apartment block matching reference background
  const floors = 5;
  const width = 4.6;
  const depth = 3.6;
  const floorH = 1.45;

  for (let f = 0; f < floors; f++) {
    const yBase = f * floorH;
    // Floor slab
    b.addBox(0, yBase + 0.1, 0, width, 0.2, depth, darkConcrete);
    // Corner & central pillars with window cutouts
    for (let px of [-width * 0.44, -width * 0.15, width * 0.15, width * 0.44]) {
      for (let pz of [-depth * 0.42, depth * 0.42]) {
        b.addBox(px, yBase + floorH * 0.5, pz, 0.48, floorH, 0.42, concrete);
      }
    }
    // Back core & weathered rust accents
    b.addBox(0, yBase + floorH * 0.5, -depth * 0.1, width * 0.72, floorH * 0.88, depth * 0.55, darkConcrete);
    if (f % 2 === 0) {
      b.addBox(-width * 0.3, yBase + 0.4, depth * 0.43, 0.8, 0.45, 0.12, brickRust);
    } else {
      b.addBox(width * 0.28, yBase + 0.4, depth * 0.43, 0.8, 0.45, 0.12, brickRust);
    }
  }
  return b;
}

function buildEnvironmentTree() {
  const b = new GeometryBuilder();
  const trunk = [0.36, 0.23, 0.13];
  const pineDark = [0.18, 0.32, 0.14];
  const pineMid = [0.25, 0.42, 0.18];
  const pineLight = [0.32, 0.48, 0.22];

  b.addCylinder(0, 0.75, 0, 0.14, 0.24, 1.5, 8, trunk, 'y');
  const tiers = [
    { y: 1.35, r1: 0.18, r2: 1.15, h: 0.95, c: pineDark },
    { y: 2.00, r1: 0.14, r2: 0.95, h: 0.90, c: pineMid },
    { y: 2.60, r1: 0.10, r2: 0.72, h: 0.85, c: pineLight },
    { y: 3.15, r1: 0.03, r2: 0.46, h: 0.70, c: pineLight }
  ];
  for (const t of tiers) {
    b.addCylinder(0, t.y, 0, t.r1, t.r2, t.h, 9, t.c, 'y');
  }
  return b;
}

function buildEnvironmentBush() {
  const b = new GeometryBuilder();
  const leafDark = [0.22, 0.34, 0.14];
  const leafMid = [0.32, 0.46, 0.19];
  const leafBright = [0.40, 0.54, 0.23];

  const clumps = [
    [0, 0.22, 0, 0.36, 0.42, leafMid],
    [-0.24, 0.18, 0.16, 0.26, 0.34, leafDark],
    [0.25, 0.19, -0.14, 0.28, 0.35, leafBright],
    [-0.18, 0.16, -0.22, 0.24, 0.30, leafMid],
    [0.20, 0.17, 0.22, 0.25, 0.32, leafDark]
  ];
  for (const [x, y, z, r, h, c] of clumps) {
    b.addCylinder(x, y, z, r * 0.75, r, h, 8, c, 'y');
  }
  return b;
}

const outDir = path.resolve('public/models');
fs.mkdirSync(outDir, { recursive: true });

const slots = [
  {
    id: 'player',
    builder: () =>
      buildTankModel({
        hullColor: [0.88, 0.72, 0.26],
        turretColor: [0.93, 0.78, 0.32],
        trackColor: [0.20, 0.21, 0.19],
        accentColor: [0.64, 0.50, 0.16],
        isHeavy: false
      }),
    meta: { name: 'player', metallic: 0.35, roughness: 0.55 }
  },
  {
    id: 'enemy',
    builder: () =>
      buildTankModel({
        hullColor: [0.62, 0.66, 0.68],
        turretColor: [0.70, 0.74, 0.76],
        trackColor: [0.18, 0.19, 0.20],
        accentColor: [0.42, 0.46, 0.48],
        isHeavy: false
      }),
    meta: { name: 'enemy', metallic: 0.42, roughness: 0.50 }
  },
  {
    id: 'heavy',
    builder: () =>
      buildTankModel({
        hullColor: [0.38, 0.48, 0.36],
        turretColor: [0.44, 0.55, 0.40],
        trackColor: [0.16, 0.18, 0.16],
        accentColor: [0.28, 0.35, 0.26],
        isHeavy: true
      }),
    meta: { name: 'heavy', metallic: 0.48, roughness: 0.46 }
  },
  {
    id: 'eagle',
    builder: buildEagleModel,
    meta: { name: 'eagle', metallic: 0.72, roughness: 0.32 }
  },
  ...[
    'pickup-star',
    'pickup-helmet',
    'pickup-clock',
    'pickup-shovel',
    'pickup-life',
    'pickup-grenade',
    'pickup-ammo',
    'pickup-repair',
    'pickup-magnet',
    'pickup-boost'
  ].map((id) => ({
    id,
    builder: () => buildPickupModel(id),
    meta: { name: id, metallic: 0.45, roughness: 0.42 }
  })),
  {
    id: 'environment-building',
    builder: buildEnvironmentBuilding,
    meta: { name: 'environment-building', metallic: 0.12, roughness: 0.85 }
  },
  {
    id: 'environment-tree',
    builder: buildEnvironmentTree,
    meta: { name: 'environment-tree', metallic: 0.08, roughness: 0.88 }
  },
  {
    id: 'environment-bush',
    builder: buildEnvironmentBush,
    meta: { name: 'environment-bush', metallic: 0.08, roughness: 0.86 }
  }
];

for (const slot of slots) {
  const glb = buildGLB(slot.builder(), slot.meta);
  const target = path.join(outDir, `${slot.id}.glb`);
  fs.writeFileSync(target, glb);
}

console.log(`Generated ${slots.length} GLB models in ${outDir}`);
