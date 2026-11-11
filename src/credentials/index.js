/**
 * Central export file for all credential providers.
 * Importing this file ensures all providers are registered via side-effects.
 */

export { CredentialProvider, registerProvider, getProvider } from './CredentialProvider.js';
export { BitwardenProvider } from './BitwardenProvider.js';
export { KeepassXCProvider } from './KeepassXCProvider.js';
export { BrowserPasswordImporter } from './BrowserPasswordImporter.js';
export { SSHProvider } from './SSHProvider.js';
