/**
 * SshCredentialProvider - Provider for classic SSH with username and password
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SshCredentialProvider extends CredentialProvider {
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
      const baseUrl = typeof window === 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
        : '';

      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'ssh', search: label })
      });

      if (response.ok) {
        const data = await response.json();
        // Assume API returns the best match
        if (data && data.item) {
          return {
            id: data.item.id || label,
            label: data.item.name || label,
            username: data.item.username || null,
            password: data.item.password || null,
            providerType: 'ssh'
          };
        }
      }
    } catch (e) {
      console.warn('[SshCredentialProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);

    if (!form || !meta.password) return;

    const passwordField = form.querySelector('input[type="password"], input[name*="pass"], input[name*="pwd"]');
    if (passwordField) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return { ...baseStatus, details: 'SSH Provider ready' };
  }
}

registerProvider('ssh', new SshCredentialProvider());
export default SshCredentialProvider;
