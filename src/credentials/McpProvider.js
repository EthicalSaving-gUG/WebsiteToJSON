import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class McpProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
  }

  /**
   * Initializes the MCP Provider by checking connection status via backend
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mcp' })
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[McpProvider] Initialization failed:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Gets credential metadata
   * @param {string} label
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mcp', search: label })
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
      console.warn('[McpProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }
}

registerProvider('mcp', new McpProvider());

export default McpProvider;
