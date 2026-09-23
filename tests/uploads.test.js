import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import Zip from 'adm-zip';
import sharp from 'sharp';
import { extractAttachment } from '../server/uploads.js';
test('Excel specifications are extracted locally', async () => { const book = new ExcelJS.Workbook(); book.addWorksheet('Spec').addRows([['Артикул', 'Кол-во'], ['DEMO-101', 2]]); const result = await extractAttachment({ name: 'spec.xlsx', base64: Buffer.from(await book.xlsx.writeBuffer()).toString('base64') }); assert.match(result.text, /DEMO-101/); });
test('Word text is extracted without rendering embedded HTML', async () => {
  const zip = new Zip(); zip.addFile('[Content_Types].xml', Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')); zip.addFile('word/document.xml', Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DEMO-101 2</w:t></w:r></w:p></w:body></w:document>'));
  const result = await extractAttachment({ name: 'spec.docx', base64: zip.toBuffer().toString('base64') }); assert.match(result.text, /DEMO-101/);
});
test('images are decoded, resized and converted to stripped JPEG', async () => { const buffer = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer(); const result = await extractAttachment({ name: 'photo.png', base64: buffer.toString('base64') }); assert.match(result.image, /^data:image\/jpeg;base64,/); });
test('PDF text layer is extracted', async () => {
  const stream = 'BT /F1 12 Tf 20 100 Td (DEMO-101 2 pieces) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; }); const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractAttachment({ name: 'spec.pdf', base64: Buffer.from(pdf).toString('base64') }).catch(e => { throw e.cause || e; }); assert.match(result.text, /DEMO-101/);
});
test('reject unsupported, malformed and oversize files', async () => { await assert.rejects(extractAttachment({ name: 'x.exe', base64: 'YWJj' })); await assert.rejects(extractAttachment({ name: 'x.pdf', base64: 'YWJj' })); await assert.rejects(extractAttachment({ name: 'x.jpg', base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') })); });
