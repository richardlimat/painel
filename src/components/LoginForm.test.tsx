// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm';
import { useAuthStore } from '../store/authStore';

describe('LoginForm', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'unauthenticated', error: null });
  });
  afterEach(() => cleanup());

  it('1. senha começa oculta (type=password) e o olho alterna para texto', () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');
    fireEvent.click(screen.getByLabelText('Mostrar senha'));
    expect(passwordInput.type).toBe('text');
    fireEvent.click(screen.getByLabelText('Ocultar senha'));
    expect(passwordInput.type).toBe('password');
  });

  it('2. submeter o formulário chama login com email/senha', async () => {
    const loginSpy = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({ login: loginSpy });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'minhasenha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await Promise.resolve();
    expect(loginSpy).toHaveBeenCalledWith('a@b.com', 'minhasenha');
  });

  it('3. exibe mensagem de erro vinda do authStore', () => {
    useAuthStore.setState({ error: 'E-mail ou senha inválidos.' });
    render(<LoginForm />);
    expect(screen.getByText('E-mail ou senha inválidos.')).toBeInTheDocument();
  });
});
