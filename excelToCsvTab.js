/* Excel → CSV tab (browser; same behavior as excelToCSV.html) */
(function (global) {
  'use strict';

  function bindUi() {
    const fileInput = document.getElementById('excelToCsvFile');
    const sheetSelect = document.getElementById('excelToCsvSheet');
    const downloadButton = document.getElementById('excelToCsvDownload');
    const status = document.getElementById('excelToCsvStatus');
    if (!fileInput || !sheetSelect || !downloadButton || !status) return;

    let workbook = null;
    let fileName = 'output';

    fileInput.addEventListener('change', async () => {
      workbook = null;
      downloadButton.hidden = true;
      downloadButton.disabled = true;
      sheetSelect.disabled = true;

      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      try {
        if (typeof global.XLSX === 'undefined') {
          throw new Error('Excel library could not load. Check internet access.');
        }

        const buffer = await file.arrayBuffer();
        workbook = global.XLSX.read(buffer, { type: 'array' });

        if (!workbook.SheetNames.length) {
          throw new Error('No worksheets found.');
        }

        fileName = file.name.replace(/\.(xlsx|xls)$/i, '');
        sheetSelect.replaceChildren();
        workbook.SheetNames.forEach((name) => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          sheetSelect.appendChild(option);
        });

        sheetSelect.disabled = false;
        downloadButton.hidden = false;
        downloadButton.disabled = false;
        status.textContent =
          'Imported ' + file.name + ' — ' + workbook.SheetNames.length + ' worksheet(s).';
      } catch (error) {
        workbook = null;
        status.textContent = 'Import failed: ' + error.message;
      }
    });

    downloadButton.addEventListener('click', () => {
      if (!workbook) return;
      try {
        const sheetName = sheetSelect.value;
        const worksheet = workbook.Sheets[sheetName];
        const csv = global.XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
        const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName + '_' + sheetName + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = 'Downloaded ' + fileName + '_' + sheetName + '.csv';
      } catch (error) {
        status.textContent = 'Conversion failed: ' + error.message;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }
})(typeof window !== 'undefined' ? window : global);
