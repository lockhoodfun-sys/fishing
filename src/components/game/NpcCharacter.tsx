import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FaceKind, NpcOutfit } from "./npcData";

/** Roblox-like faces drawn on a transparent canvas texture. */
function makeFace(kind: FaceKind) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#1b1b1b";
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineCap = "round";

  const eye = (cx: number, cy: number) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 16, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const shine = (cx: number, cy: number) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1b1b";
  };

  if (kind === "smile") {
    eye(88, 100);
    eye(168, 100);
    shine(83, 92);
    shine(163, 92);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(128, 140, 46, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
  } else if (kind === "squint") {
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(68, 104);
    ctx.lineTo(110, 96);
    ctx.moveTo(146, 96);
    ctx.lineTo(188, 104);
    ctx.stroke();
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(128, 136, 40, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
    // freckles
    ctx.beginPath();
    ctx.arc(78, 140, 4, 0, Math.PI * 2);
    ctx.arc(178, 140, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "stern") {
    eye(88, 106);
    eye(168, 106);
    // heavy brows
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(62, 70);
    ctx.lineTo(112, 84);
    ctx.moveTo(144, 84);
    ctx.lineTo(194, 70);
    ctx.stroke();
    // flat mouth
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(92, 168);
    ctx.lineTo(164, 168);
    ctx.stroke();
  } else {
    // wink
    eye(88, 100);
    shine(83, 92);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(168, 104, 22, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(120, 138, 44, 0.1 * Math.PI, 0.7 * Math.PI);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

type Pos = [number, number, number];

/**
 * The NPC body used to be ~14 separate <mesh> nodes. The parts never move
 * relative to each other, so we merge them **per colour**: one mesh per
 * distinct colour instead of one per part. Colours stay exactly as authored
 * (no vertex-colour space conversion), and draw calls drop from ~14 to ~5.
 */
function buildBody(outfit: NpcOutfit) {
  const { skin, shirt, pants, accent, hat, hatColor, extra } = outfit;
  const byColor = new Map<string, THREE.BufferGeometry[]>();

  const add = (geo: THREE.BufferGeometry, color: string, [x, y, z]: Pos) => {
    geo.translate(x, y, z);
    geo.deleteAttribute("uv");
    const list = byColor.get(color);
    if (list) list.push(geo);
    else byColor.set(color, [geo]);
  };
  const box = (w: number, h: number, d: number, color: string, at: Pos) =>
    add(new THREE.BoxGeometry(w, h, d), color, at);
  const cyl = (rt: number, rb: number, h: number, seg: number, color: string, at: Pos) =>
    add(new THREE.CylinderGeometry(rt, rb, h, seg), color, at);
  const sphere = (r: number, color: string, at: Pos) =>
    add(new THREE.SphereGeometry(r, 10, 10), color, at);

  // legs
  box(0.22, 0.64, 0.24, pants, [-0.14, 0.32, 0]);
  box(0.22, 0.64, 0.24, pants, [0.14, 0.32, 0]);

  // torso
  box(0.52, 0.6, 0.28, shirt, [0, 0.98, 0]);

  // clothing variations
  if (extra === "apron") {
    box(0.42, 0.5, 0.04, accent, [0, 0.9, 0.155]);
    box(0.26, 0.14, 0.02, "#c9bfa6", [0, 0.78, 0.185]);
  } else if (extra === "vest") {
    box(0.12, 0.52, 0.04, accent, [-0.2, 1.02, 0.15]);
    box(0.12, 0.52, 0.04, accent, [0.2, 1.02, 0.15]);
  } else if (extra === "belt") {
    box(0.55, 0.1, 0.31, accent, [0, 0.72, 0]);
    box(0.1, 0.09, 0.03, "#d9c56a", [0, 0.72, 0.16]);
  } else if (extra === "jacket") {
    box(0.06, 0.62, 0.3, accent, [-0.28, 0.98, 0]);
    box(0.06, 0.62, 0.3, accent, [0.28, 0.98, 0]);
    box(0.3, 0.1, 0.04, accent, [0, 1.22, 0.15]);
  }

  // arms
  box(0.18, 0.6, 0.22, skin, [-0.36, 0.96, 0]);
  box(0.18, 0.6, 0.22, skin, [0.36, 0.96, 0]);

  // head
  box(0.42, 0.38, 0.38, skin, [0, 1.52, 0]);

  // hats
  if (hat === "straw") {
    cyl(0.42, 0.44, 0.05, 20, hatColor, [0, 1.74, 0]);
    cyl(0.23, 0.26, 0.2, 20, hatColor, [0, 1.83, 0]);
    cyl(0.265, 0.265, 0.05, 20, "#8c5a3c", [0, 1.77, 0]);
  } else if (hat === "beanie") {
    box(0.44, 0.2, 0.4, hatColor, [0, 1.76, 0]);
    box(0.46, 0.08, 0.42, "#f2ede4", [0, 1.68, 0]);
    sphere(0.07, "#f2ede4", [0, 1.9, 0]);
  } else if (hat === "wide") {
    box(0.66, 0.05, 0.62, hatColor, [0, 1.73, 0]);
    box(0.4, 0.2, 0.36, hatColor, [0, 1.83, 0]);
  } else if (hat === "captain") {
    cyl(0.28, 0.28, 0.16, 18, hatColor, [0, 1.74, 0]);
    cyl(0.3, 0.28, 0.04, 18, "#f5f5f5", [0, 1.83, 0]);
    box(0.38, 0.04, 0.2, "#0f1725", [0, 1.68, 0.2]);
    box(0.12, 0.1, 0.02, "#d9c56a", [0, 1.75, 0.28]);
  }

  const parts: { color: string; geometry: THREE.BufferGeometry }[] = [];
  for (const [color, geos] of byColor) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) for (const g of geos) g.dispose();
    parts.push({ color, geometry: merged });
  }
  return parts;
}

export function NpcCharacter({
  face,
  outfit,
}: {
  face: FaceKind;
  outfit: NpcOutfit;
}) {
  const faceTex = useMemo(() => makeFace(face), [face]);
  const parts = useMemo(() => buildBody(outfit), [outfit]);

  return (
    <group>
      {parts.map((p) => (
        <mesh key={p.color} geometry={p.geometry} castShadow>
          <meshStandardMaterial color={p.color} roughness={0.85} />
        </mesh>
      ))}

      <mesh position={[0, 1.53, 0.191]}>
        <planeGeometry args={[0.4, 0.36]} />
        <meshBasicMaterial map={faceTex} transparent />
      </mesh>
    </group>
  );
}

