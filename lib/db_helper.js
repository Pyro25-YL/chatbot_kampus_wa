const db = require('./db');

// 1. Ambil Jadwal Reguler berdasarkan Group WA
async function getJadwalByGroup(groupIdWA) {
    const query = `
        SELECT 
            j.id_jadwal,
            j.hari,
            j.jam_mulai,
            j.jam_selesai,
            mk.nama_mk AS matkul,
            d.nama AS dosen,
            d.no_hp AS wa_dosen,
            k.nama_kelas
        FROM jadwal j
        JOIN kelas k ON j.kelas_id = k.id
        JOIN mata_kuliah mk ON j.mata_kuliah_id = mk.id
        JOIN dosen d ON j.dosen_id = d.id
        WHERE k.group_id_wa = $1
        ORDER BY j.jam_mulai ASC;
    `;
    const res = await db.query(query, [groupIdWA]);
    return res.rows;
}

// 2. Ambil Jadwal Khusus / Sementara berdasarkan Group WA
async function getJadwalKhususByGroup(groupIdWA) {
    const query = `
        SELECT 
            jk.id_khusus,
            jk.tanggal_asli,
            jk.status_perubahan,
            jk.tanggal_baru,
            jk.jam_mulai_baru,
            jk.jam_selesai_baru,
            mk.nama_mk AS matkul,
            d.nama AS dosen
        FROM jadwal_khusus jk
        JOIN jadwal j ON jk.id_jadwal = j.id_jadwal
        JOIN kelas k ON j.kelas_id = k.id
        JOIN mata_kuliah mk ON j.mata_kuliah_id = mk.id
        JOIN dosen d ON j.dosen_id = d.id
        WHERE k.group_id_wa = $1;
    `;
    const res = await db.query(query, [groupIdWA]);
    return res.rows;
}

// 3. Tambah / Edit Jadwal Khusus (Sementara)
async function simpanJadwalKhusus(idJadwal, tglAsli, status, tglBaru, jamMulai, jamSelesai) {
    const query = `
        INSERT INTO jadwal_khusus (id_jadwal, tanggal_asli, status_perubahan, tanggal_baru, jam_mulai_baru, jam_selesai_baru)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [idJadwal, tglAsli, status, tglBaru, jamMulai, jamSelesai];
    const res = await db.query(query, values);
    return res.rows[0];
}

// 4. Set/Update Group WA untuk suatu Kelas
async function linkGroupToKelas(namaKelas, groupIdWA) {
    const query = `
        UPDATE kelas 
        SET group_id_wa = $1 
        WHERE LOWER(nama_kelas) = LOWER($2)
        RETURNING *;
    `;
    const res = await db.query(query, [groupIdWA, namaKelas]);
    return res.rows[0];
}

module.exports = {
    getJadwalByGroup,
    getJadwalKhususByGroup,
    simpanJadwalKhusus,
    linkGroupToKelas
};