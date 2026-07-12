import { CredentialProvider, registerProvider } from './CredentialProvider.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export class SSHProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'ssh';
    this.credentialsPath = path.join(os.homedir(), '.ssh', 'ssh_credentials.json');
    this.credentials = new Map();
  }

  async initialize() {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const data = fs.readFileSync(this.credentialsPath, 'utf8');
        const parsed = JSON.parse(data);
        for (const [key, value] of Object.entries(parsed)) {
          this.credentials.set(key, value);
        }
      }
      this.initialized = true;
      return true;
    } catch (e) {
      console.warn('[SSHProvider] Failed to initialize:', e.message);
      this.initialized = false;
      return false;
    }
  }

  async getCredentialMeta(label) {
    if (!this.initialized) await this.initialize();

    if (this.credentials.has(label)) {
      const cred = this.credentials.get(label);
      return {
        id: `ssh-${label}`,
        label: label,
        username: cred.username,
        password: cred.password,
        providerType: 'ssh'
      };
    }
    return null;
  }

  async getCredentialsMeta(label) {
    return this.getCredentialMeta(label);
  }

  async autofillForm(form, meta) {
    if (!form) return;

    const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]');
    if (usernameField && meta.username) {
      usernameField.value = meta.username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const passwordField = form.querySelector('input[type="password"], input[name*="pass"]');
    if (passwordField && meta.password) {
      passwordField.value = meta.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

registerProvider('ssh', new SSHProvider());
