import { Worker } from 'node:worker_threads';
import { AppError } from './assistant.js';
export async function extractAttachment(file) {
  if (!file || typeof file.name !== 'string' || file.name.length > 200 || typeof file.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) || Buffer.byteLength(file.base64, 'base64') > 5 * 1024 * 1024) throw new AppError(400, 'Недопустимый файл. Максимум 5 МБ.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./upload-worker.js', import.meta.url), { workerData: file, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    const timer = setTimeout(() => { worker.terminate(); reject(new AppError(400, 'Обработка файла превысила 12 секунд. Отправьте меньший файл.')); }, 12000);
    worker.once('message', data => { clearTimeout(timer); worker.terminate(); data.error ? reject(Object.assign(new AppError(400, 'Не удалось прочитать файл. Проверьте формат (PDF/DOCX/XLSX/JPEG/PNG), размер и отсутствие пароля.'), { cause: new Error(data.error) })) : resolve(data); });
    worker.once('error', () => { clearTimeout(timer); reject(new AppError(400, 'Не удалось прочитать файл.')); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new AppError(400, 'Обработка файла остановлена.')); });
  });
}
