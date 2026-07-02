/**
 * SSHProvider - Integration fuer SSH Credentials
 *
 * Nutzt klassische SSH Verbindungen mit Username und Password.
 * Keine Passwoerter werden gespeichert - es werden nur Item-Referenzen genutzt.
 */

import CredentialProvider from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
    this.sshAvailable = false;
  }

  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=ssh', {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        this.sshAvailable = data.loggedIn === true;
        this.initialized = this.sshAvailable;
        return this.initialized;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH not reachable:', e.message);
    }
    this.sshAvailable = false;
    this.initialized = false;
    return false;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/items?type=ssh&search=' + encodeURIComponent(label), {
        method: 'GET'
      });

      if (response.ok) {
        const items = await response.json();
        if (items.length > 0) {
          const item = items[0];
          return {
            id: item.id || label,
            label: item.name || label,
            username: item.username || null,
            password: item.password || null,
            providerType: 'ssh'
          };
        }
      }
    } catch (e) {
      console.warn('[SSHProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  async getCredentialsMeta(label) {
    return this.getCredentialMeta(label);
  }

  async listItems(search = '') {
    if (!this.initialized) return [];
    try {
      const res = await fetch('/api/credentials/items?type=ssh&search=' + encodeURIComponent(search));
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[SSHProvider] listItems failed:', e.message);
    }
    return [];
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=ssh');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'SSH erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH nicht erreichbar.' };
    }
    return { ...baseStatus, error: 'SSH nicht eingeloggt.' };
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
}

export default SSHProvider;
