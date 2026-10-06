# tandai-ss ✍️🔍

[![Demo Online](https://img.shields.io/badge/Demo-Live%20Online-0d9488?style=flat-square&logo=github&logoColor=white)](https://hanifalkauni.github.io/tandai-ss/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3b82f6.svg?style=flat-square)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](js/app.js)
[![HTML5 / CSS3](https://img.shields.io/badge/Stack-HTML5%20%7C%20CSS3-E34F26?style=flat-square&logo=html5&logoColor=white)](index.html)
[![Privacy 100% Client-Side](https://img.shields.io/badge/Privacy-100%25%20Client--Side-10b981?style=flat-square&logo=shield)](README.md)

> **Anotasi Screenshot & Bukti (Evidence Marker) Berbasis Web yang Cepat, Praktis, dan 100% Lokal.**

**tandai-ss** adalah aplikasi web statis ringan untuk memberi tanda, catatan, nomor langkah, dan sensor pada screenshot sebelum dibagikan ke tiket bug, laporan QA, audit, atau dokumentasi teknis.

Semua proses rendering dilakukan **100% di browser pengguna (client-side)** tanpa server backend. Tidak ada gambar atau data sensitif yang diunggah ke internet.

---

## ✨ Fitur Utama

- 📐 **Bentuk & Anotasi Lengkap**:
  - **Kotak (`R`)** & **Elips (`O`)**: Mendukung isi transparan, lembut (semi-transparan), atau penuh (solid).
  - **Panah (`A`)**: Lengkap dengan kepala panah otomatis dan snapping 45° via `Shift`.
  - **Highlighter (`H`)**: Sorotan transparan ala stabilo kuning dengan mode blend natural.
  - **Teks (`T`)**: Ketik langsung di kanvas, ganti baris (`Shift+Enter`), dan pilihan background box.
  - **Nomor Langkah (`N`)**: Badge nomor otomatis bertambah (1, 2, 3, dst.) untuk dokumentasi langkah/alur kerja.
- 🔒 **Sensor Data Sensitif (`B`)**:
  - **Pixelate**: Menyamarkan teks/angka dengan resolusi blok.
  - **Blur**: Gaussian blur asli dengan proteksi tepi aman.
  - **Hitam**: Sensor balok hitam solid (direkomendasikan untuk password, token, atau kartu identitas).
- ✂️ **Crop Kanvas (`C`)**: Potong bagian penting screenshot dengan cepat.
- 🗂️ **Multi-Gambar dalam Satu Sesi**:
  - Deretan thumbnail di bawah kanvas untuk mengelola banyak gambar sekaligus.
  - Setiap gambar memiliki layer anotasi dan riwayat undo/redo terpisah.
- 🏷️ **Stempel Bukti Formal (Evidence Watermark)**:
  - Cap otomatis di sudut gambar: No. Tiket/Referensi, Nama Pembuat, Waktu Presisi (dengan zona waktu), dan Nomor Urut Halaman (contoh: `2/5`).
  - Penamaan file otomatis mengikuti referensi tiket (misal: `BUG-104_20261006_171929.png`).
- 📦 **Ekspor Lengkap**:
  - **Simpan PNG**: Ekspor gambar aktif beresolusi penuh.
  - **Salin ke Clipboard (`Ctrl+C`)**: Langsung paste ke Slack, Discord, Jira, atau WhatsApp.
  - **Paket ZIP + Manifest SHA-256**: Mengunduh seluruh halaman sekaligus dengan file `manifest.txt` berisi hash SHA-256 integritas bukti.
- 🔎 **Zoom & Pan Fleksibel**:
  - Zoom dari 5% hingga 800% (`Ctrl` + scroll atau shortcut `+` / `-`).
  - Pan / geser kanvas dengan tahan `Space` + seret atau klik tengah mouse.
- 🌓 **Tema Terang & Gelap**:
  - Terintegrasi otomatis dengan preferensi sistem OS dan tersimpan di `localStorage`.

---

## ⌨️ Daftar Pintasan Keyboard (Shortcuts)

| Shortcut | Aksi |
|---|---|
| `V` | Alat Pilih / Geser / Resize |
| `R` | Kotak (Rectangle) |
| `O` | Elips / Lingkaran |
| `A` | Panah |
| `H` | Highlighter |
| `T` | Teks |
| `N` | Nomor Langkah (1, 2, 3...) |
| `B` | Sensor (Pixelate / Blur / Hitam) |
| `C` | Crop |
| `Ctrl + V` | Tempel gambar screenshot dari clipboard |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |
| `Ctrl + S` | Simpan gambar aktif sebagai PNG |
| `Ctrl + C` | Salin gambar beranotasi ke clipboard |
| `Ctrl + D` | Duplikat objek terpilih |
| `Delete` / `Backspace` | Hapus objek terpilih |
| `Shift` (tahan) | Kunci proporsi kotak/elips atau sudut panah 45° |
| `Space` (tahan + seret) | Geser (Pan) tampilan kanvas |
| `Ctrl + Scroll` | Zoom in / Zoom out |
| `+` / `-` | Perbesar / Perkecil |
| `0` | Pas ke layar (Fit) |
| `1` | Ukuran asli (100%) |

---

## 🚀 Cara Menjalankan

### 1. Lokal di Komputer
Cukup clone repo ini dan buka `index.html` di browser modern (Chrome, Edge, Firefox, Safari):

```bash
git clone https://github.com/hanifalkauni/tandai-ss.git
cd tandai-ss
# Buka file index.html di browser
```

### 2. Akses Online (Live Demo)
Aplikasi sudah aktif dan siap langsung digunakan tanpa instalasi apa pun:

👉 **[https://hanifalkauni.github.io/tandai-ss/](https://hanifalkauni.github.io/tandai-ss/)**

*(Catatan: Fitur salin ke clipboard dan SHA-256 berjalan optimal via HTTPS).*

---

## 📁 Struktur Direktori

```
tandai-ss/
├── index.html        # Shell aplikasi utama & antarmuka
├── .gitignore        # Filter file lokal/OS
├── README.md         # Dokumentasi project
├── css/
│   └── style.css     # Sistem token warna (Light/Dark mode) & tata letak
└── js/
    ├── model.js      # Definisi geometri shape, hit-testing, & history stack
    ├── render.js     # Engine renderer kanvas, sensor (blur/pixel/black), & stempel
    ├── export.js     # Generator ZIP (store-only), SHA-256 hash, & file naming
    └── app.js        # Controller interaksi pengguna, event listener, & UI bindings
```

---

## 📄 Lisensi

[MIT License](LICENSE) © 2026 Hanif Al-Kauni
