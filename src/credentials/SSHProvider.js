import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, type: 'ssh' })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          password: data.password || null,
          providerType: 'ssh'
        };
      }
    } catch (e) {
      console.warn('[SSHProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.password) {
      const passwordField = form.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.value = meta.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return { ...baseStatus, details: 'SSH Provider active' };
  }
}

registerProvider('ssh', new SSHProvider());

export default SSHProvider;
