import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    try {
      // In a real scenario, this would use a valid absolute API URL or local system agent.
      // Since it's run in both Node and Browser context, we should handle relative URLs for browser and absolute for Node, or just skip if no base URL
      const response = await fetch(typeof window !== 'undefined' ? '/api/credentials/status' : 'http://localhost:3000/api/credentials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh' })
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH Agent not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch(typeof window !== 'undefined' ? '/api/credentials/status' : 'http://localhost:3000/api/credentials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh', label })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          password: data.password || null, // Explicitly include password for classic SSH
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
    try {
      const res = await fetch(typeof window !== 'undefined' ? '/api/credentials/status' : 'http://localhost:3000/api/credentials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh' })
      });
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'SSH Agent reachable' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH Agent not reachable.' };
    }
    return { ...baseStatus, error: 'Initialization failed' };
  }
}

registerProvider('ssh', new SSHProvider());
export default SSHProvider;
