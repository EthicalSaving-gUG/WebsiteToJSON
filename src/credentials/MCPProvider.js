/**
 * MCPProvider - Integration fuer MCP Server Credentials
 *
 * Nutzt MCP Server fuer Zugriff auf Credentials.
 * Keine Passwoerter werden gespeichert - es werden nur Item-Referenzen genutzt.
 */

import CredentialProvider from './CredentialProvider.js';

export class MCPProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
    this.mcpAvailable = false;
  }

  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=mcp', {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        this.mcpAvailable = data.loggedIn === true;
        this.initialized = this.mcpAvailable;
        return this.initialized;
      }
    } catch (e) {
      console.warn('[MCPProvider] MCP not reachable:', e.message);
    }
    this.mcpAvailable = false;
    this.initialized = false;
    return false;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
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

  async getCredentialsMeta(label) {
    return this.getCredentialMeta(label);
  }

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
        return { ...baseStatus, details: data.details || 'MCP erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'MCP nicht erreichbar.' };
    }
    return { ...baseStatus, error: 'MCP nicht eingeloggt.' };
  }
}

export default MCPProvider;
