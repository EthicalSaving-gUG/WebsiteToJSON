/**
 * Central Barrel File for Credential Providers
 * Exporting all providers to ensure they are loaded and their explicit side-effects
 * (like global registration via registerProvider) are executed.
 */

export { CredentialProvider, getProvider, registerProvider } from './CredentialProvider.js';
export { BitwardenProvider } from './BitwardenProvider.js';
export { BrowserPasswordImporter } from './BrowserPasswordImporter.js';
export { KeepassXCProvider } from './KeepassXCProvider.js';
export { SSHProvider } from './SSHProvider.js';
