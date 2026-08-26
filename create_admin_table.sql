-- =======================================================
-- QUERY TABEL ADMIN (HANYA KOLOM NAMA & NO_HP)
-- Database: absensi_KA | PostgreSQL
-- =======================================================

-- OPSI 1 (DIREKOMENDASIKAN KARENA TABEL MASIH KOSONG):
-- Hapus tabel lama dan buat baru yang bersih hanya dengan kolom nama dan no_hp
DROP TABLE IF EXISTS public.admin CASCADE;

CREATE TABLE public.admin (
    id SERIAL PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    no_hp VARCHAR(30) UNIQUE NOT NULL
);

-- Tambahkan Data Admin
INSERT INTO public.admin (nama, no_hp) VALUES
('Yoga Candra (Admin Utama)', '6282258756166'),
('Admin 2', '6289698926555'),
('Admin 3', '6287860293794'),
('Admin 4', '6285196293827');
