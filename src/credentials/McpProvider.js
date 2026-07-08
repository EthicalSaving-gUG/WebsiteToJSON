/**
 * McpProvider - Integration fuer MCP Server Credentials
 *
 * Behandelt MCP-Zugangsdaten (Model Context Protocol).
 */

import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class McpProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
  }

  /**
   * Initialisiert die Verbindung zum Backend
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[McpProvider] Backend not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Gibt Metadaten fuer einen Eintrag zurueck
   * @param {string} label
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/fetch?type=mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          password: data.password || null, // Optionally handle passwords for MCP
          providerType: 'mcp'
        };
      }
    } catch (e) {
      console.warn('[McpProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Autofills Formular
   * @param {HTMLFormElement} form
   * @param {{ id: string, label: string, username?: string, password?: string, providerType: string }} meta
   */
  async autofillForm(form, meta) {
    if (!form) return;

    // Autofill Username
    const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]');
    if (usernameField && meta.username) {
      usernameField.value = meta.username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Autofill Password if present
    const passwordField = form.querySelector('input[type="password"]');
    if (passwordField && meta.password) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'MCP Backend erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'MCP Backend nicht erreichbar.' };
    }
    return { ...baseStatus, error: 'Initialisierung fehlgeschlagen' };
  }
}

const instance = new McpProvider();
registerProvider('mcp', instance);
export default McpProvider;
