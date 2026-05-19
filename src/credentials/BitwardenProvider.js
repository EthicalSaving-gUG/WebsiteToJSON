/**
 * BitwardenProvider (Vaultwarden) - Integration fuer Bitwarden/Vaultwarden CLI
 * 
 * Nutzt die Bitwarden CLI (bw) fuer sicheren Zugriff auf Credentials.
 * Keine Passwoerter werden gespeichert - es werden nur Item-Referenzen genutzt.
 * Benoetigt: Bitwarden CLI installiert und eingeloggt (bw login).
 */

import CredentialProvider from './CredentialProvider.js';

export class BitwardenProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'vaultwarden';
    this.bwAvailable = false;
  }

  /**
   * Prueft ob die Bitwarden CLI verfuegbar ist
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const response = await fetch('/api/credentials/status?type=vaultwarden', {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        this.bwAvailable = data.loggedIn === true;
        this.initialized = this.bwAvailable;
        return this.initialized;
      }
    } catch (e) {
      console.warn('[BitwardenProvider] Vaultwarden not reachable:', e.message);
    }
    this.bwAvailable = false;
    this.initialized = false;
    return false;
  }

  /**
   * Sucht ein Item in Bitwarden und gibt Metadaten zurueck
   * @param {string} label - Suchbegriff / Itemname
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/items?type=vaultwarden&search=' + encodeURIComponent(label), {
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
            providerType: 'vaultwarden'
          };
        }
      }
    } catch (e) {
      console.warn('[BitwardenProvider] getCredentialMeta failed:', e.message);
    }

    return null;
  }

  /**
   * Listet Items auf (suchen)
   * @param {string} search
   * @returns {Promise<Array<{ id: string, name: string }>>}
   */
  async listItems(search = '') {
    if (!this.initialized) return [];
    try {
      const res = await fetch('/api/credentials/items?type=vaultwarden&search=' + encodeURIComponent(search));
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('[BitwardenProvider] listItems failed:', e.message);
    }
    return [];
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    try {
      const res = await fetch('/api/credentials/status?type=vaultwarden');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'Vaultwarden erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'Vaultwarden nicht erreichbar. bw CLI pruefen.' };
    }
    return { ...baseStatus, error: 'BW nicht eingeloggt. Mit bw login einloggen.' };
  }
}

export default BitwardenProvider;
