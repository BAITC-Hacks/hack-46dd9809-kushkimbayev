import fs from 'node:fs';
import { extensionFiles, extensionZip, extensionId } from '../server/distribution.js';
const base = process.argv[2] || process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/ekt-assistant.zip', extensionZip(base));
// Keep the developer's unpacked copy identical to the downloadable client.
for (const [name, data] of Object.entries(extensionFiles(base))) if (['manifest.json', 'config.js'].includes(name)) fs.writeFileSync(`extension/${name}`, data);
console.log(`Extension ready: dist/ekt-assistant.zip\nServer: ${base}\nStable ID: ${extensionId}`);
