import { describe, expect, it } from 'vitest';
import { isSafeExternalHost } from './ssrf';

describe('isSafeExternalHost', () => {
  it('1. aceita host público comum via http/https', () => {
    expect(isSafeExternalHost(new URL('https://cdn.example.com/foto.jpg'))).toBe(true);
    expect(isSafeExternalHost(new URL('http://cdn.example.com/foto.jpg'))).toBe(true);
  });

  it('2. rejeita esquemas diferentes de http/https', () => {
    expect(isSafeExternalHost(new URL('ftp://cdn.example.com/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('file:///etc/passwd'))).toBe(false);
  });

  it('3. rejeita localhost e domínios .local/.internal', () => {
    expect(isSafeExternalHost(new URL('http://localhost/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://x.localhost/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://service.local/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://service.internal/foto.jpg'))).toBe(false);
  });

  it('4. rejeita IPv4 privado/loopback/link-local', () => {
    expect(isSafeExternalHost(new URL('http://127.0.0.1/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://10.0.0.5/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://172.16.0.1/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://192.168.1.1/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://169.254.169.254/foto.jpg'))).toBe(false); // metadata cloud
  });

  it('5. aceita IPv4 público', () => {
    expect(isSafeExternalHost(new URL('http://8.8.8.8/foto.jpg'))).toBe(true);
  });

  it('6. rejeita IPv6 loopback/link-local/ULA', () => {
    expect(isSafeExternalHost(new URL('http://[::1]/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://[fe80::1]/foto.jpg'))).toBe(false);
    expect(isSafeExternalHost(new URL('http://[fd00::1]/foto.jpg'))).toBe(false);
  });
});
