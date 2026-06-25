import { CredentialProvider } from './CredentialProvider.js';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
    this.credentials = new Map();
  }

  /**
   * Initializes the provider
   * @returns {Promise<boolean>}
   */
  async initialize() {
    // Try to load SSH credentials from ~/.ssh/config or environment in a real scenario
    // For now, we mock some defaults or let them be injected
    const mockHost = process.env.SSH_MOCK_HOST || '192.168.1.1';
    const mockUser = process.env.SSH_MOCK_USER || 'root';
    const mockPass = process.env.SSH_MOCK_PASS || 'admin';

    this.addCredential(mockHost, mockUser, mockPass);
    this.initialized = true;
    return true;
  }

  /**
   * Adds an SSH credential
   * @param {string} host - The SSH host
   * @param {string} username - The SSH username
   * @param {string} password - The SSH password
   */
  addCredential(host, username, password) {
    this.credentials.set(host, { host, username, password });
  }

  /**
   * Gets credential metadata for a given label/host
   * @param {string} label - The SSH host
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    let cred = this.credentials.get(label);

    if (!cred) {
      // Try parsing if it's an ssh URL
      if (label.startsWith('ssh://')) {
        try {
          const url = new URL(label);
          cred = this.credentials.get(url.hostname);
        } catch (e) {
          // ignore
        }
      }
    }

    if (!cred) return null;

    return {
      id: label,
      label: label,
      username: cred.username,
      providerType: this.providerType
    };
  }

  /**
   * Gets the actual password for the SSH host
   * @param {string} label
   * @returns {Promise<string|null>}
   */
  async getPassword(label) {
    const meta = await this.getCredentialMeta(label);
    if (!meta) return null;

    const cred = this.credentials.get(meta.id) || this.credentials.get(meta.id.replace('ssh://', ''));
    // Since getCredentialMeta might match from URL parsing, let's just use the direct host match or URL host match

    // Better logic:
    let host = label;
    if (label.startsWith('ssh://')) {
      try {
        host = new URL(label).hostname;
      } catch(e) {}
    }

    const actualCred = this.credentials.get(host);
    return actualCred ? actualCred.password : null;
  }

  /**
   * Gets provider status
   */
  async getStatus() {
    return {
      connected: this.initialized,
      type: this.providerType,
      credentialCount: this.credentials.size
    };
  }
}

export default SSHProvider;
