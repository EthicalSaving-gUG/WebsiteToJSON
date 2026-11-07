/**
 * SSHProvider - Integration for SSH Credentials
 *
 * Provides classic SSH credentials handling (username and raw password).
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  async initialize() {
    this.initialized = true;
    return this.initialized;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window === 'undefined' ? 'http://localhost:3000' : '');
      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'ssh', label: label })
      });

      if (response.ok) {
        const item = await response.json();
        return {
          id: item.id || label,
          label: item.name || label,
          username: item.username || null,
          password: item.password || null,
          providerType: 'ssh'
        };
      }
    } catch (e) {
      console.warn('[SSHProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  async autofillForm(form, meta) {
    if (!form) return;

    // Call base autofill for username
    await super.autofillForm(form, meta);

    // Autofill password since we have it
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

registerProvider('ssh', new SSHProvider());

export default SSHProvider;
