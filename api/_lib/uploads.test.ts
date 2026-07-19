import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseClientMock } = vi.hoisted(() => ({ getSupabaseClientMock: vi.fn() }));
vi.mock('./supabase', () => ({ getSupabaseClient: getSupabaseClientMock }));

import {
  createSignedImageUrl,
  decodeBase64,
  fetchExternalImage,
  removeBucketImages,
  sha256Hex,
  sniffMimeType,
  uploadImageToBucket,
} from './uploads';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function fakeStorageBucket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://supabase.example.com/signed/x' }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

describe('sniffMimeType', () => {
  it('1. reconhece PNG, JPEG e WEBP pelos magic bytes', () => {
    expect(sniffMimeType(PNG_BYTES)).toBe('image/png');
    expect(sniffMimeType(JPEG_BYTES)).toBe('image/jpeg');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffMimeType(webp)).toBe('image/webp');
  });

  it('2. usa application/octet-stream como fallback (ex.: PDF não é imagem)', () => {
    expect(sniffMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe('application/octet-stream');
  });
});

describe('sha256Hex / decodeBase64', () => {
  it('3. sha256Hex é determinístico e hexadecimal', async () => {
    const a = await sha256Hex(PNG_BYTES);
    const b = await sha256Hex(PNG_BYTES);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('4. decodeBase64 decodifica corretamente', () => {
    expect(decodeBase64('aGVsbG8=')).toEqual(new TextEncoder().encode('hello'));
  });
});

describe('fetchExternalImage — SSRF e limites', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('5. rejeita host privado sem chamar fetch', async () => {
    const result = await fetchExternalImage('http://127.0.0.1/foto.jpg');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('6. rejeita URL inválida sem chamar fetch', async () => {
    const result = await fetchExternalImage('not a url');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('7. usa redirect: manual e rejeita respostas 3xx', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    const result = await fetchExternalImage('https://cdn.example.com/foto.jpg');
    expect(result.ok).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
  });

  it('8. rejeita imagem maior que o limite (via content-length)', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(10), { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } }),
    );
    const result = await fetchExternalImage('https://cdn.example.com/foto.jpg', { maxBytes: 1024 });
    expect(result.ok).toBe(false);
  });

  it('9. baixa com sucesso dentro do limite', async () => {
    fetchMock.mockResolvedValue(new Response(PNG_BYTES, { status: 200 }));
    const result = await fetchExternalImage('https://cdn.example.com/foto.jpg');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.length).toBe(PNG_BYTES.length);
  });

  it('10. timeout retorna erro específico', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const result = await fetchExternalImage('https://cdn.example.com/foto.jpg', { timeoutMs: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tempo limite/i);
  });
});

describe('uploadImageToBucket / createSignedImageUrl / removeBucketImages', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset();
  });

  it('11. upload com sucesso', async () => {
    const bucket = fakeStorageBucket();
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    const result = await uploadImageToBucket('a/b/c.png', PNG_BYTES, 'image/png');
    expect(result.ok).toBe(true);
    expect(bucket.upload).toHaveBeenCalledWith('a/b/c.png', PNG_BYTES, { contentType: 'image/png', upsert: false });
  });

  it('12. upload duplicado (mesmo hash já existe) não é tratado como falha', async () => {
    const bucket = fakeStorageBucket({ upload: vi.fn().mockResolvedValue({ error: { message: 'The resource already exists' } }) });
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    const result = await uploadImageToBucket('a/b/c.png', PNG_BYTES, 'image/png');
    expect(result.ok).toBe(true);
  });

  it('13. falha real de upload é reportada', async () => {
    const bucket = fakeStorageBucket({ upload: vi.fn().mockResolvedValue({ error: { message: 'quota exceeded' } }) });
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    const result = await uploadImageToBucket('a/b/c.png', PNG_BYTES, 'image/png');
    expect(result.ok).toBe(false);
  });

  it('14. createSignedImageUrl retorna a URL assinada', async () => {
    const bucket = fakeStorageBucket();
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    const url = await createSignedImageUrl('a/b/c.png');
    expect(url).toBe('https://supabase.example.com/signed/x');
  });

  it('15. removeBucketImages não chama o storage se a lista estiver vazia', async () => {
    const bucket = fakeStorageBucket();
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    await removeBucketImages([]);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('16. removeBucketImages remove os paths informados', async () => {
    const bucket = fakeStorageBucket();
    getSupabaseClientMock.mockReturnValue({ storage: { from: () => bucket } });
    await removeBucketImages(['a/b/c.png', 'a/b/d.png']);
    expect(bucket.remove).toHaveBeenCalledWith(['a/b/c.png', 'a/b/d.png']);
  });
});
