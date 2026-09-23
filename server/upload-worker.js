import { parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
try {
  const buffer = Buffer.from(workerData.base64, 'base64');
  const extension = workerData.name.split('.').pop().toLowerCase();
  let text = '';
  if (['jpg', 'jpeg', 'png'].includes(extension)) {
    const { default: sharp } = await import('sharp');
    const data = await sharp(buffer, { limitInputPixels: 16000000 }).resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    parentPort.postMessage({ image: `data:image/jpeg;base64,${data.toString('base64')}` });
  } else {
    if (['xlsx', 'docx'].includes(extension)) {
      const { default: Zip } = await import('adm-zip');
      const entries = new Zip(buffer).getEntries();
      if (entries.length > 2000 || entries.reduce((n, e) => n + e.header.size, 0) > 25000000) throw Error('Архив документа слишком большой.');
    }
    if (extension === 'docx') { const { default: mammoth } = await import('mammoth'); text = (await mammoth.extractRawText({ buffer })).value; }
    else if (extension === 'xlsx') {
      const { default: ExcelJS } = await import('exceljs'); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
      for (const sheet of workbook.worksheets.slice(0, 3)) { sheet.eachRow((row, n) => { if (n <= 150) text += row.values.slice(1, 15).map(v => typeof v === 'object' ? (v?.text || v?.result || '') : v).join(' | ') + '\n'; }); }
    } else if (extension === 'pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const standardFontDataUrl = fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/');
      const loadingTask = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl });
      const pdf = await loadingTask.promise;
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(x => x.str || '').join(' ') + '\n';
      await loadingTask.destroy();
    } else throw Error('Поддерживаются PDF, DOCX, XLSX, JPEG и PNG. Старые DOC/XLS сохраните в новом формате.');
    if (!text.trim()) throw Error('Текст не найден. Для скана отправьте страницу как JPEG.');
    parentPort.postMessage({ text: text.slice(0, 5000), truncated: text.length > 5000 });
  }
} catch (e) { parentPort.postMessage({ error: e.message }); }
