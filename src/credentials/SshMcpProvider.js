/**
 * SshMcpProvider - Integration for SSH & MCP
 *
 * Retrieves credentials including raw passwords for classic SSH login using MCP.
 * Implements a full auto-fill to inject both username and password into forms.
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SshMcpProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh-mcp';
  }

  /**
   * Initializes the SSH MCP connection.
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=ssh-mcp', {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SshMcpProvider] SSH-MCP endpoint not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Retrieves full credential data including the raw password.
   * @param {string} label - The label or identifier for the credential entry.
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh-mcp', label })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          password: data.password || null, // Explicitly include password for classic SSH
          providerType: 'ssh-mcp'
        };
      }
    } catch (e) {
      console.warn('[SshMcpProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Autofills form with both Username and Password.
   * @param {HTMLFormElement} form
   * @param {{ id: string, label: string, username?: string, password?: string, providerType: string }} meta
   */
  async autofillForm(form, meta) {
    // Fill in username using base implementation
    await super.autofillForm(form, meta);

    // Fill in password
    if (form && meta.password) {
      const passwordField = form.querySelector('input[type="password"], input[name*="pass"], input[name*="key"]');
      if (passwordField) {
        passwordField.value = meta.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  /**
   * Gets the status of the SSH MCP provider.
   * @returns {Promise<{ connected: boolean, type: string, error?: string, details?: string }>}
   */
  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=ssh-mcp');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'SSH-MCP reachable' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH-MCP not reachable.' };
    }
    return { ...baseStatus, error: 'Initialization failed' };
  }
}

const instance = new SshMcpProvider();
registerProvider('ssh-mcp', instance);

export default SshMcpProvider;
