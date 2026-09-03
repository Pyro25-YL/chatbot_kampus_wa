const pool = require('./lib/db');

// Helper membersihkan format nomor WA menjadi '628...'
function formatWa(no) {
    if (!no) return '-';
    let clean = no.toString().replace(/\D/g, '');
    if (clean.startsWith('0')) {
        clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
        clean = '628' + clean.slice(1);
    }
    return clean;
}

// Helper nama Title Case untuk tabel PJ
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|\/|-|\.)\S/g, function(a) { return a.toUpperCase(); }).trim();
}

const rawStudents = [
    // === KELAS 2026A (17 Mahasiswa) ===
    { kelas: '2026a', nim: '26032014032', nama: 'Azka Rizrayanda Firdaus', wa: '081391958852', pj_matkul: 'Aljabar Matriks' },
    { kelas: '2026a', nim: '26032014082', nama: 'Dinda Jauza Kamilia', wa: '089699936684' },
    { kelas: '2026a', nim: '26032014031', nama: 'Ahmad Hilman Anwari', wa: '081553600407' },
    { kelas: '2026a', nim: '26032014046', nama: 'Danurwenda Catakapaksi Putra Sulistya', wa: '085607671130' },
    { kelas: '2026a', nim: '26032014076', nama: 'Sultan Febrian', wa: '082283800315', pj_matkul: 'Dasar Pemrograman' },
    { kelas: '2026a', nim: '26032014040', nama: 'Faisal Yudhistira Ruslan Putra', wa: '085866885961', pj_matkul: 'Interaksi Manusia dan Kecerdasan Artifisial' },
    { kelas: '2026a', nim: '26032014059', nama: 'Kastama Sholeh Abi Nugraha', wa: '08889008574', pj_matkul: 'Matematika Diskrit' },
    { kelas: '2026a', nim: '26032014052', nama: 'Mohamad Haikal Purnama Putra', wa: '081235155137' },
    { kelas: '2026a', nim: '26032014043', nama: 'Muhammad Wahyu Faisal', wa: '085816507908' },
    { kelas: '2026a', nim: '26032014027', nama: "Fat'han Fajar Irfany", wa: '085646256797' },
    { kelas: '2026a', nim: '26032014064', nama: 'Rihadatul Rosada', wa: '081399230113' },
    { kelas: '2026a', nim: '26032014044', nama: 'Arkan Kautsar Fauzan', wa: '082118764540' },
    { kelas: '2026a', nim: '26032014087', nama: 'Yansen Ramadhani Kantohe', wa: '085175100652' },
    { kelas: '2026a', nim: '26032014037', nama: 'Zirjy Zakwan Fayyadhiya', wa: '082112851095' },
    { kelas: '2026a', nim: '26032014066', nama: 'Jaga Pandita .R', wa: '085702663589' },
    { kelas: '2026a', nim: '26032014036', nama: 'Ghiffari bhanu purwanto', wa: '081290385570' },
    { kelas: '2026a', nim: '26032014057', nama: 'Haidar Ramzy Utomo', wa: '085695005295' },

    // === KELAS 2026B (33 Mahasiswa) ===
    { kelas: '2026b', nim: '26032014058', nama: 'Agung Widya Navanto', wa: '085216594440' },
    { kelas: '2026b', nim: '26032014054', nama: 'Cinta Nur Daniah', wa: '085708374110' },
    { kelas: '2026b', nim: '26032014007', nama: 'Hayfa Nashwa Khirani', wa: '089507421472' },
    { kelas: '2026b', nim: '26032014020', nama: 'Parasika putri kalimasahada', wa: '081805723708', pj_matkul: 'Matematika Diskrit' },
    { kelas: '2026b', nim: '26032014048', nama: 'Keysa Selinda Azahra Setiawan', wa: '085546413979' },
    { kelas: '2026b', nim: '26032014013', nama: 'Rahardian Dendy Darmawan', wa: '081333019741' },
    { kelas: '2026b', nim: '26032014075', nama: 'Ananda Rizky Pratama', wa: '085706238737', pj_matkul: 'Interaksi Manusia dan Kecerdasan Artifisial' },
    { kelas: '2026b', nim: '26032014051', nama: 'Brendi Izzul Haq', wa: '081359270199', pj_matkul: 'Matematika Dasar' },
    { kelas: '2026b', nim: '26032014025', nama: 'Sveta Restyaraa Tisnandaru', wa: '085748388714', pj_matkul: 'Dasar Pemrograman' },
    { kelas: '2026b', nim: '26032014015', nama: 'Aldyan Putra Pratama', wa: '082230891424' },
    { kelas: '2026b', nim: '26032014039', nama: 'Muhammad Bisma Ravadesta', wa: '081917191196' },
    { kelas: '2026b', nim: '26032014022', nama: 'Arum Risalatul Amal', wa: '085924062323' },
    { kelas: '2026b', nim: '26032014019', nama: 'M Hafidz Zuhri Al Hakimi', wa: '0881011284414' },
    { kelas: '2026b', nim: '26032014001', nama: 'Nur Solikhin', wa: '085904279669', pj_matkul: 'Aljabar Matriks' },
    { kelas: '2026b', nim: '26032014053', nama: 'Farelino Yudhika Pallevi', wa: '089516459560' },
    { kelas: '2026b', nim: '26032014045', nama: 'Hurin Nadhiroh', wa: '085338599156' },
    { kelas: '2026b', nim: '26032014005', nama: 'Vina Deby Oktavia', wa: '08983638777' },
    { kelas: '2026b', nim: '26032014042', nama: 'M. Amaristya Ardhita Chandra', wa: '088987295210' },
    { kelas: '2026b', nim: '26032014068', nama: 'Ahmad Rafel Raditya', wa: '081231849101' },
    { kelas: '2026b', nim: '26032014069', nama: 'Ikashela Cahaya Putri', wa: '085188578553' },
    { kelas: '2026b', nim: '26032014050', nama: 'Muchamad Chorni Noer', wa: '081211361936' },
    { kelas: '2026b', nim: '26032014061', nama: 'Muhammad Daniswara Firjatullah', wa: '081359566627' },
    { kelas: '2026b', nim: '26032014026', nama: 'Erza Rizky Ramadhan', wa: '081234242071' },
    { kelas: '2026b', nim: '26032014083', nama: 'Najwa Zahirah', wa: '085748050275' },
    { kelas: '2026b', nim: '26032014071', nama: 'Muhammad Arkan Tsany', wa: '081333486977' },
    { kelas: '2026b', nim: '26032014035', nama: 'Hanif Mova Rabih', wa: '081219599388' },
    { kelas: '2026b', nim: '26032014011', nama: 'Wulan Naswyyah', wa: '08978338497' },
    { kelas: '2026b', nim: '26032014089', nama: 'Dimas Rohman Inzaghi', wa: '085194936386' },
    { kelas: '2026b', nim: '26032014032', rfid_suffix: '_b', nama: 'Mohammad Barikh Zidane', wa: '085854342825' },
    { kelas: '2026b', nim: '26032014003', nama: 'Agus Prayoga Adi Wijaya', wa: '085184013834' },
    { kelas: '2026b', nim: '26032014006', nama: 'Rizqy Naufal Rudiansyah', wa: '085331069578' },
    { kelas: '2026b', nim: '26032014060', nama: 'Faiz Naufal Firjatullah', wa: '081357279643' },
    { kelas: '2026b', nim: '26032014018', nama: 'wijang laksmana putra', wa: '085179707677' },

    // === KELAS 2026C (36 Mahasiswa) ===
    { kelas: '2026c', nim: '26032014085', nama: 'Ibna Clevaro Syarif', wa: '082210694440', pj_matkul: 'Interaksi Manusia dan Kecerdasan Artifisial' },
    { kelas: '2026c', nim: '26032014009', nama: 'Ardimas Naufal Rianto', wa: '082114483500' },
    { kelas: '2026c', nim: '26032014024', nama: 'Dimas arya for luthfi', wa: '081336044625' },
    { kelas: '2026c', nim: '26032014055', nama: 'Ryan Grahita Hadi', wa: '087859959728' },
    { kelas: '2026c', nim: '26032014004', nama: 'Muhammad Dzikri Athaillah Juniarso', wa: '087785472431' },
    { kelas: '2026c', nim: '26032014029', nama: 'Vicencius Kevin Tria Nanda', wa: '081326807086' },
    { kelas: '2026c', nim: '26032014074', nama: 'Kholis Apdhal', wa: '087769862871' },
    { kelas: '2026c', nim: '26032014065', nama: 'Muhammad Shifan Nehan', wa: '085806249838' },
    { kelas: '2026c', nim: '26032014070', nama: 'Faturrohman Al Fatoni', wa: '083123046889' },
    { kelas: '2026c', nim: '26032014017', nama: 'Achmad Airlangga Justitia Yuansyah', wa: '085732670366' },
    { kelas: '2026c', nim: '26032014056', nama: 'Reinzal Kinas Pratama', wa: '082330764421' },
    { kelas: '2026c', nim: '26032014073', nama: 'Feiruz Zidan Aghnia', wa: '085704973702', pj_matkul: 'Aljabar Matriks' },
    { kelas: '2026c', nim: '26032014016', nama: 'Ahmad Faiz Abdillah', wa: '083857922278' },
    { kelas: '2026c', nim: '26032014088', nama: 'Raditya Achmad Wibawa', wa: '082247311899' },
    { kelas: '2026c', nim: '26032014002', nama: 'Fajar Arya Nova', wa: '081334817567', pj_matkul: 'Matematika Dasar' },
    { kelas: '2026c', nim: '26032014023', nama: 'I Gde Agastya Devdan Prajnaiswara', wa: '085719279855' },
    { kelas: '2026c', nim: '26032014062', nama: 'Masayu Dwi Ajeng Putri Wijaya', wa: '085727745159', pj_matkul: 'Matematika Diskrit' },
    { kelas: '2026c', nim: '26032014033', nama: 'Muhammad Fikrul Ihsaan', wa: '081393051852' },
    { kelas: '2026c', nim: '26032014010', nama: 'Erza Bakti Pratama', wa: '085604873170' },
    { kelas: '2026c', nim: '26032014008', nama: 'Arellano Cheza Ananda Putra', wa: '089514563599' },
    { kelas: '2026c', nim: '26032014080', nama: 'Muhammad Zakaria Hakim', wa: '082120038728' },
    { kelas: '2026c', nim: '26032014067', nama: 'Raihan Bintang Ramadhan', wa: '085736528637' },
    { kelas: '2026c', nim: '26032014079', nama: 'Nurul Azmil Nasyifa', wa: '085604301497', pj_matkul: 'Dasar Pemrograman' },
    { kelas: '2026c', nim: '26032014081', nama: 'Nayla Jannati Azka', wa: '082232136833' },
    { kelas: '2026c', nim: '26032014077', nama: 'Ardhan Raisya Abimanyu', wa: '085714451514' },
    { kelas: '2026c', nim: '26032014012', nama: 'Ikhsyid Zufaruto Rianggara', wa: '08388831429' },
    { kelas: '2026c', nim: '26032014086', nama: "Adam surujussyifa'", wa: '08817914694' },
    { kelas: '2026c', nim: '26032014063', nama: 'Naila Zulfa Nur Sabrina', wa: '081224773587' },
    { kelas: '2026c', nim: '26032014072', nama: 'Mohammad Nauval Fardhani Bonenehu', wa: '089631314427' },
    { kelas: '2026c', nim: '26032014047', nama: 'Haidar Kayyis Taqiyuddin', wa: '085117013025' },
    { kelas: '2026c', nim: '26032014021', nama: 'Kholid Amrullah Ibrahim', wa: '085175168095', pj_matkul: 'Agama Islam' },
    { kelas: '2026c', nim: '26032014034', nama: 'Baffa Syahreza Ervianto Putra', wa: '085230822311' },
    { kelas: '2026c', nim: '26032014084', nama: 'Dzaky Tsabitul Azmi', wa: '082329826782' },
    { kelas: '2026c', nim: '26032014038', nama: 'Alvin Arva Putra R', wa: '082143486657' },
    { kelas: '2026c', nim: '26032014014', nama: 'Aditya Candra Saputra', wa: '081321213527' },
    { kelas: '2026c', nim: '26032014041', nama: 'Abigail Theresia Hutabarat', wa: '081585362047' },
];

