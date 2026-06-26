/**
 * MCPProvider - Integration for MCP Credentials
 *
 * Simulates fetching credentials from a backend API, keeping it
 * compatible with the browser environment.
 */

import CredentialProvider from './CredentialProvider.js';

export class MCPProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
  }

  async initialize() {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/credentials/status?type=mcp');
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[MCPProvider] MCP endpoint not reachable:', e.message);
    }
    // Fallback for demo
    this.initialized = true;
    return true;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('http://127.0.0.1:3000/api/credentials/items?type=mcp&search=' + encodeURIComponent(label));
      if (response.ok) {
        const items = await response.json();
        if (items.length > 0) {
          const item = items[0];
          return {
            id: item.id || `mcp-${label}`,
            label: item.name || label,
            username: item.username || 'admin',
            providerType: 'mcp'
          };
        }
      }
    } catch (e) {
      console.warn('[MCPProvider] getCredentialMeta failed:', e.message);
    }

    // Fallback demo data
    return {
      id: `mcp-${label}`,
      label: label,
      username: 'admin',
      providerType: 'mcp'
    };
  }

  async getPassword(label) {
      if (!this.initialized) return null;

      try {
        const response = await fetch('http://127.0.0.1:3000/api/credentials/password?type=mcp&search=' + encodeURIComponent(label));
        if (response.ok) {
          const data = await response.json();
          return data.password;
        }
      } catch (e) {
        console.warn('[MCPProvider] getPassword failed:', e.message);
      }

      // Fallback demo data
      return 'mcppassword123';
  }
}

export default MCPProvider;
