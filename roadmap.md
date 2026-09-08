# Roadmap

## Audit dan perbaikan lag
- [x] Audit seluruh loop per-frame dan alokasi sementara
- [x] Audit tabrakan/spatial index dan semua full-map scan
- [x] Audit NPC, ikan, cuaca, bayangan, lampu, material, serta DOM di atas scene
- [x] Perbaikan yang terbukti: senar pancing berhenti dihitung saat joran disimpan;
      bayangan ikan hanya di setelan High; peta bayangan 512/1024/2048 per setelan
- [ ] Rekam frame-time nyata pada perangkat pemain (browser uji di server tidak punya
      kartu grafis, hasilnya ~0.4 fps dan tidak sah dipakai sebagai patokan)
- [ ] Turunkan jumlah segitiga pada setelan Low (terukur ~790.000 per frame,
      jauh di atas anggaran 100.000) — butuh pengurangan/penyederhanaan objek dunia
