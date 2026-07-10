1. **Update `providerRegistry`**: Modify `src/credentials/CredentialProvider.js` to add `'ssh'` and `'mcp'` keys to `providerRegistry`.
2. **Create `SSHProvider`**: Create `src/credentials/SSHProvider.js` that extends `CredentialProvider` with named imports. Include password field in `getCredentialsMeta`, and override `autofillForm` for classic SSH with username and password. Use POST requests for backend API calls. Register the provider at the bottom.
3. **Create `MCPProvider`**: Create `src/credentials/MCPProvider.js` following the same guidelines (named imports, POST requests, password handling, registration).
4. **Create Barrel File**: Create `src/credentials/index.js` to import and export all credential providers, executing registration side-effects.
5. **Verify Syntax**: Run `node -c` on all updated/created files to check for syntax errors.
6. **Pre-commit Checks**: Run `pre_commit_instructions` tool to ensure proper testing, verifications, reviews, and reflections are done.
7. **Submit**: Use the `submit` tool to finalize the changes.
