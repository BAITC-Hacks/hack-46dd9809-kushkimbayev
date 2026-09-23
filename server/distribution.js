import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Zip from 'adm-zip';
const extensionRoot = new URL('../extension/', import.meta.url);
export const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', extensionRoot), 'utf8'));
export const extensionId = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
export const extensionOrigin = `chrome-extension://${extensionId}`;
export function validateServerURL(value) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('Server URL must be an HTTPS origin (or localhost for development).');
  return url.origin;
}
export function extensionFiles(base) {
  const serverURL = validateServerURL(base);
  const release = { ...manifest, version: '0.6.0', host_permissions: [`${serverURL}/*`], action: { default_title: 'Открыть консультанта EKT' } };
  delete release.options_page; delete release.optional_host_permissions;
  const files = { 'manifest.json': Buffer.from(JSON.stringify(release, null, 2)), 'config.js': Buffer.from(`globalThis.EKT_CONFIG = Object.freeze(${JSON.stringify({ serverURL })});\n`) };
  for (const name of ['background.js', 'content.js', 'widget.html', 'widget.css', 'widget.js']) files[name] = fs.readFileSync(new URL(name, extensionRoot));
  files['INSTALL.txt'] = Buffer.from('EKT Assistant\r\n\r\n1. Start the local server (Start-EKT.cmd).\r\n2. Extract this ZIP into a folder.\r\n3. Open chrome://extensions and enable Developer mode.\r\n4. Click Load unpacked and select this folder.\r\n5. Open https://ekt.kz. Everything is already configured.\r\n\r\nNo API keys or extension settings are needed. The local server must be running on the same computer as Chrome.\r\n');
  return files;
}
export function extensionZip(base) {
  const archive = new Zip();
  for (const [name, content] of Object.entries(extensionFiles(base))) archive.addFile(name, content);
  return archive.toBuffer();
}
