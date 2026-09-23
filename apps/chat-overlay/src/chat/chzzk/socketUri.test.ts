import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const socketUrl = require('socket.io-client/lib/url');
const engineRequire = createRequire(require.resolve('engine.io-client'));
const parseUri = engineRequire('parseuri');

describe('Socket.IO 2 URI compatibility', () => {
  it.each([
    ['https://chat.example.test/session?auth=a%2Bb', 'https', 'chat.example.test', '443', '/session', 'auth=a%2Bb'],
    ['wss://chat.example.test:8443/?auth=a', 'wss', 'chat.example.test', '8443', '/', 'auth=a'],
    ['http://127.0.0.1:8080/chat', 'http', '127.0.0.1', '8080', '/chat', ''],
    ['ws://[::1]:3000/chat', 'ws', '::1', '3000', '/chat', ''],
    ['https://chat.example.test:443/', 'https', 'chat.example.test', '443', '/', ''],
  ])('retains connection fields for %s', (input, protocol, host, port, path, query) => {
    expect(socketUrl(input)).toMatchObject({ protocol, host, port, path, query });
  });

  it('keeps the Engine.IO hostname-only option', () => {
    expect(parseUri('localhost:8080')).toMatchObject({ host: 'localhost', port: '8080', protocol: '' });
  });

  it('uses the replacement in both consumers', () => {
    const socketRequire = createRequire(require.resolve('socket.io-client'));
    expect(socketRequire.resolve('parseuri')).toBe(engineRequire.resolve('parseuri'));
    expect(engineRequire('parseuri/package.json').name).toBe('@karmo/socketio2-uri');
  });

  it('parses a long path without the legacy backtracking expression', () => {
    const path = '/' + 'a/'.repeat(25000);
    expect(socketUrl('https://chat.example.test' + path).path).toBe(path);
  }, 1000);

  it('connects with the existing EIO 3 transport and preserves authentication query data', async () => {
    let firstUrl: URL | undefined;
    const server = createServer((request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      if (!url.searchParams.has('sid')) {
        firstUrl = url;
        const open = '0' + JSON.stringify({ sid: 'uri-test', upgrades: [], pingInterval: 25000, pingTimeout: 20000 });
        response.end(`${open.length}:${open}2:40`);
      } else {
        response.end(request.method === 'POST' ? 'ok' : '1:6');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const socket = require('socket.io-client')(`http://127.0.0.1:${address.port}/?auth=a%2Bb`, {
      transports: ['polling'], reconnection: false, timeout: 2000,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        socket.once('connect_timeout', () => reject(new Error('transport timeout')));
      });
      expect(firstUrl?.pathname).toBe('/socket.io/');
      expect(firstUrl?.searchParams.get('EIO')).toBe('3');
      expect(firstUrl?.searchParams.get('auth')).toBe('a+b');
    } finally {
      socket.disconnect();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
