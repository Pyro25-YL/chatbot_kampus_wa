process.env.TZ = 'Asia/Jakarta';
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'absensi_KA',
    password: 'KAASIK2026', // Sesuaikan dengan password user postgres Anda
    port: 5432,
    options: '-c timezone=Asia/Jakarta',
});

pool.on('connect', () => {
    console.log('⚡ Connected to PostgreSQL (absensi_KA) [WIB/Asia/Jakarta]');
});

// Auto-create table pj jika belum ada di database
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.pj (
                id SERIAL PRIMARY KEY,
                kelas_id UUID REFERENCES kelas(id) ON DELETE CASCADE,
                id_jadwal INTEGER REFERENCES jadwal(id_jadwal) ON DELETE SET NULL,
                nama VARCHAR(255) NOT NULL,
                matkul VARCHAR(255) DEFAULT 'Umum',
                wa VARCHAR(50) DEFAULT '-',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE public.mahasiswa ADD COLUMN IF NOT EXISTS no_wa VARCHAR(30);

            CREATE TABLE IF NOT EXISTS public.admin_angkatan (
                id SERIAL PRIMARY KEY,
                nama VARCHAR(100) NOT NULL,
                no_hp VARCHAR(30) UNIQUE NOT NULL,
                angkatan VARCHAR(10) NOT NULL,
                max_grup INTEGER DEFAULT 3,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS public.ortu (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nama VARCHAR(100) NOT NULL,
                no_hp VARCHAR(30) NOT NULL,
                mahasiswa_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE public.kelas ADD COLUMN IF NOT EXISTS admin_angkatan_hp VARCHAR(30);
            ALTER TABLE public.kelas ADD COLUMN IF NOT EXISTS angkatan VARCHAR(10);
        `);
        console.log('✅ [DATABASE] Tabel "pj", "admin_angkatan", "ortu", & kolom "no_wa" siap digunakan.');
    } catch (err) {
        console.error('❌ Error inisialisasi tabel database:', err.message);
    }
};

initDb();

module.exports = pool;