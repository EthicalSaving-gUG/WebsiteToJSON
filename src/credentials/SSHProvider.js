/**
 * SSHProvider - Integration for classic SSH with Username and Password
 *
 * Retrieves SSH credentials with username and password.
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
      const baseUrl = typeof window === 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
        : '';

      const response = await fetch(`${baseUrl}/api/credentials/status?type=ssh`, {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] API not reachable:', e.message);
    }
    // Set to true to allow testing/MCP usage even if status endpoint is missing
    this.initialized = true;
    return true;
  }

  /**
   * Retrieves full credential data including password for classic SSH
   * @param {string} label - Name or reference of the entry
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const baseUrl = typeof window === 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
        : '';

      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
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
   * Autofills form with both username and password for raw credentials
   * @param {HTMLFormElement} form
   * @param {{ id: string, label: string, username?: string, password?: string, providerType: string }} meta
   */
  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);

    if (meta.password && form) {
      const passwordField = form.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.value = meta.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
}

// Register the provider in the global registry
registerProvider('ssh', new SSHProvider());

export default SSHProvider;
