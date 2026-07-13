import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class ClassicSSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  /**
   * Initializes the provider
   * @returns {Promise<boolean>}
   */
  async initialize() {
    this.initialized = true;
    return true;
  }

  /**
   * Returns credential metadata including raw password for SSH
   * @param {string} label
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      // Use environment variable for flexibility, falling back to localhost for Node.js environments
      const baseUrl = typeof window === 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') : '';
      // Fetch from a dedicated endpoint for retrieving credentials, avoiding status endpoints for sensitive data
      const response = await fetch(`${baseUrl}/api/credentials/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh', label })
      });

      if (response.ok) {
        const data = await response.json();
        // SSH needs raw password for classic auth
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          password: data.password || null,
          providerType: 'ssh'
        };
      }
    } catch (e) {
      console.warn('[ClassicSSHProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Autofills form with username and password
   * Required for web-based SSH terminals based on architectural guidelines.
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
    return { ...baseStatus, details: 'SSH Provider active' };
  }
}

registerProvider('ssh', new ClassicSSHProvider());
export default ClassicSSHProvider;