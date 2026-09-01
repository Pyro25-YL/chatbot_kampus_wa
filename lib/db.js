const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'absensi_KA',
    password: 'KAASIK2026', // Sesuaikan dengan password user postgres Anda
    port: 5432,
});

pool.on('connect', () => {
    console.log('⚡ Connected to PostgreSQL (absensi_KA)');
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
        `);
        console.log('✅ [DATABASE] Tabel "pj" siap digunakan.');
    } catch (err) {
        console.error('❌ Error inisialisasi tabel pj:', err.message);
    }
};

initDb();

module.exports = pool;