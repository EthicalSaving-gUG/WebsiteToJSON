import { CredentialProvider } from './CredentialProvider.js';

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
          providerType: 'mcp'
        };
      }
    } catch (e) {
      console.warn('[MCPProvider] getMetaData failed:', e.message);
    }

    return null;
  }

  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.username) {
      const passwordField = form.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.placeholder = '[MCP: Bitte Passwort manuell eingeben oder Autofill im Browser nutzen]';
      }
    }
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
    return { ...baseStatus, error: 'Initialisierung fehlgeschlagen' };
  }
}

export default MCPProvider;
