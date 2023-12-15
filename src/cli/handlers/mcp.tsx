/**
 * MCP subcommand handlers — extracted from main.tsx for lazy loading.
 * These are dynamically imported only when the corresponding `claude mcp *` command runs.
 */

import { stat } from 'fs/promises';
import pMap from 'p-map';
import { cwd } from 'process';
import React from 'react';
import { MCPServerDesktopImportDialog } from '../../components/MCPServerDesktopImportDialog.js';
import { Box, render, Text, type Root } from '../../ink.js';
import { KeybindingSetup } from '../../keybindings/KeybindingProviderSetup.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../../services/analytics/index.js';
import { clearMcpClientConfig, clearServerTokensFromLocalStorage, getMcpClientConfig, readClientSecret, saveMcpClientSecret } from '../../services/mcp/auth.js';
import { connectToServer, getMcpServerConnectionBatchSize } from '../../services/mcp/client.js';
import { addMcpConfig, getAllMcpConfigs, getMcpConfigByName, getMcpConfigsByScope, removeMcpConfig } from '../../services/mcp/config.js';
import type { ConfigScope, ScopedMcpServerConfig } from '../../services/mcp/types.js';
import { describeMcpConfigFilePath, ensureConfigScope, getScopeLabel } from '../../services/mcp/utils.js';
import { AppStateProvider } from '../../state/AppState.js';
import { getCurrentProjectConfig, getGlobalConfig, saveCurrentProjectConfig } from '../../utils/config.js';
import { isFsInaccessible } from '../../utils/errors.js';
import { gracefulShutdown } from '../../utils/gracefulShutdown.js';
import { safeParseJSON } from '../../utils/json.js';
import { getPlatform } from '../../utils/platform.js';
import { cliError, cliOk } from '../exit.js';
async function checkMcpServerHealth(name: string, server: ScopedMcpServerConfig): Promise<string> {
  try {
    const result = await connectToServer(name, server);
    if (result.type === 'connected') {
      return '✓ Connected';
    } else if (result.type === 'needs-auth') {
      return '! Needs authentication';
    } else {
      return '✗ Failed to connect';
    }
  } catch (_error) {
    return '✗ Connection error';
  }
}

// mcp serve (lines 4512–4532)
export async function mcpServeHandler({
  debug,
  verbose
}: {
  debug?: boolean;
  verbose?: boolean;
}): Promise<void> {
  const providedCwd = cwd();
  logEvent('tengu_mcp_start', {});
  try {
    await stat(providedCwd);
  } catch (error) {
    if (isFsInaccessible(error)) {
      cliError(`Error: Directory ${providedCwd} does not exist`);
    }
    throw error;
  }
  try {
    const {
      setup
    } = await import('../../setup.js');
    await setup(providedCwd, 'default', false, false, undefined, false);
    const {
      startMCPServer
    } = await import('../../entrypoints/mcp.js');
    await startMCPServer(providedCwd, debug ?? false, verbose ?? false);
  } catch (error) {
    cliError(`Error: Failed to start MCP server: ${error}`);
  }
}

// mcp remove (lines 4545–4635)
export async function mcpRemoveHandler(root: Root, name: string, options: {
  scope?: string;
}): Promise<void> {
  // Look up config before removing so we can clean up secure storage
  const serverBeforeRemoval = getMcpConfigByName(name);
  const cleanupSecureStorage = () => {
    if (serverBeforeRemoval && (serverBeforeRemoval.type === 'sse' || serverBeforeRemoval.type === 'http')) {
      clearServerTokensFromLocalStorage(name, serverBeforeRemoval);
      clearMcpClientConfig(name, serverBeforeRemoval);
    }
  };
  let removedScope: ReturnType<typeof ensureConfigScope> | undefined;
  try {
    if (options.scope) {
      const scope = ensureConfigScope(options.scope);
      logEvent('tengu_mcp_delete', {
        name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      });
      await removeMcpConfig(name, scope);
      cleanupSecureStorage();
      removedScope = scope;
    } else {
      // If no scope specified, check where the server exists
      const projectConfig = getCurrentProjectConfig();
      const globalConfig = getGlobalConfig();

      // Check if server exists in project scope (.mcp.json)
      const {
        servers: projectServers
      } = getMcpConfigsByScope('project');
      const mcpJsonExists = !!projectServers[name];

      // Count how many scopes contain this server
      const scopes: Array<Exclude<ConfigScope, 'dynamic'>> = [];
      if (projectConfig.mcpServers?.[name]) scopes.push('local');
      if (mcpJsonExists) scopes.push('project');
      if (globalConfig.mcpServers?.[name]) scopes.push('user');
      if (scopes.length === 0) {
        const configuredNames = Array.from(new Set([
          ...Object.keys(projectConfig.mcpServers ?? {}),
          ...Object.keys(projectServers),
          ...Object.keys(globalConfig.mcpServers ?? {}),
        ])).sort()
        return cliError(
          configuredNames.length > 0
            ? `No MCP server found with name: "${name}". Configured servers: ${configuredNames.join(', ')}`
            : `No MCP server found with name: "${name}". No MCP servers are configured.`,
        );
      } else if (scopes.length === 1) {
        // Server exists in only one scope, remove it
        const scope = scopes[0]!;
        logEvent('tengu_mcp_delete', {
          name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
        });
        await removeMcpConfig(name, scope);
        cleanupSecureStorage();
        removedScope = scope;
      } else {
        // Server exists in multiple scopes
        process.stderr.write(`MCP server "${name}" exists in multiple scopes:\n`);
        scopes.forEach(scope => {
          process.stderr.write(`  - ${getScopeLabel(scope)} (${describeMcpConfigFilePath(scope)})\n`);
        });
        process.stderr.write('\nTo remove from a specific scope, use:\n');
        scopes.forEach(scope => {
          process.stderr.write(`  claude mcp remove "${name}" -s ${scope}\n`);
        });
        return cliError();
      }
    }
  } catch (error) {
    return cliError((error as Error).message);
  }

  const displayName = options.scope ? name : `"${name}"`;
  root.render(<>
      <Box flexDirection="column">
        <Text>Removed MCP server {displayName} from {removedScope} config</Text>
        <Text>File modified: {describeMcpConfigFilePath(removedScope!)}</Text>
      </Box>
    </>);
  await root.waitUntilExit();
}

