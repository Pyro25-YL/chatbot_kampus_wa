# 📖 MANUAL BOOK & PANDUAN PENGGUNAAN BOT ACADEMIC ASSISTANT
**Program Studi S1 Kecerdasan Artifisial - Universitas Negeri Surabaya**

---

## 📌 Daftar Isi
1. [Tentang Sistem](#1-tentang-sistem)
2. [Hierarki Hak Akses & Peran Pengguna (User Roles)](#2-hierarki-hak-akses--peran-pengguna)
3. [Panduan Inisialisasi & Setup Grup Kelas](#3-panduan-inisialisasi--setup-grup-kelas)
4. [Fitur Jadwal Kuliah & Jadwal Pengganti](#4-fitur-jadwal-kuliah--jadwal-pengganti)
5. [Fitur Manajemen Tugas & Deadline](#5-fitur-manajemen-tugas--deadline)
6. [Fitur Presensi RFID IoT & Rekapitulasi Excel](#6-fitur-presensi-rfid-iot--rekapitulasi-excel)
7. [Fitur Penanggung Jawab (PJ) Mata Kuliah](#7-fitur-penanggung-jawab-pj-mata-kuliah)
8. [Fitur Informasi Dosen & Notifikasi Mengajar](#8-fitur-informasi-dosen--notifikasi-mengajar)
9. [Fitur Monitoring untuk Orang Tua (Ortu)](#9-fitur-monitoring-untuk-orang-tua-ortu)
10. [Sistem AI NLP & Navigasi Menu Interaktif](#10-sistem-ai-nlp--navigasi-menu-interaktif)
11. [Tabel Ringkasan Perintah (Cheat Sheet)](#11-tabel-ringkasan-perintah-cheat-sheet)

---

## 1. Tentang Sistem

**Bot Academic Assistant S1 Kecerdasan Artifisial** adalah asisten cerdas WhatsApp yang terintegrasi langsung dengan database PostgreSQL (`absensi_KA`), perangkat pemindai Tap RFID IoT, serta kecerdasan buatan (NLP & Google Gemini AI).

Sistem ini bertindak sebagai asisten operasional akademik otomatis di dalam grup kelas, mencakup:
- Pengingat perkuliahan & tugas otomatis bertingkat.
- Rekapitulasi presensi perkuliahan dari Tap RFID dan ekspor berkas Excel (.xlsx) otomatis.
- Manajemen penanggung jawab mata kuliah (PJ), jadwal kelas pengganti, dan administrasi akademik mandiri.

---

## 2. Hierarki Hak Akses & Peran Pengguna

Sistem membedakan akses dan perintah berdasarkan nomor WhatsApp pengirim:

```
┌────────────────────────────────────────────────────────┐
│                      SUPER ADMIN                       │ (Tabel: admin)
├────────────────────────────────────────────────────────┤
│                     ADMIN ANGKATAN                     │ (Tabel: admin_angkatan)
├────────────────────────────────────────────────────────┤
│                         DOSEN                          │ (Tabel: dosen)
├────────────────────────────────────────────────────────┤
│              PENANGGUNG JAWAB (PJ) MATKUL              │ (Tabel: pj)
├────────────────────────────────────────────────────────┤
│                   MAHASISWA KELAS                      │ (Tabel: mahasiswa)
├────────────────────────────────────────────────────────┤
│                 ORANG TUA WALI (ORTU)                  │ (Tabel: ortu)
└────────────────────────────────────────────────────────┘
```

1. **Super Admin**:
   - Memiliki kontrol penuh atas seluruh grup, data dosen, admin angkatan, dan database.
2. **Admin Angkatan**:
   - Mengelola grup kelas dalam angkatannya (kuota default maksimal 3 grup aktif per angkatan).
   - Berhak menjalankan `set kelas` dan `unset kelas` khusus angkatannya.
3. **Dosen**:
   - Menerima reminder otomatis jadwal mengajar ke chat pribadi.
   - Dapat meminta rekap kehadiran di grup/DM dan bot otomatis mengirimkan file **Excel (.xlsx)** resmi rekapitulasi seluruh pertemuan.
4. **Penanggung Jawab (PJ) Mata Kuliah**:
   - Mahasiswa yang ditunjuk mengelola jadwal, jadwal sementara, dan tugas untuk mata kuliah terkait.
5. **Mahasiswa**:
   - Melihat jadwal, tugas, rekap absensi, dan data dosen pengampu.
6. **Orang Tua (Ortu)**:
   - Dapat mengirim pesan pribadi ke bot untuk memantau rekap absensi dan kehadiran kuliah anaknya secara transparan.

---

## 3. Panduan Inisialisasi & Setup Grup Kelas

### A. Menghubungkan Grup WhatsApp ke Kelas (`set kelas`)
Saat bot baru saja dimasukkan ke dalam grup kelas, bot belum mengetahui jadwal kelas mana yang harus ditampilkan.

**Langkah aktivasi:**
1. Masukkan akun Bot ke dalam grup WhatsApp kelas yang dituju.
2. Pastikan pengirim adalah **Super Admin**, **Dosen**, atau **Admin Angkatan**.
3. Di dalam grup, ketik perintah:
   ```
   set kelas <nama_kelas>
   ```
   **Contoh:**
   - `set kelas 2026A`
   - `set kelas 2026B`
   - `set kelas 2026C`
   - `set kelas 2025A`
4. Bot akan mengonfirmasi bahwa grup berhasil dihubungkan ke kelas tersebut. Semua jadwal, data mahasiswa, dan PJ langsung aktif di grup.

### B. Melepas / Mengganti Kelas Grup (`unset kelas`)
Jika memasuki semester baru atau ingin memindahkan bot ke grup lain:
```
unset kelas
```
_atau_
```
reset kelas
```
_Catatan: Perintah ini mengembalikan kuota slot grup pada Admin Angkatan terkait._

---

## 4. Fitur Jadwal Kuliah & Jadwal Pengganti

### A. Melihat Jadwal Kuliah
Bot memahami perintah teks langsung maupun bahasa percakapan sehari-hari:

| Perintah | Deskripsi | Contoh |
| :--- | :--- | :--- |
| `!jadwal` atau `jadwal` | Menampilkan jadwal kuliah sepekan penuh untuk kelas ini | `!jadwal` |
| `!jadwal [kelas]` | Menampilkan jadwal kelas spesifik | `!jadwal 2026A` |
| `!jadwalb` | Menampilkan jadwal kuliah esok hari | `!jadwalb` |
| `!ringkas [hari/pekan]` | Ringkasan jadwal format teks padat | `!ringkas pekan` |
| `!cari jadwal [kata]` | Mencari matkul, hari, atau jam spesifik | `!cari jadwal basis data` |
| `!listmatkul` | Daftar seluruh mata kuliah di kelas ini | `!listmatkul` |

> 💬 **Dukungan Bahasa Alami (AI):**
> Anda juga bisa bertanya langsung secara santai:
> - _"Besok ada kelas apa aja?"_
> - _"Jadwal kuliah hari rabu apa woi?"_
> - _"Spill jadwal hari ini dong"_

### B. Modul Jadwal Sementara (Kelas Pengganti / Make-Up Class)
Digunakan jika dosen mengganti jadwal atau mengadakan kelas pengganti:

| Perintah | Deskripsi | Hak Akses |
| :--- | :--- | :--- |
| `!jadwalsementara` | Melihat daftar jadwal pengganti aktif minggu ini | Semua Anggota |
| `tambah jadwal sementara` | Menambahkan jadwal kuliah pengganti | Admin / PJ / Dosen |
| `edit jadwal sementara` | Mengubah detail kelas pengganti | Admin / PJ / Dosen |
| `hapus jadwal sementara` | Membatalkan jadwal pengganti | Admin / PJ / Dosen |

---

## 5. Fitur Manajemen Tugas & Deadline

Bot dilengkapi sistem pengingat (reminder) otomatis berjenjang yang aktif memantau tugas: **H-3, H-2, H-1, 6 Jam, 3 Jam, 2 Jam, 1 Jam, dan 30 Menit** sebelum tenggat waktu.

### A. Melihat Daftar Tugas
- `!tugaslist` : Menampilkan seluruh tugas yang masih aktif.
- `!tugasminggu` : Tugas yang memiliki deadline dalam minggu ini.
- `!tugasbesok` : Tugas kritis yang harus dikumpulkan besok.
- `!tugaslewat` : Tugas yang sudah melewati tenggat waktu.
- `!arsiplist` : Riwayat tugas yang telah selesai/diarsipkan.

### B. Menambah Tugas Baru
Format perintah (Bisa menggunakan bahasa alami atau format baku):
```
Tambah tugas [Nama Matkul], Judul: [Nama Tugas], Deadline: [Hari/Tanggal Jam]
```
**Contoh:**
> `Tambah tugas Pemrograman Berorientasi Objek, Judul: Praktikum Modul 3, Deadline: Jumat 23:59`

### C. Mengelola Tugas (PJ & Admin)
- Menandai Selesai: `selesai tugas [Nomor]` atau `done tugas [Nomor]`
- Mengedit Tugas: `edit tugas [Nomor]`
- Menghapus Tugas: `hapus tugas [Nomor]`

---

## 6. Fitur Presensi RFID IoT & Rekapitulasi Excel

Setiap ruang kuliah terhubung dengan pemindai kartu RFID IoT yang langsung mencatat log kehadiran mahasiswa ke database.

### A. Cek Rekap Kehadiran di Grup
Ketik perintah berikut di grup:
```
!absensi
```
_atau:_
```
!absensi [Nama Matkul]
```
**Contoh:** `!absensi Aljabar Matriks`

Bot akan menampilkan:
1. Daftar mahasiswa yang **Hadir** (beserta jam tap kartu).
2. Daftar mahasiswa yang **Belum Hadir / Alpa**.
3. Persentase kehadiran kelas pada sesi tersebut.

### B. Fitur Otomatis untuk Dosen (Download File Excel)
Jika **Dosen Pengampu** menanyakan absensi matkulnya (misal: `"rekap absensi kelas ini"`):
1. Bot memverifikasi nomor dosen pengampu.
2. Bot merangkum status kehadiran sesi hari ini di chat.
3. **Bot secara otomatis men-generate dan mengirimkan dokumen `.xlsx` (Microsoft Excel)** rekapitulasi kehadiran lengkap seluruh pertemuan langsung ke obrolan WhatsApp!

---

## 7. Fitur Penanggung Jawab (PJ) Mata Kuliah

Setiap mata kuliah memiliki PJ dari kalangan mahasiswa untuk memudahkan koordinasi dengan dosen.

### A. Melihat Daftar PJ
- `list pj` atau `!pjall` : Menampilkan seluruh daftar PJ di kelas beserta kontak WhatsApp dan jadwal kuliah terkait.
- `!pj [kelas] [nama]` : Mencari kontak dan mata kuliah yang dipegang PJ tertentu.
- `!pjsaya` : Menampilkan daftar mata kuliah yang dipegang oleh nomor pengirim.

### B. Menambah / Mengubah PJ (Admin)
- **Tambah PJ:**
  ```
  Tambah PJ [Nama Mahasiswa] Matkul [Nama Matkul] WA [Nomor HP]
  ```
  _Contoh:_ `Tambah PJ Azka Rizrayanda Firdaus Matkul Aljabar Matriks WA 081391958852`
- **Edit PJ:** `Edit PJ [Nomor Urut], Nama [Nama Baru], WA [Nomor Baru]`
- **Hapus PJ:** `Hapus PJ [Nomor Urut]`

---

## 8. Fitur Informasi Dosen & Notifikasi Mengajar

### A. Melihat Kontak & Jadwal Dosen
- `!dosenall` : Database seluruh dosen pengampu dan jadwal mengajarnya.
- `!dosenbesok [Nama Dosen]` : Cek apakah dosen tertentu memiliki jadwal mengajar besok (Contoh: `!dosenbesok bu elly`).
- `!dosenkelas` : Menampilkan daftar dosen pengampu di kelas saat ini.

### B. Reminder Mengajar Otomatis
Sistem cron bot secara otomatis mengirimkan pesan pengingat langsung ke nomor WhatsApp pribadi dosen:
- **Reminder H-1 (Malam Hari):** Menginformasikan jadwal kuliah esok hari, nama kelas, jam, dan ruangan.
- **Reminder Hari H (Pagi / Sebelum Kuliah):** Mengingatkan persiapan kelas dan presensi RFID mahasiswa.

---

## 9. Fitur Monitoring untuk Orang Tua (Ortu)

Orang tua mahasiswa yang nomor WhatsApp-nya didaftarkan di tabel `ortu` dapat memantau kedisiplinan dan absensi anaknya.

**Cara Penggunaan:**
1. Orang tua mengirim chat pribadi (DM) ke nomor WhatsApp Bot.
2. Ketik:
   ```
   absensi anak saya
   ```
   _atau:_
   ```
   cek kehadiran
   ```
3. Bot otomatis mengenali data mahasiswa terkait berdasarkan nomor orang tua yang terdaftar, lalu membalas rincian:
   - Nama & NIM Mahasiswa.
   - Total sesi kuliah yang dihadiri (Tap RFID).
   - Riwayat kehadiran terbaru per mata kuliah.

---

## 10. Sistem AI NLP & Navigasi Menu Interaktif

### A. Menu Interaktif (`!menu`)
Ketik `!menu` atau `menu` di grup untuk membuka navigasi interaktif berbasis teks:

```
🧭 KATEGORI MENU UTAMA BOT
━━━━━━━━━━━━━━━━━━━━━━━━
📅 jadwal          ➜ Jadwal Kuliah & Ujian
⏳ jadwalsementara ➜ Jadwal Sementara / Pengganti
📊 absensi         ➜ Rekapitulasi Absensi RFID
📝 tugas           ➜ Manajemen Tugas & PR
👤 pj              ➜ Penanggung Jawab (PJ) Matkul
🧑‍🏫 dosen           ➜ Informasi & Jadwal Dosen
🛠️ admin           ➜ Panel Perintah Manajemen Admin
━━━━━━━━━━━━━━━━━━━━━━━━
Balas pesan dengan nama kategori untuk melihat rincian perintah.
```

**Navigasi:**
- Balas `back` untuk kembali ke daftar menu.
- Balas `out` untuk keluar dan menutup sesi menu.

### B. Mode Tanya Bebas (AI Fallback)
Jika pesan tidak cocok dengan format perintah di atas, sistem akan memproses maksud pertanyaan menggunakan NLP cerdas dan Google Gemini AI untuk memberikan respon yang ramah dan relevan dengan topik akademik kampus.

---

## 11. Tabel Ringkasan Perintah (Cheat Sheet)

| Perintah | Fungsi | Target Pengguna |
| :--- | :--- | :--- |
| `set kelas <nama_kelas>` | Menghubungkan grup WhatsApp ke kelas database | Super Admin / Admin Angkatan / Dosen |
| `unset kelas` | Melepas relasi grup dari kelas | Super Admin / Admin Angkatan / Dosen |
| `!menu` | Menampilkan dashboard menu utama bot | Semua |
| `!bantuan` | Menampilkan tutorial lengkap bot | Semua |
| `!jadwal` | Jadwal kuliah lengkap satu pekan | Mahasiswa / Umum |
| `!jadwalb` | Jadwal kuliah esok hari | Mahasiswa / Umum |
| `!jadwalsementara` | Cek kelas pengganti / kompensasi minggu ini | Mahasiswa / Umum |
| `!tugaslist` | Daftar tugas dan deadline aktif | Mahasiswa / Umum |
| `tambah tugas ...` | Menambah tugas baru ke sistem | PJ / Admin / Dosen |
| `!absensi` | Rekap kehadiran RFID sesi terkini | Mahasiswa / Dosen |
| `list pj` | Menampilkan seluruh penanggung jawab matkul | Mahasiswa / Umum |
| `!dosenbesok [nama]` | Cek jadwal mengajar dosen besok | Mahasiswa / Umum |
| `!ringkas [hari]` | Ringkasan teks padat jadwal | Mahasiswa / Umum |
| `!auditlog` | Memeriksa riwayat log perubahan data | Super Admin |

---

**© 2026 Tim Akademik & IT S1 Kecerdasan Artifisial - Universitas Negeri Surabaya**
