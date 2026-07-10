import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class MCPProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'mcp';
  }

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
      console.warn('[MCPProvider] MCP not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/status?type=mcp', {
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
          password: data.password || null,
          providerType: 'mcp'
        };
      }
    } catch (e) {
      console.warn('[MCPProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.password) {
      const passwordField = form.querySelector('input[type="password"], input[name*="pass"], input[name*="key"]');
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
      const res = await fetch('/api/credentials/status?type=mcp');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'MCP provider connected' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'MCP provider not reachable.' };
    }
    return { ...baseStatus, error: 'Initialization failed' };
  }
}

registerProvider('mcp', new MCPProvider());

export default MCPProvider;
