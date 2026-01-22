const moment = require('moment'); // Gunakan library moment untuk hitung waktu

/**
 * Logika Penentu Jeda Reminder
 * @param {Date} deadline - Waktu tugas berakhir
 * @returns {String} - 'daily' atau 'hourly'
 */
const checkReminderUrgency = (deadline) => {
    const now = moment();
    const target = moment(deadline);
    const diffInHours = target.diff(now, 'hours');

    // Jika sudah lewat deadline, berhenti reminder
    if (diffInHours < 0) return 'expired';

    // Jika sisa waktu <= 48 jam (H-2), kirim per jam
    if (diffInHours <= 48) {
        return 'hourly';
    } 

    // Jika masih jauh, kirim tiap hari
    return 'daily';
};

/**
 * Contoh Fungsi Pengirim (Panggil di Cron Job atau Loop)
 */
const runTaskReminder = async (client, dbTugas) => {
    dbTugas.forEach(tugas => {
        const urgency = checkReminderUrgency(tugas.deadline);
        
        if (urgency === 'hourly') {
            // Logika kirim pesan tiap jam (gunakan cron: 0 * * * *)
            client.sendMessage(tugas.userId, `🚨 DEADLINE DEKAT! Tugas: "${tugas.judul}" kurang dari 2 hari lagi!`);
        } else if (urgency === 'daily') {
            // Logika kirim pesan tiap hari (gunakan cron: 0 07 * * *)
            client.sendMessage(tugas.userId, `📌 Reminder Harian: Jangan lupa kerjakan "${tugas.judul}".`);
        }
    });
};

module.exports = { checkReminderUrgency, runTaskReminder };