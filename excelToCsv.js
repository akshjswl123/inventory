'use strict';

const XLSX = require('xlsx');

/**
 * @param {Buffer} buffer
 * @param {string} [sheetName] — worksheet name; default first sheet
 * @returns {{ csv: string, sheetName: string, sheetNames: string[] }}
 */
function excelBufferToCsv(buffer, sheetName) {
    if (!buffer || !buffer.length) {
        throw new Error('Empty file');
    }
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames || [];
    if (!sheetNames.length) {
        throw new Error('No worksheets found');
    }
    let name = sheetName != null && String(sheetName).trim() !== ''
        ? String(sheetName).trim()
        : sheetNames[0];
    if (!sheetNames.includes(name)) {
        throw new Error('Worksheet not found: ' + name);
    }
    const worksheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
    return { csv, sheetName: name, sheetNames };
}

module.exports = { excelBufferToCsv };