async function run() {
    try {
        console.log('🚀 Memulai proses input data Mahasiswa & PJ...');

        // 1. Ambil map kelas_id
        const resKelas = await pool.query('SELECT id, nama_kelas FROM kelas');
        const kelasMap = {};
        resKelas.rows.forEach(k => {
            kelasMap[k.nama_kelas.toLowerCase().trim()] = k.id;
        });

        // 2. Ambil jadwal untuk pencocokan id_jadwal PJ
        const resJadwal = await pool.query('SELECT id_jadwal, kelas_id, matkul FROM jadwal');
        const jadwalList = resJadwal.rows;

        // 3. Masukkan ke tabel mahasiswa
        let mhsInserted = 0;
        let mhsUpdated = 0;

        for (const s of rawStudents) {
            const kId = kelasMap[s.kelas.toLowerCase()];
            if (!kId) {
                console.error(`❌ Kelas ${s.kelas} tidak ditemukan!`);
                continue;
            }

            const cleanNim = s.nim.trim();
            const rfidUid = cleanNim + (s.rfid_suffix || '');
            const namaUpper = s.nama.trim().toUpperCase();
            const cleanWa = formatWa(s.wa);

            const checkMhs = await pool.query('SELECT rfid_uid FROM mahasiswa WHERE rfid_uid = $1 OR (nim = $2 AND kelas_id = $3)', [rfidUid, cleanNim, kId]);
            if (checkMhs.rows.length > 0) {
                await pool.query(
                    'UPDATE mahasiswa SET nama = $1, nim = $2, kelas_id = $3, no_wa = $4 WHERE rfid_uid = $5',
                    [namaUpper, cleanNim, kId, cleanWa, checkMhs.rows[0].rfid_uid]
                );
                mhsUpdated++;
            } else {
                await pool.query(
                    'INSERT INTO mahasiswa (rfid_uid, nama, nim, kelas_id, no_wa) VALUES ($1, $2, $3, $4, $5)',
                    [rfidUid, namaUpper, cleanNim, kId, cleanWa]
                );
                mhsInserted++;
            }
        }

        console.log(`✅ [MAHASISWA] Selesai! Ditambahkan: ${mhsInserted}, Diperbarui: ${mhsUpdated}`);

        // 4. Masukkan ke tabel PJ
        let pjInserted = 0;
        let pjUpdated = 0;

        for (const s of rawStudents) {
            if (!s.pj_matkul) continue;

            const kId = kelasMap[s.kelas.toLowerCase()];
            const namaTitle = toTitleCase(s.nama);
            const cleanWa = formatWa(s.wa);
            const matkulTitle = toTitleCase(s.pj_matkul);

            // Cari id_jadwal yang sesuai di kelas ini
            let matchedJadwal = jadwalList.find(j => 
                j.kelas_id === kId && 
                j.matkul && 
                j.matkul.toLowerCase().includes(matkulTitle.toLowerCase())
            );

            // Jika khusus Agama Islam yang kelas_id nya null di jadwal
            if (!matchedJadwal && matkulTitle.toLowerCase().includes('agama islam')) {
                matchedJadwal = jadwalList.find(j => j.matkul && j.matkul.toLowerCase().includes('agama islam'));
            }

            const idJadwal = matchedJadwal ? matchedJadwal.id_jadwal : null;

            // Cek apakah PJ untuk kelas dan matkul ini sudah ada
            const checkPj = await pool.query(
                'SELECT id FROM pj WHERE kelas_id = $1 AND LOWER(matkul) = LOWER($2)',
                [kId, matkulTitle]
            );

            if (checkPj.rows.length > 0) {
                await pool.query(
                    'UPDATE pj SET nama = $1, wa = $2, id_jadwal = $3 WHERE id = $4',
                    [namaTitle, cleanWa, idJadwal, checkPj.rows[0].id]
                );
                pjUpdated++;
            } else {
                await pool.query(
                    'INSERT INTO pj (chat_id, kelas_id, nama, matkul, wa, id_jadwal) VALUES (null, $1, $2, $3, $4, $5)',
                    [kId, namaTitle, matkulTitle, cleanWa, idJadwal]
                );
                pjInserted++;
            }
        }

        console.log(`✅ [PJ] Selesai! Ditambahkan: ${pjInserted}, Diperbarui: ${pjUpdated}`);

        // Verifikasi hasil akhir
        const countMhs = await pool.query('SELECT COUNT(*) FROM mahasiswa');
        const countPj = await pool.query('SELECT COUNT(*) FROM pj');
        console.log(`📊 Total Mahasiswa di DB: ${countMhs.rows[0].count}`);
        console.log(`📊 Total PJ di DB: ${countPj.rows[0].count}`);

        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

run();
