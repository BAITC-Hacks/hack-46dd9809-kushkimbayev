import https from 'node:https';
import { Resolver } from 'node:dns/promises';

// Bypass the Windows OS lookup path that stalls here; TLS still verifies api.openai.com.
const resolver = new Resolver({ timeout: 2500, tries: 2 });
const lookup = (hostname, options, done) => resolver.resolve4(hostname).then(addresses => {
  if (!addresses.length) throw Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' });
  if (options.all) done(null, addresses.map(address => ({ address, family: 4 })));
  else done(null, addresses[0], 4);
}).catch(done);

export function openAIFetch(url, options = {}) {
  if (new URL(url).origin !== 'https://api.openai.com') throw Error('Invalid OpenAI origin');
  return new Promise((resolve, reject) => {
    let connected = false;
    const request = https.request(url, { method: options.method || 'GET', headers: options.headers, signal: options.signal, lookup }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) response.destroy(Error('OpenAI response too large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode,
        json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('socket', socket => {
      connected = Boolean(socket.authorized && !socket.connecting);
      socket.once('secureConnect', () => { connected = true; });
    });
    request.on('error', error => { error.beforeRequest = !connected; reject(error); });
    request.end(options.body);
  });
}
