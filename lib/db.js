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

module.exports = pool;