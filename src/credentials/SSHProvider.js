/**
 * SSHProvider - Integration for SSH Credentials
 *
 * Simulates fetching credentials from a backend API, keeping it
 * compatible with the browser environment.
 */

import CredentialProvider from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/credentials/status?type=ssh');
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH endpoint not reachable:', e.message);
    }
    // For demo/testing without a real backend, we can fallback to true
    this.initialized = true;
    return true;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('http://127.0.0.1:3000/api/credentials/items?type=ssh&search=' + encodeURIComponent(label));
      if (response.ok) {
        const items = await response.json();
        if (items.length > 0) {
          const item = items[0];
          return {
            id: item.id || `ssh-${label}`,
            label: item.name || label,
            username: item.username || 'root',
            providerType: 'ssh'
          };
        }
      }
    } catch (e) {
      console.warn('[SSHProvider] getCredentialMeta failed:', e.message);
    }

    // Fallback demo data
    return {
      id: `ssh-${label}`,
      label: label,
      username: 'root',
      providerType: 'ssh'
    };
  }

  async getPassword(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('http://127.0.0.1:3000/api/credentials/password?type=ssh&search=' + encodeURIComponent(label));
      if (response.ok) {
        const data = await response.json();
        return data.password;
      }
    } catch (e) {
      console.warn('[SSHProvider] getPassword failed:', e.message);
    }

    // Fallback demo data
    return 'password123';
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.username) {
      const passwordField = form.querySelector('input[type="password"]');
      if (passwordField) {
        const pass = await this.getPassword(meta.label);
        if (pass) {
            passwordField.value = pass;
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            passwordField.placeholder = '[SSH: Use SSH Key or manual password]';
        }
      }
    }
  }
}

export default SSHProvider;
