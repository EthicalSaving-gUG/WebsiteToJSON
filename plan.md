1. **Create `SSHProvider.js`**:
   - Create `src/credentials/SSHProvider.js` class extending `CredentialProvider`.
   - Implement `initialize()`, `getCredentialMeta()`, `getStatus()`.
   - Ensure it returns `username` and `password` inside `getCredentialMeta()` when returning classic SSH credentials.
   - Use `POST` endpoint if sending payload to backend or `GET` like Vaultwarden if not. For SSH, we might just need an environment check or SSH agent/key parsing. Actually, if we use Node's `ssh2` or `ssh2-promise` we can just try connecting or parsing config, but the prompt says "as in the tool especially classic SSH with user NAme and password". Let's provide a way to lookup from an SSH tool or environment. Wait, how do other providers work? They fetch from `/api/credentials/...`. We should create the `SSHProvider` to handle SSH passwords.
   - Let's read memory: "While the `CredentialProvider` base class is typically metadata-only, providers that must handle raw credentials (e.g., classic SSH with username and password) must explicitly include the `password` field in their `getCredentialMeta` return object and override `autofillForm` to inject it into form inputs."

2. **Update `src/credentials/CredentialProvider.js`**:
   - Add `'ssh': null` to `providerRegistry`.

3. **Update `src/credentials/index.js`**:
   - Export all providers including `SSHProvider` and register them via `registerProvider`.

4. **Update `mcp-server.js`**:
   - Explicitly import `src/credentials/index.js` to ensure side effects (registration) occur.
   - Add new tool to `ListToolsRequestSchema` for SSH (e.g. `get_ssh_credential` or update existing password manager tool to support SSH). Wait, prompt says: "integrate SSH & MCP Support in the password manager as in the tool especially classic SSH with user NAme and password".
   - Modify `mcp-server.js` to expose SSH credential retrieval as a tool.

5. **Pre-commit**: Complete pre-commit instructions.
6. **Submit**.
