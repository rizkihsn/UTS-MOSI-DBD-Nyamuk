# UTS Pemodelan dan Simulasi: Sistem Dinamik DBD

Visualisasi interaktif dan pemodelan sistem dinamik penularan Demam Berdarah Dengue (DBD) antara manusia (SIR) dan nyamuk *Aedes aegypti* (SI) menggunakan data kasus bulanan Filipina 2016–2020.

## Struktur Proyek
- `index.html` — Halaman web interaktif (simulasi SIR-SI, grafik kurva, skenario intervensi)
- `assets/` — Renderer 3D WebGL2 nyamuk *Aedes aegypti*, aset botani makro, dan favicon
- `vercel.json` & `.vercelignore` — Konfigurasi deploy statis ke Vercel
- `colab/` — Notebook Google Colab (`UTS_DBD_SIR_SI.ipynb`), skrip kalibrasi (`model.py`), dan dataset (`ph_dengue_cases2016-2020.csv`)

## Menjalankan Model di Google Colab
1. Buka [colab.research.google.com](https://colab.research.google.com), pilih **File > Upload notebook**, lalu pilih `colab/UTS_DBD_SIR_SI.ipynb`.
2. Jalankan sel dari atas ke bawah, dan unggah `colab/ph_dengue_cases2016-2020.csv` saat diminta.

## Deploy ke Vercel
1. Hubungkan repositori GitHub ini di [vercel.com](https://vercel.com) (**Add New > Project > Import**).
2. Pilih **Framework Preset: Other**, kosongkan **Build Command** dan **Output Directory**, lalu klik **Deploy**.

> **Catatan:** Nilai populasi (`N`) pada `colab/model.py` dan `index.html` adalah perkiraan 108 juta jiwa; sesuaikan dengan data resmi PSA bila diperlukan dan cantumkan pada laporan.
