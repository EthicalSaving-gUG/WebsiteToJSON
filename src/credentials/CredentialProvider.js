/**
 * CredentialProvider - Abstraktes Interface fuer Passwort-Manager-Integration
 * 
 * Metadaten-only: Es werden keine Passwoerter direkt gespeichert oder uebertragen.
 * Stattdessen werden nur Referenzen/Labels verwendet, um den richtigen Eintrag
 * im lokalen Passwort-Manager zu finden.
 */

/** @typedef {{ id: string, label: string, username?: string, providerType: string }} CredentialMeta */

export class CredentialProvider {
  constructor() {
    this.providerType = 'base';
    this.initialized = false;
  }

  /**
   * Initialisiert den Provider (verbindet sich mit dem Passwort-Manager)
   * @returns {Promise<boolean>}
   */
  async initialize() {
    throw new Error('Method initialize() must be implemented by subclass');
  }

  /**
   * Gibt Metadaten fuer einen Eintrag zurueck, ohne das Passwort selbst
   * @param {string} label - Bezeichnung des Eintrags (z.B. 'plesk/highspeed-cloud/account1248')
   * @returns {Promise<CredentialMeta|null>}
   */
  async getCredentialsMeta(label) {
    throw new Error('Method getCredentialMeta() must be implemented by subclass');
  }

  /**
   * Fuegt Credential-Metadaten einem Formular hinzu (Username-Feld)
   * @param {HTMLFormElement} form
   * @param {CredentialMeta} meta
   */
  async autofillForm(form, meta) {
    if (!form) return;
    
    const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"]');
    if (usernameField && meta.username) {
      usernameField.value = meta.username;
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  /**
   * Gibt den Status des Providers zurueck
   * @returns {Promise<{ connected: boolean, type: string, error?: string }>}
   */
  async getStatus() {
    return {
      connected: this.initialized,
      type: this.providerType
    };
  }
}

/** Registry fuer Provider */
const providerRegistry = {
  'manual': null,
  'keepassxc': null,
  'vaultwarden': null
};

export const registerProvider = (type, instance) => {
  if (providerRegistry.hasOwnProperty(type)) {
    providerRegistry[type] = instance;
  } else {
    throw new Error('Unknown provider type: ' + type);
  }
};

export const getProvider = (type) => providerRegistry[type];

export default CredentialProvider;
