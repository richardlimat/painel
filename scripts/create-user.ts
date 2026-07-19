/**
 * Cria o primeiro usuário (operação administrativa única, fora do Edge
 * Runtime). A senha NUNCA é aceita como argumento de linha de comando nem é
 * logada em nenhum ponto deste script — só é lida via prompt oculto no
 * terminal (sem eco) ou pela variável de ambiente temporária
 * `NEW_USER_PASSWORD` (definida só para esta execução, nunca commitada).
 *
 * Uso:
 *   npx tsx scripts/create-user.ts --email admin@example.com --nome "Admin"
 *   (a senha será pedida de forma oculta em seguida)
 *
 * Requer SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente (ex.: `.env` local
 * carregado via `--env-file=.env`, ou exportadas na sessão do shell).
 */
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '../api/_lib/password';

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

const KEY_CODE_LF = 10;
const KEY_CODE_CR = 13;
const KEY_CODE_CTRL_C = 3;
const KEY_CODE_CTRL_D = 4;
const KEY_CODE_BACKSPACE = 8;
const KEY_CODE_DEL = 127;

/** Lê uma linha do terminal sem ecoar os caracteres digitados (senha oculta). */
async function readHiddenInput(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let input = '';

    const finish = (value: string) => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        const code = char.charCodeAt(0);
        if (code === KEY_CODE_LF || code === KEY_CODE_CR || code === KEY_CODE_CTRL_D) {
          finish(input);
          return;
        }
        if (code === KEY_CODE_CTRL_C) {
          process.stdout.write('\n');
          process.exit(1);
        }
        if (code === KEY_CODE_BACKSPACE || code === KEY_CODE_DEL) {
          input = input.slice(0, -1);
          continue;
        }
        input += char;
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.some((a) => /^--(password|senha)$/i.test(a))) {
    console.error('Não passe a senha como argumento de linha de comando — ela fica no histórico do shell/processos.');
    console.error('Rode sem esse argumento: a senha será solicitada de forma oculta no terminal.');
    process.exit(1);
  }

  const email = getArg(args, '--email');
  const nome = getArg(args, '--nome');
  if (!email || !nome) {
    console.error('Uso: npx tsx scripts/create-user.ts --email <email> --nome "<nome>"');
    process.exit(1);
  }

  const password = process.env.NEW_USER_PASSWORD ?? (await readHiddenInput('Senha do novo usuário (não será exibida): '));
  if (!password) {
    console.error('Senha vazia — abortando.');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente antes de rodar este script.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('users')
    .insert({ nome, email: email.trim().toLowerCase(), password_hash: passwordHash, ativo: true })
    .select('id, nome, email')
    .single();

  if (error) {
    console.error('Falha ao criar usuário:', error.message);
    process.exit(1);
  }

  console.log('Usuário criado com sucesso:', data);
}

main();
