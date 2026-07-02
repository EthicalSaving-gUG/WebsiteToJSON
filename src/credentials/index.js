import { registerProvider } from './CredentialProvider.js';
import KeepassXCProvider from './KeepassXCProvider.js';
import BitwardenProvider from './BitwardenProvider.js';
import BrowserPasswordImporter from './BrowserPasswordImporter.js';
import SSHProvider from './SSHProvider.js';
import MCPProvider from './MCPProvider.js';

registerProvider('keepassxc', new KeepassXCProvider());
registerProvider('vaultwarden', new BitwardenProvider());
registerProvider('browser-import-chrome', new BrowserPasswordImporter('chrome'));
registerProvider('browser-import-firefox', new BrowserPasswordImporter('firefox'));
registerProvider('browser-import-edge', new BrowserPasswordImporter('edge'));
registerProvider('browser-import-brave', new BrowserPasswordImporter('brave'));
registerProvider('ssh', new SSHProvider());
registerProvider('mcp', new MCPProvider());

export { getProvider } from './CredentialProvider.js';
