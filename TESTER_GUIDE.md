# Panduan Tester (Versi 1.0)

Dokumen ini berisi panduan cara penggunaan aplikasi YouTube Auto Comment.

## 1. Persiapan (Setup)

Akses aplikasi di browser: `https://ytpost.2ndc.app/`

## 2. Fitur & Cara Pakai

### A. Upload Komentar dengan Spintax
Sekarang Anda bisa membuat variasi komentar di file CSV agar tidak dianggap spam.
**Format**: `{Opsi1|Opsi2|Opsi3}`
**Contoh CSV**:
```
text
"Keren banget! {Cek video ini|Info lanjut|Selengkapnya} disini: https://youtu.be/..."
"Wah mantap bang, {lanjutkan|semangat|gas terus}!"
```
*Sistem akan memilih satu opsi secara acak setiap kali posting.*

### B. Mode Posting (Timer vs List)
Di menu **Timer Settings**:
1.  **Batasi dengan Durasi (Timer) = ON** (Default)
    *   Robot berjalan selama waktu yang ditentukan (misal 1 jam).
    *   Jika video habis, dia akan mengulang dari awal list.
2.  **Batasi dengan Durasi (Timer) = OFF** (Mode Baru)
    *   Robot hanya berjalan **SATU KALI PUTARAN** list video.
    *   Jika list video (misal 5 video) selesai dikomen semua, robot **STOP otomatis**.
    *   Cocok untuk kerja tuntas per batch.

### C. Logika AI Context (Judul & Deskripsi)
Di menu **Comment Engine Settings**:
1.  **Ambil Context Video (Judul + Deskripsi)**: `ON`
2.  **Aktifkan Pemrosesan AI**: `ON`

**Hasilnya**:
Sistem akan menghasilkan komentar gabungan:
*   **Atas**: Opini AI tentang video tersebut (berdasarkan Judul/Deskripsi).
*   **Bawah**: Template komentar Anda dari CSV (sebagai footer/link).

> **PENTING**: Jika tombol AI `OFF`, sistem hanya akan memposting mentahan dari CSV (tanpa opini AI), meskipun Context `ON`.

### D. Tombol Stop Instan
Tombol **STOP** sekarang bekerja instan. Tidak perlu menunggu delay (misal 60 detik) selesai. Begitu ditekan, robot akan berhenti sesegera mungkin.

## 3. Tips Anti-Spam
*   Gunakan **Spintax** sebanyak mungkin.
*   Jangan gunakan link yang sama persis 100% terus menerus.
*   Gunakan delay yang manusiawi (jangan terlalu cepat).
