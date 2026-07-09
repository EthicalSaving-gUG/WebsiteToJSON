import { CredentialProvider, registerProvider } from './CredentialProvider.js';

export class SshProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
  }

  /**
   * Initializes the SSH Provider by checking connection status via backend
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh' })
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[SshProvider] Initialization failed:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Gets credential details including raw password for classic SSH
   * @param {string} label
   * @returns {Promise<{ id: string, label: string, username?: string, password?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ssh', search: label })
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
      console.warn('[SshProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Injects username and password into a form
   * @param {HTMLFormElement} form
   * @param {object} meta
   */
  async autofillForm(form, meta) {
    if (!form) return;

    // Call super for username field
    await super.autofillForm(form, meta);

    // Inject password
    const passwordField = form.querySelector('input[type="password"], input[name*="pass"], input[name*="key"]');
    if (passwordField && meta.password) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

registerProvider('ssh', new SshProvider());

export default SshProvider;