type McpHealthResult = {
  name: string;
  server: ScopedMcpServerConfig;
  status: string;
};

function formatMcpHealthResult({
  name,
  server,
  status,
}: McpHealthResult): string | null {
  if (server.type === 'sse') return `${name}: ${server.url} (SSE) - ${status}`;
  if (server.type === 'http') return `${name}: ${server.url} (HTTP) - ${status}`;
  if (server.type === 'claudeai-proxy') return `${name}: ${server.url} - ${status}`;
  if (!server.type || server.type === 'stdio') {
    const args = Array.isArray(server.args) ? server.args : [];
    return `${name}: ${server.command} ${args.join(' ')} - ${status}`;
  }
  return null;
}

function McpHealthResults({ promise }: { promise: Promise<McpHealthResult[]> }) {
  const results = React.use(promise);
  return <><Text>{results.map(formatMcpHealthResult).filter(isNotNull).join('\n')}</Text></>;
}

function isNotNull(value: string | null): value is string {
  return value !== null;
}

// mcp list (lines 4641–4688)
export async function mcpListHandler(root: Root): Promise<void> {
  logEvent('tengu_mcp_list', {});
  const {
    servers: configs
  } = await getAllMcpConfigs();
  if (Object.keys(configs).length === 0) {
    root.render(<><Text>No MCP servers configured. Use `claude mcp add` to add a server.</Text></>);
    await root.waitUntilExit();
    await gracefulShutdown(0);
    return;
  }

  const promise = pMap(Object.entries(configs), async ([name, server]) => ({
    name,
    server,
    status: await checkMcpServerHealth(name, server),
  }), {
    concurrency: getMcpServerConnectionBatchSize(),
  });
  root.render(<React.Suspense fallback={<Text>Checking MCP server health…{'\n\n'}</Text>}>
      <McpHealthResults promise={promise} />
    </React.Suspense>);
  await root.waitUntilExit();
  // Use gracefulShutdown to properly clean up MCP server connections
  // (process.exit bypasses cleanup handlers, leaving child processes orphaned)
  await gracefulShutdown(0);
}

