const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'absensi_KA',
    password: 'MSE2006', // Sesuaikan password pgAdmin
    port: 5432,
});

pool.on('connect', () => {
    console.log('⚡ Connected to PostgreSQL (absensi_KA)');
});

module.exports = pool;