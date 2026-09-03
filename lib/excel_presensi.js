const XLSX = require('xlsx');
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Menghasilkan file Excel (.xlsx) Rekapitulasi Presensi Perkuliahan
 * @param {object} param
 * @param {Array} param.listMhs - Daftar mahasiswa di kelas
 * @param {Array} param.daftarTanggal - Daftar tanggal unik pertemuan yang ada lognya
 * @param {Map} param.logMap - Map log absensi key `${rfid_uid}_${tanggalStr}`
 * @param {object} param.infoJadwal - Informasi mata kuliah, kelas, dan dosen
 * @returns {MessageMedia} Objek MessageMedia whatsapp-web.js siap kirim
 */
function createExcelPresensi({ listMhs, daftarTanggal, logMap, infoJadwal }) {
    const rows = [];

    // Format tanggal header
    const tglHeaders = daftarTanggal.map((tglStr, i) => {
        const d = new Date(tglStr);
        const day = String(d.getDate()).padStart(2, '0');
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return { key: tglStr, label: `P${i + 1} (${day}/${m})` };
    });

    listMhs.forEach((mhs, idx) => {
        const rowData = {
            "No": idx + 1,
            "NIM": mhs.nim,
            "Nama Mahasiswa": mhs.nama,
            "Kelas": (mhs.nama_kelas || infoJadwal.nama_kelas || '-').toUpperCase(),
        };

        let hadirCount = 0;
        let terlambatCount = 0;
        let alphaCount = 0;

        tglHeaders.forEach(th => {
            const key = `${mhs.rfid_uid}_${th.key}`;
            const log = logMap.get(key);
            if (log) {
                if (log.status?.toLowerCase() === 'terlambat') {
                    rowData[th.label] = 'T (Terlambat)';
                    terlambatCount++;
                } else {
                    rowData[th.label] = 'H (Hadir)';
                    hadirCount++;
                }
            } else {
                rowData[th.label] = 'A (Alpha)';
                alphaCount++;
            }
        });

        const totalPertemuan = tglHeaders.length;
        const totalMasuk = hadirCount + terlambatCount;
        const persen = totalPertemuan > 0 ? Math.round((totalMasuk / totalPertemuan) * 100) : 100;

        rowData["Hadir Tepat"] = hadirCount;
        rowData["Terlambat"] = terlambatCount;
        rowData["Alpha / Tidak Hadir"] = alphaCount;
        rowData["Persentase Kehadiran"] = `${persen}%`;

        rows.push(rowData);
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Set lebar kolom otomatis agar rapi saat dibuka di Excel
    const colWidths = [
        { wch: 5 },  // No
        { wch: 15 }, // NIM
        { wch: 30 }, // Nama Mahasiswa
        { wch: 10 }, // Kelas
    ];
    tglHeaders.forEach(() => colWidths.push({ wch: 14 }));
    colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 20 });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    const sheetName = (infoJadwal.matkul || 'Presensi').slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const cleanMatkul = (infoJadwal.matkul || 'Kuliah').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanKelas = (infoJadwal.nama_kelas || 'Kelas').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Rekap_Presensi_${cleanMatkul}_${cleanKelas}.xlsx`;

    return new MessageMedia(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer.toString('base64'),
        fileName
    );
}

module.exports = {
    createExcelPresensi
};
