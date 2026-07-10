import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=ssh', {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/status?type=ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
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
      const passwordField = form.querySelector('input[type="password"], input[name*="pass"], input[name*="key"]');
      if (passwordField) {
        passwordField.value = meta.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=ssh');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'SSH provider connected' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH provider not reachable.' };
    }
    return { ...baseStatus, error: 'Initialization failed' };
  }
}

registerProvider('ssh', new SSHProvider());

export default SSHProvider;
