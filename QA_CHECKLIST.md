# ✅ QA Checklist — YouTube Auto Comment (Durasi-Based)

**Mode**
- 🎥 Video: Round-Robin
- 💬 Comment: Random
- ⏳ Delay: Random
- ⏱️ Duration: Parent Controller

---

## 🔧 A. Pre-Run Check

- [ ] CSV Video berhasil di-upload
- [ ] CSV Comment berhasil di-upload
- [ ] Endpoint `/progress` menampilkan data video
- [ ] Preview comment muncul di UI
- [ ] Worker status = **IDLE**
- [ ] Tombol **Start** aktif
- [ ] Tombol **Stop** nonaktif

---

## ▶️ B. Start Worker

- [ ] Klik **Start Posting**
- [ ] Toast “Posting started 🚀” muncul
- [ ] Worker status berubah ke **RUNNING**
- [ ] Tombol **Start** terkunci
- [ ] Tombol **Stop** aktif
- [ ] Countdown mulai berjalan

---

## 🔁 C. Core Flow Validation

### 🎥 Video Rotation (Round-Robin)
- [ ] Video pertama dikomentari
- [ ] Video kedua dikomentari
- [ ] Video ketiga dikomentari
- [ ] Setelah video terakhir → kembali ke video pertama
- [ ] Tidak ada video yang terpilih terus-menerus

---

### 💬 Comment Behavior
- [ ] Comment diambil dari CSV
- [ ] Comment dipilih secara random
- [ ] Video yang sama bisa mendapat comment berbeda
- [ ] AI rewrite digunakan (jika diaktifkan)

---

### ⏳ Delay Behavior
- [ ] Delay muncul di log
- [ ] Nilai delay bervariasi
- [ ] Delay ≥ `minDelay`
- [ ] Delay ≤ `maxDelay`

---

## 🧠 D. Duplicate Handling

- [ ] Duplicate comment terdeteksi
- [ ] Log `Duplicate comment skipped` muncul
- [ ] Worker tetap berjalan
- [ ] Delay tetap dijalankan
- [ ] Tidak terjadi crash atau freeze

---

## 📊 E. UI & Progress

- [ ] Progress table ter-update otomatis
- [ ] Status video berubah (`processing` → `done`)
- [ ] Comment terakhir tampil di tabel
- [ ] UI tidak stuck di satu video
- [ ] Log auto-scroll berjalan

---

## ⏱️ F. Duration Control (Critical)

- [ ] Countdown menurun stabil
- [ ] Countdown tidak reset saat posting
- [ ] Worker berhenti saat durasi habis
- [ ] Status kembali ke **IDLE**
- [ ] UI unlock otomatis

---

## ⛔ G. Manual Stop

- [ ] Klik tombol **Stop**
- [ ] Log “Stop requested” muncul
- [ ] Worker berhenti dengan aman
- [ ] Tidak ada posting lanjutan
- [ ] UI kembali normal

---

## ⚠️ H. Edge Cases

### Data Kosong
- [ ] Video kosong → worker tidak berjalan
- [ ] Comment kosong → worker tidak berjalan
- [ ] Error log muncul tanpa crash

---

## 🧹 I. Cleanup & Stability

- [ ] Tombol **Clear Log** berfungsi
- [ ] Reload halaman tidak menyebabkan worker auto-start
- [ ] Status worker konsisten setelah reload

---

## 🏁 Final Verdict

- [ ] Semua video terkomentari secara adil
- [ ] Durasi menjadi kontrol utama
- [ ] Tidak ada infinite loop
- [ ] Tidak ada double posting tidak disengaja
- [ ] Sistem siap digunakan di production

---

## ⭐ Optional Rating

- Stability: ⭐⭐⭐⭐⭐  
- Predictability: ⭐⭐⭐⭐⭐  
- Human-like Behavior: ⭐⭐⭐⭐☆