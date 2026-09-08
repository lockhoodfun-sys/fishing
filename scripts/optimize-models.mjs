// scripts/optimize-models.mjs
//
// Optimasi semua .glb di public/models/ pakai gltf-transform.
// File asli otomatis di-backup ke public/models/_source/ SEBELUM diproses.
//
// Cara pakai (di PowerShell / CMD / terminal manapun):
//   npm install -D @gltf-transform/cli
//   node scripts/optimize-models.mjs
//
// Restore semua ke asli:
//   node scripts/optimize-models.mjs --restore

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MODELS_DIR = path.resolve("public/models");
const BACKUP_DIR = path.join(MODELS_DIR, "_source");

// --- ratio simplify per file --------------------------------------------
// 1.0  = tidak di-simplify sama sekali (cuma quantize + texture compress + draco)
// 0.4  = hero asset yang sering di-zoom dekat (boat, monster/boss)
// 0.15 = scenery/background (jarang di-zoom dekat)
// 0.05 = extreme case (raw AI-generated mesh jutaan vertex)
const RATIO = {
  "shark_3d_model-2389d6f4.glb": 0.05,

  "boat-sea-marshal.glb": 0.4,
  "boat-sea-marshal-v2.glb": 0.4,
  "boat-vex-yacht.glb": 0.4,
  "boat-vex-yacht-v2.glb": 0.4,
  "boat-minnow.glb": 0.4,
  "boat-bow-raider.glb": 0.4,
  "boat-reef-runner.glb": 0.4,
  "220__bow__raider_power_boat_ss.glb": 0.4,
  "motor_boat_iii_empty.glb": 0.4,
  "yacht_ii.glb": 0.4,
  "shark_attack_boat_3d_model-02427b48.glb": 0.4,
  "BOAT_SHOOP-9dab28cc.glb": 0.4,

  "mountain-99dd9cce.glb": 0.15,
  "beach_summer__assets_kit-834d2a6d.glb": 0.15,
  "kaleo_islands-192f4dfc.glb": 0.15,
  "fishermans_shack__detailed_draft-86f7cda4.glb": 0.2,
  "fantasy-x__x-lantern__echad-ce8f0224.glb": 0.2,
  "hanging_fish_display_3d_model-670c63ab.glb": 0.2,
  "free_low_poly_generic_treasure_chest-cd4b2d4f.glb": 0.3,
  "furnished_aquarium_apartment-b48e3ba3.glb": 0.2,
  "bait_shop-c737afcb.glb": 0.3,
  "FISHSHOP-f0530092.glb": 0.3,
  "teal_rod_shop_3d_model-dc32d611.glb": 0.3,
  "pine_tree-76cab767.glb": 0.2,
  "stylized_tree-5352a2ee.glb": 0.2,
  "notice_board-a9230bcf.glb": 0.5,
  "cartoon_boardwalk_large-87ae8933.glb": 0.5,
  "lantern_pole_with_a_paper_lantern-980f1887.glb": 0.3,
};

// File yang di-skip total (sudah draco + webp dari sananya, jangan disentuh)
const SKIP = new Set([
  "fish_common.glb",
  "fish_rare.glb",
  "fish_epic.glb",
  "fish_legendary_1.glb",
  "fish_legendary_2.glb",
  "fish_mythic_1.glb",
  "fish_mythic_2.glb",
  "fish_mythic_3.glb",
  "boat-starter.glb",
]);

function restore() {
  if (!existsSync(BACKUP_DIR)) {
    console.log("Belum ada backup, tidak ada yang perlu di-restore.");
    return;
  }
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.endsWith(".glb")) continue;
    copyFileSync(path.join(BACKUP_DIR, name), path.join(MODELS_DIR, name));
    console.log("restored:", name);
  }
  console.log("Semua file dikembalikan ke versi asli.");
}

function optimize() {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const files = readdirSync(MODELS_DIR).filter((f) => f.endsWith(".glb"));

  for (const name of files) {
    const filepath = path.join(MODELS_DIR, name);

    if (SKIP.has(name)) {
      console.log("skip (sudah optimal):", name);
      continue;
    }

    const backupPath = path.join(BACKUP_DIR, name);
    if (!existsSync(backupPath)) {
      copyFileSync(filepath, backupPath);
    }

    const ratio = RATIO[name] ?? 1.0;
    console.log(`\n== ${name} (ratio=${ratio}) ==`);

    const args =
      ratio === 1.0
        ? `--texture-compress webp --texture-size 1024 --simplify false --compress draco`
        : `--texture-compress webp --texture-size 1024 --simplify true --simplify-ratio ${ratio} --simplify-error 0.001 --compress draco`;

    const cmd = `npx gltf-transform optimize "${backupPath}" "${filepath}" ${args}`;
    execSync(cmd, { stdio: "inherit" });
  }

  console.log(`\nSelesai. Original ada di ${BACKUP_DIR}`);
  console.log("Cek dulu tiap model di browser sebelum push.");
  console.log("Kalau ada yang jelek, jalankan: node scripts/optimize-models.mjs --restore");
}

if (process.argv.includes("--restore")) {
  restore();
} else {
  optimize();
}
