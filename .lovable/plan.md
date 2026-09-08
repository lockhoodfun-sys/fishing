# Optimasi Performa Go Fishing

Hasil investigasi kode + data profiling kamu. Tidak ada fitur yang dihapus, tidak ada perubahan gameplay, tidak ada redesign.

## Temuan utama (diurutkan berdasarkan dampak)

### 1. Lampu efek muncul/hilang saat memancing → seluruh materi scene dikompilasi ulang
Ini penyebab paling kuat dari `getProgramInfoLog` yang besar dan lonjakan CPU tepat saat memancing.

Efek memancing disimpan dalam grup yang di-`visible=false` lalu dinyalakan per fase, dan di dalam grup itu ada lampu titik:
- `Angler.tsx:1305/1311/1317` — grup `burst`, `underGlow`, `ascendGlow` di-hide/show per fase.
- Lampu di dalamnya: `MonsterBurst.tsx:93`, `UnderwaterFishGlow.tsx:255` dan `:493`.
- `UnderwaterFishGlow.tsx:398` dan `:643` juga menyalakan/mematikan `light.visible` mengikuti setting grafis, dijalankan tiap frame.

Di Three.js, jumlah lampu yang aktif ikut menentukan program shader. Begitu satu lampu masuk/keluar scene, **semua** material (laut, awan, karakter, perahu, dunia) harus dikompilasi ulang. Setiap siklus memancing (lempar → tarikan → tangkap) memicu ini beberapa kali → stutter besar + CPU melonjak, dan tetap terjadi di setting Medium karena bukan soal beban gambar.

### 2. Hujan menghitung 5.000 tetes di CPU tiap frame
`Weather.tsx:139-197`: 5.000 tetes selalu dihitung penuh (30.000 angka ditulis ulang + dikirim ke kartu grafis setiap frame), jumlahnya sama untuk Low/Medium/High. Saat cuaca hujan/badai ini beban CPU per-frame terbesar di scene.

### 3. Sampah memori per frame (memicu garbage collection berulang)
- `Weather.tsx:100, 239, 240` — objek warna baru dibuat tiap frame (3×).
- `Boat.tsx:224-229` — objek posisi/kecepatan baru untuk tiap partikel percikan saat perahu jalan.
- `Boat.tsx:267, 296` — dua array partikel disalin ulang (`filter`) setiap frame.
- `Boat.tsx:239-303` — 150 + 90 matriks instance selalu ditulis ulang walau tidak ada perubahan.

### 4. Pemeriksaan tabrakan di dek perahu tanpa akselerasi
`useBoat.ts:104-127` menembak sinar ke seluruh mesh badan kapal, 5-6 kali per frame saat pemain berjalan di dek, tanpa BVH dan tanpa cache — padahal sistem darat (`worldPhysics.ts`) sudah pakai BVH + cache.

### 5. Monster tetap dihitung walau tidak terlihat
`MonsterFish.tsx:100-117` menghitung patroli + cek daratan (raycast) tiap frame terus-menerus.

### 6. Seluruh layar game dirender ulang React tiap ~1,5 detik
`GameCanvas.tsx:70-73` berlangganan jam siang-malam; jam berubah tiap ~1,5 detik sehingga seluruh pohon komponen (Canvas + semua panel HUD) direkonsiliasi ulang, plus objek warna baru tiap render.

### 7. Model yang diganti tidak dibersihkan (penyebab RAM naik dan tidak turun)
Salinan model kapal/ikan (`Boat.tsx:41-97`, `Fish.tsx:38-65`, `MonsterFish.tsx:25-46`) dan tekstur canvas (`Boat.tsx:180`, `UnderwaterFishGlow.tsx:177-178, 423-424`) tidak pernah dilepas saat diganti/di-unmount, jadi memori grafis menumpuk sepanjang sesi.

## Rencana perbaikan

**A. Hentikan kompilasi ulang shader (prioritas 1)**
- Pindahkan ketiga lampu efek keluar dari grup yang di-hide, jadikan selalu ada di scene dengan jumlah tetap; nyalakan/matikan lewat `intensity` (0 = mati) alih-alih `visible`/unmount.
- Hilangkan penulisan `light.visible` per frame; cukup skala intensitas mengikuti setting grafis.
- Tambahkan pra-kompilasi material sekali di awal (saat loading) supaya efek pertama kali muncul tanpa hentakan.
- Visual identik: lampu dengan intensitas 0 tidak menghasilkan cahaya.

**B. Ringankan hujan**
- Jumlah tetes maksimum mengikuti setting grafis (High tetap seperti sekarang; Medium/Low lebih sedikit) dan pembaruan buffer dibatasi hanya pada tetes yang aktif.
- Lewati seluruh perhitungan saat curah hujan nol.
- Hentikan penandaan buffer percikan (`RainImpacts.tsx:154-156`) saat tidak ada percikan baru.

**C. Hilangkan alokasi per frame**
- Warna, vektor, dan partikel memakai objek yang dipakai ulang (scratch), bukan objek baru tiap frame.
- Daftar partikel perahu dikelola in-place (tanpa `filter`), dan buffer instance hanya ditandai berubah saat memang berubah.

**D. Tabrakan & AI**
- Dek perahu memakai raycast ber-BVH + cache kecil seperti sistem darat, dan jumlah probe dikurangi saat pemain diam.
- Monster berhenti dihitung saat jauh/tidak terlihat.

**E. Kurangi render ulang React**
- Warna latar siang-malam dipindah ke komponen kecil tersendiri supaya `GameCanvas` (dan semua panel) tidak ikut dirender ulang tiap ~1,5 detik.

**F. Kebersihan memori**
- Melepas (`dispose`) geometri/material/tekstur salinan saat model kapal/ikan diganti atau komponen dilepas.

## Verifikasi sebelum selesai
- Build dan pengecekan TypeScript bersih.
- Uji jalan langsung di browser: memancing sampai dapat ikan (biasa dan monster), cuaca hujan/badai, naik perahu, audio, HUD/inventory/quest — semua tetap berfungsi, tanpa error console baru.
- Bandingkan beban sebelum/sesudah di kondisi yang sama (idle, hujan, saat memancing).

## Catatan teknis
Perubahan bersifat lokal pada komponen render (Angler, UnderwaterFishGlow, MonsterBurst, Weather, RainImpacts, Boat, useBoat, MonsterFish, GameCanvas). Tidak ada perubahan pada logika fishing/rarity, ekonomi, quest, database, wallet, maupun struktur data.
