import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const response = await fetch(`${baseUrl}/api/credentials/status?type=ssh`, {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('SSHProvider initialization failed:', e.message);
    }
    return false;
  }

  async getCredentialsMeta(label) {
    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ label, type: 'ssh' })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id || label,
          label: label,
          username: data.username,
          password: data.password,
          providerType: 'ssh'
        };
      }
    } catch (e) {
      console.error('Failed to retrieve SSH credentials:', e.message);
    }
    return null;
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (!form || !meta.password) return;

    const passwordField = form.querySelector('input[type="password"]');
    if (passwordField) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

registerProvider('ssh', new SSHProvider());