// mcp get (lines 4694–4786)
export async function mcpGetHandler(root: Root, name: string): Promise<void> {
  logEvent('tengu_mcp_get', {
    name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  });
  const server = getMcpConfigByName(name);
  if (!server) {
    const { servers } = await getAllMcpConfigs();
    const configuredNames = Object.keys(servers).sort();
    return cliError(
      configuredNames.length > 0
        ? `No MCP server found with name: "${name}". Configured servers: ${configuredNames.join(', ')}`
        : `No MCP server found with name: "${name}". No MCP servers are configured.`,
    );
  }

  // Check server health
  const status = await checkMcpServerHealth(name, server);
  const lines = [
    `${name}:`,
    `  Scope: ${getScopeLabel(server.scope)}`,
    `  Status: ${status}`,
  ];

  // Intentionally excluding sse-ide servers here since they're internal
  if (server.type === 'sse') {
    lines.push('  Type: sse');
    lines.push(`  URL: ${server.url}`);
    if (server.headers) {
      lines.push('  Headers:');
      for (const [key, value] of Object.entries(server.headers)) {
        lines.push(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts: string[] = [];
      if (server.oauth.clientId) {
        parts.push('client_id configured');
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push('client_secret configured');
      }
      if (server.oauth.callbackPort) parts.push(`callback_port ${server.oauth.callbackPort}`);
      lines.push(`  OAuth: ${parts.join(', ')}`);
    }
  } else if (server.type === 'http') {
    lines.push('  Type: http');
    lines.push(`  URL: ${server.url}`);
    if (server.headers) {
      lines.push('  Headers:');
      for (const [key, value] of Object.entries(server.headers)) {
        lines.push(`    ${key}: ${value}`);
      }
    }
    if (server.oauth?.clientId || server.oauth?.callbackPort) {
      const parts: string[] = [];
      if (server.oauth.clientId) {
        parts.push('client_id configured');
        const clientConfig = getMcpClientConfig(name, server);
        if (clientConfig?.clientSecret) parts.push('client_secret configured');
      }
      if (server.oauth.callbackPort) parts.push(`callback_port ${server.oauth.callbackPort}`);
      lines.push(`  OAuth: ${parts.join(', ')}`);
    }
  } else if (server.type === 'stdio') {
    lines.push('  Type: stdio');
    lines.push(`  Command: ${server.command}`);
    const args = Array.isArray(server.args) ? server.args : [];
    lines.push(`  Args: ${args.join(' ')}`);
    if (server.env) {
      lines.push('  Environment:');
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`    ${key}=${value}`);
      }
    }
  }
  lines.push('');
  lines.push(`To remove this server, run: claude mcp remove "${name}" -s ${server.scope}`);
  root.render(<><Text>{lines.join('\n')}</Text></>);
  await root.waitUntilExit();
  // Use gracefulShutdown to properly clean up MCP server connections
  // (process.exit bypasses cleanup handlers, leaving child processes orphaned)
  await gracefulShutdown(0);
}

// mcp add-json (lines 4801–4870)
export async function mcpAddJsonHandler(root: Root, name: string, json: string, options: {
  scope?: string;
  clientSecret?: true;
}): Promise<void> {
  let scope: ReturnType<typeof ensureConfigScope> | undefined;
  let transportType: string | undefined;
  try {
    scope = ensureConfigScope(options.scope);
    const parsedJson = safeParseJSON(json);

    // Read secret before writing config so cancellation doesn't leave partial state
    const needsSecret = options.clientSecret && parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson && (parsedJson.type === 'sse' || parsedJson.type === 'http') && 'url' in parsedJson && typeof parsedJson.url === 'string' && 'oauth' in parsedJson && parsedJson.oauth && typeof parsedJson.oauth === 'object' && 'clientId' in parsedJson.oauth;
    const clientSecret = needsSecret ? await readClientSecret() : undefined;
    await addMcpConfig(name, parsedJson, scope);
    transportType = parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson ? String(parsedJson.type || 'stdio') : 'stdio';
    if (clientSecret && parsedJson && typeof parsedJson === 'object' && 'type' in parsedJson && (parsedJson.type === 'sse' || parsedJson.type === 'http') && 'url' in parsedJson && typeof parsedJson.url === 'string') {
      saveMcpClientSecret(name, {
        type: parsedJson.type,
        url: parsedJson.url
      }, clientSecret);
    }
    logEvent('tengu_mcp_add', {
      scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'json' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      type: transportType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    });
  } catch (error) {
    return cliError((error as Error).message);
  }
  root.render(<><Text>Added {transportType} MCP server {name} to {scope} config</Text></>);
  await root.waitUntilExit();
}

// mcp add-from-claude-desktop (lines 4881–4927)
export async function mcpAddFromDesktopHandler(options: {
  scope?: string;
}): Promise<void> {
  try {
    const scope = ensureConfigScope(options.scope);
    const platform = getPlatform();
    logEvent('tengu_mcp_add', {
      scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      platform: platform as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'desktop' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    });
    const {
      readClaudeDesktopMcpServers
    } = await import('../../utils/claudeDesktop.js');
    const servers = await readClaudeDesktopMcpServers();
    if (Object.keys(servers).length === 0) {
      cliOk('No MCP servers found in Claude Desktop configuration or configuration file does not exist.');
    }
    const {
      unmount
    } = await render(<AppStateProvider>
        <KeybindingSetup>
          <MCPServerDesktopImportDialog servers={servers} scope={scope} onDone={() => {
          unmount();
        }} />
        </KeybindingSetup>
      </AppStateProvider>, {
      exitOnCtrlC: true
    });
  } catch (error) {
    cliError((error as Error).message);
  }
}

// mcp reset-project-choices (lines 4935–4952)
export async function mcpResetChoicesHandler(root: Root): Promise<void> {
  logEvent('tengu_mcp_reset_mcpjson_choices', {});
  saveCurrentProjectConfig(current => ({
    ...current,
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    enableAllProjectMcpServers: false
  }));
  root.render(<>
      <Box flexDirection="column">
        <Text>All project-scoped (.mcp.json) server approvals and rejections have been reset.</Text>
        <Text>You will be prompted for approval next time you start Claude Code.</Text>
      </Box>
    </>);
  await root.waitUntilExit();
}
