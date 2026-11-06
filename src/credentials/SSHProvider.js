/**
 * SSHProvider - Integration for Classic SSH Credentials
 *
 * Retrieves sensitive credentials (username and password) via dedicated backend endpoints.
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  /**
   * Initializes the SSH Provider
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const baseUrl = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : (typeof window === 'undefined' ? 'http://localhost:3000' : '');

      const response = await fetch(`${baseUrl}/api/credentials/status?type=ssh`, {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] Status endpoint not reachable:', e.message);
    }

    // Fallback: Just mark as initialized for now assuming it's available
    this.initialized = true;
    return true;
  }

  /**
   * Returns credential metadata including the raw password if found
   * @param {string} label - The identifier or path for the credential
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const baseUrl = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : (typeof window === 'undefined' ? 'http://localhost:3000' : '');

      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'ssh', label })
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

  /**
   * Autofills form with both username and password
   * @param {HTMLFormElement} form
   * @param {{ id: string, label: string, username?: string, password?: string, providerType: string }} meta
   */
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
    return { ...baseStatus, details: 'SSH Provider initialized' };
  }
}

// Explicit global registration
registerProvider('ssh', new SSHProvider());

export default SSHProvider;
