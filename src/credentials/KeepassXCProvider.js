/**
 * KeepassXCProvider - Integration fuer KeePassXC Browser Integration
 * 
 * Nutzt die lokale KeePassXC-Datenbank-Schnittstelle via Browser-Integration.
 * Keine Passwoerter werden gespeichert - nur Labels/Referenzen werden verwendet.
 * Benoetigt: KeePassXC mit aktivierter Browser-Integration.
 */

import CredentialProvider from './CredentialProvider.js';

export class KeepassXCProvider extends CredentialProvider {
  constructor() {
    super();
    this.providerType = 'keepassxc';
    this.KEEPASS_ENTRY_URL = 'keepassxc://get-totp'; // Platzhalter
  }

  /**
   * Initialisiert die Verbindung zu KeePassXC via Browser-Integration API
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      // Pruft ob KeePassXC Browser-Integration erreichbar ist
      // In der Praxis wuerde hier die KeePassXC-Browser-API genutzt
      // Dies ist eine Metadaten/Status-only Implementierung
      const response = await fetch('/api/credentials/status?type=keepassxc', {
        method: 'GET'
      });
      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (e) {
      console.warn('[KeepassXCProvider] KeePassXC not reachable:', e.message);
    }
    this.initialized = false;
    return false;
  }

  /**
   * Gibt Metadaten fuer einen Eintrag zurueck (ohne Passwort)
   * @param {string} label - Pfad im KeePassXC (z.B. 'plesk/highspeed-cloud/account1248')
   * @returns {Promise<{ id: string, label: string, username?: string, providerType: string } | null>}
   */
  async getCredentialMeta(label) {
    if (!this.initialized) return null;

    try {
      const response = await fetch('/api/credentials/status?type=keepassxc', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });

      if (response.ok) {
        const data = await response.json();
        // Nur Metadaten zurueckgeben, niemals Passwoerter
        return {
          id: data.id || label,
          label: data.label || label,
          username: data.username || null,
          providerType: 'keepassxc'
        };
      }
    } catch (e) {
      console.warn('[KeepassXCProvider] getMetaData failed:', e.message);
    }

    return null;
  }

  /**
   * Autofills Formular mit Username (kein Passwort!)
   * @param {HTMLFormElement} form
   * @param {{ id: string, label: string, username?: string, providerType: string }} meta
   */
  async autofillForm(form, meta) {
    await super.autofillForm(form, meta);
    if (meta.username) {
      const passwordField = form.querySelector('input[type="password"]');
      if (passwordField) {
        // Passwortfeld markieren, aber NICHT ausfuellen
        // Nutzer muss selbst Passwort eingeben oder KeePassXC Autofill nutzen
        passwordField.placeholder = '[KeePassXC: Bitte Passwort manuell eingeben oder Autofill im Browser nutzen]';
      }
    }
  }

  /**
   * Oeffnet KeePassXC - Eintrag im Editor fuer manuelles Kopieren
   * @param {string} label
   * @returns {Promise<boolean>}
   */
  async openEntryInApp(label) {
    // Hinweis: Echte KeePassXC-Integration erfordert eine native Bridge
    // Hier wird nur ein Deep-Link/Metadaten-Ansatz implementiert
    console.info('[KeepassXCProvider] Oeffne Eintrag:', label);
    // In Zukunft: keepassxc://open/label-encoding
    return true;
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    // Pruft ob KeePassXC Browser-Integration aktiv ist
    try {
      const res = await fetch('/api/credentials/status?type=keepassxc');
      if (res.ok) {
        const data = await res.json();
        return { ...baseStatus, details: data.details || 'KeePassXC erreichbar' };
      }
    } catch (e) {
      return { ...baseStatus, error: 'KeePassXC nicht erreichbar. Browser-Integration aktivieren.' };
    }
    return { ...baseStatus, error: 'Initialisierung fehlgeschlagen' };
  }
}

export default KeepassXCProvider;
