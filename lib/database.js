// lib/database.js
const fs = require('fs');
const { FILE_DB } = require('../config');

const bacaData = () => {
    try {
        return JSON.parse(fs.readFileSync(FILE_DB));
    } catch (e) {
        return {};
    }
};

const simpanData = (data) => {
    fs.writeFileSync(FILE_DB, JSON.stringify(data, null, 2));
};

// Inisialisasi file jika belum ada
if (!fs.existsSync(FILE_DB)) simpanData({});

module.exports = { bacaData, simpanData };