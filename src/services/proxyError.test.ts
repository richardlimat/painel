import { describe, expect, it } from 'vitest';
import { readNeutralErrorMessage } from './proxyError';

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('readNeutralErrorMessage', () => {
  it('devolve a mensagem quando o corpo já é um envelope neutro { code, message, id }', async () => {
    const res = jsonResponse({ code: 'rate_limited', message: 'Limite de requisições atingido.', id: 'abcd1234' });
    expect(await readNeutralErrorMessage(res)).toBe('Limite de requisições atingido.');
  });

  it('nunca repassa texto cru quando o corpo não é JSON (ex.: página HTML de erro)', async () => {
    const res = new Response('<html><body>upstream error at fontedata.com, saldo insuficiente</body></html>', {
      status: 502,
    });
    const message = await readNeutralErrorMessage(res);
    expect(message).not.toMatch(/fontedata|saldo|html/i);
  });

  it('cai no fallback genérico quando o corpo é JSON mas sem campo "message" string', async () => {
    const res = jsonResponse({ code: 'unknown' });
    const message = await readNeutralErrorMessage(res);
    expect(message).toBe('Não foi possível concluir a operação. Tente novamente em instantes.');
  });

  it('cai no fallback quando "message" não é string (nunca faz JSON.stringify de um objeto cru)', async () => {
    const res = jsonResponse({ message: { detalheTecnico: 'chave sk_live_ABC123 na fontedata.com' } });
    const message = await readNeutralErrorMessage(res);
    expect(message).not.toMatch(/fontedata|sk_live/i);
    expect(message).toBe('Não foi possível concluir a operação. Tente novamente em instantes.');
  });

  it('formatos de corpo que NÃO seguem o envelope {message: string} nunca vazam fornecedor/saldo/crédito/chave/endpoint — só o fallback genérico', async () => {
    // Nenhum destes tem um campo "message" string no nível esperado — a função
    // nunca tenta "adivinhar" outros campos (mensagem/erro/error/corpo bruto).
    const cases = [
      jsonResponse({ error: 'Chave de API inválida para o endpoint https://api.apifull.com.br' }),
      jsonResponse({ mensagem: 'saldo insuficiente' }),
      new Response('Internal error: créditos esgotados no fornecedor APIFull', { status: 500 }),
    ];
    for (const res of cases) {
      const message = await readNeutralErrorMessage(res);
      expect(message).not.toMatch(/fontedata|apifull|saldo|cr[ée]dito|chave de api|endpoint|fornecedor/i);
      expect(message).toBe('Não foi possível concluir a operação. Tente novamente em instantes.');
    }
  });
});
