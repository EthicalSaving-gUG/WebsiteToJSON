/**
 * SSHProvider - Integration for SSH Credentials
 *
 * Provides classic SSH credentials with username and password.
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  /**
   * Initializes the provider
   * @returns {Promise<boolean>}
   */
  async initialize() {
    this.initialized = true;
    return true;
  }

  /**
   * Retrieves credential metadata including password
   * @param {string} label - Identifier for the SSH credential (e.g. host)
   * @returns {Promise<Object|null>}
   */
  async getCredentialsMeta(label) {
    if (!this.initialized) await this.initialize();

    // Connect to backend API to retrieve the SSH credentials
    try {
      const apiUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const response = await fetch(`${apiUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'ssh', label })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: label,
          label: label,
          username: data.username,
          password: data.password,
          providerType: this.providerType
        };
      }
    } catch (e) {
      console.warn('[SSHProvider] Failed to retrieve SSH credentials:', e.message);
    }
    return null;
  }

  /**
   * Injects username and password into the form
   * @param {HTMLFormElement} form
   * @param {Object} meta
   */
  async autofillForm(form, meta) {
    if (!form) return;

    const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]');
    if (usernameField && meta.username) {
      usernameField.value = meta.username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const passwordField = form.querySelector('input[type="password"], input[name*="pass"]');
    if (passwordField && meta.password) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Returns provider status
   * @returns {Promise<{ connected: boolean, type: string }>}
   */
  async getStatus() {
    return {
      connected: this.initialized,
      type: this.providerType
    };
  }
}

// Register globally
registerProvider('ssh', new SSHProvider());
export default SSHProvider;
