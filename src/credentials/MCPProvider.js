/**
 * MCPProvider - Integration fuer Model Context Protocol Credentials
 *
 * Nutzt die Backend-Schnittstelle um MCP Credentials abzurufen.
 * Es werden nur Metadaten verwendet, keine echten Passwoerter gespeichert.
 */

import { CredentialProvider } from './CredentialProvider.js';

export class MCPProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
  }

  /**
   * Prueft ob MCP Credentials API verfuegbar ist
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=mcp', {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[MCPProvider] MCP API not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Sucht ein MCP Item und gibt Metadaten zurueck
   * @param {string} label - Suchbegriff / Itemname
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      // Memory instruction: use POST request for body payload if needed,
      // but here we just use query parameters for getting items as done in BitwardenProvider
      const response = await fetch('/api/credentials/items?type=mcp&search=' + encodeURIComponent(label), {
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
            providerType: 'mcp'
          };
        }
      }
    } catch (e) {
      console.warn('[MCPProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Listet Items auf (suchen)
   * @param {string} search
   * @returns {Promise<Array<{ id: string, name: string }>>}
   */
  async listItems(search = '') {
    if (!this.initialized) return [];
    try {
      const res = await fetch('/api/credentials/items?type=mcp&search=' + encodeURIComponent(search));
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[MCPProvider] listItems failed:', e.message);
    }
    return [];
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=mcp');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'MCP API erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'MCP API nicht erreichbar.' };
    }
    return { ...baseStatus, error: 'Initialisierung fehlgeschlagen' };
  }
}

export default MCPProvider;
