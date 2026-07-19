// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { useGraphStore } from './graphStore';
import { usePersonProfileStore } from './personProfileStore';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('authStore', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.setState({ user: null, status: 'checking', error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. checkSession com sessão válida define status authenticated e o usuário', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com' } }));
    await useAuthStore.getState().checkSession();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.nome).toBe('Fulano');
  });

  it('2. checkSession sem sessão (401) define status unauthenticated', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'unauthorized' }, 401));
    await useAuthStore.getState().checkSession();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('3. checkSession com falha de rede define status unauthenticated (nunca trava em checking)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await useAuthStore.getState().checkSession();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('4. login com sucesso autentica e limpa erro anterior', async () => {
    useAuthStore.setState({ error: 'erro antigo' });
    fetchMock.mockResolvedValue(jsonResponse({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com' } }));
    const ok = await useAuthStore.getState().login('a@b.com', 'senha');
    expect(ok).toBe(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('5. login com credenciais inválidas retorna false e mantém mensagem de erro', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'invalid_credentials', message: 'E-mail ou senha inválidos.' }, 401));
    const ok = await useAuthStore.getState().login('a@b.com', 'errada');
    expect(ok).toBe(false);
    expect(useAuthStore.getState().status).not.toBe('authenticated');
    expect(useAuthStore.getState().error).toBe('E-mail ou senha inválidos.');
  });

  it('6. logout chama a API, limpa graphStore/personProfileStore e volta para unauthenticated', async () => {
    useGraphStore.setState({ rootId: 'company:1', nodes: [{ id: 'x' } as never] });
    usePersonProfileStore.setState({ profilesByCpf: new Map([['11144477735', { SERVICE_RESPONSE: {} }]]) });
    useAuthStore.setState({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com' }, status: 'authenticated' });
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useGraphStore.getState().rootId).toBeNull();
    expect(usePersonProfileStore.getState().profilesByCpf.size).toBe(0);
  });

  it('7. logout limpa o estado local mesmo se a chamada de rede falhar', async () => {
    useAuthStore.setState({ user: { id: 'u1', nome: 'Fulano', email: 'a@b.com' }, status: 'authenticated' });
    fetchMock.mockRejectedValue(new Error('network down'));
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
