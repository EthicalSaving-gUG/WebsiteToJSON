/**
 * SSHProvider - Integration for Classic SSH Credentials
 *
 * Provides explicit username and password for classic SSH authentication.
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
    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const response = await fetch(`${baseUrl}/api/credentials/status?type=ssh`, {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH provider not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Returns credential metadata including the raw password for classic SSH
   * @param {string} label - Label for the credential
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
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
          password: data.password || null, // Explicitly return password for SSH
          providerType: 'ssh'
        };
      }
    } catch (e) {
      console.warn('[SSHProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Autofills form with username and password
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
    try {
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      const res = await fetch(`${baseUrl}/api/credentials/status?type=ssh`);
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'SSH provider available' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH provider not reachable.' };
    }
    return { ...baseStatus, error: 'Initialization failed' };
  }
}

registerProvider('ssh', new SSHProvider());

export default SSHProvider;
