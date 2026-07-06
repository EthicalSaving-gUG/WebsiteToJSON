/**
 * SSHProvider - Integration fuer SSH Credentials
 *
 * Nutzt die Backend-Schnittstelle um SSH Credentials abzurufen.
 * Es werden nur Metadaten verwendet (z.B. user name), keine echten Passwoerter gespeichert.
 */

import { CredentialProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  /**
   * Prueft ob SSH Credentials API verfuegbar ist
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=ssh', {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SSHProvider] SSH API not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Sucht ein SSH Item und gibt Metadaten inkl. Passwort zurueck
   * @param {string} label - Suchbegriff / Itemname
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      // Memory instruction: use POST request for body payload if needed,
      // but here we just use query parameters for getting items as done in BitwardenProvider
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

  /**
   * Autofills Formular with username and password
   * @param {HTMLFormElement} form
   * @param {Object} meta
   */
  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.password) {
      const passwordField = form.querySelector('input[type="password"], input[name*="pass"]');
      if (passwordField) {
        passwordField.value = meta.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  /**
   * Listet Items auf (suchen)
   * @param {string} search
   * @returns {Promise<Array<{ id: string, name: string }>>}
   */
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
        return { ...baseStatus, details: data.details || 'SSH API erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'SSH API nicht erreichbar.' };
    }
    return { ...baseStatus, error: 'Initialisierung fehlgeschlagen' };
  }
}

export default SSHProvider;
