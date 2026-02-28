import type { CustodyConfig, WalletConfig } from "./types.js";
import { WalletRegistry } from "./registry.js";
import { EnvCustodyProvider } from "./providers/env.js";
import { EncryptedFileCustodyProvider } from "./providers/encrypted-file.js";

/**
 * Load custody configuration from environment variables.
 *
 * Tier 1: Single XRPL_SEED env var (backward compatible)
 * Tier 2: XRPL_WALLET_{NAME}_SEED env vars for multiple wallets
 * Tier 3: .xrpl-mcp.json config file (future)
 */
export function loadCustodyConfig(): CustodyConfig {
    const wallets: Record<string, WalletConfig> = {};
    let defaultWallet: string | undefined;

    // Tier 2: Check for XRPL_WALLET_{NAME}_SEED pattern
    const walletPrefix = "XRPL_WALLET_";
    const walletSuffix = "_SEED";
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(walletPrefix) && key.endsWith(walletSuffix) && value) {
            const name = key
                .slice(walletPrefix.length, -walletSuffix.length)
                .toLowerCase();
            wallets[name] = { type: "env", seed: value };
        }
    }

    // Tier 1: Fallback to single XRPL_SEED if no named wallets found
    if (Object.keys(wallets).length === 0 && process.env.XRPL_SEED) {
        wallets["default"] = { type: "env", seed: process.env.XRPL_SEED };
    }

    // Check for explicit default wallet setting
    if (process.env.XRPL_DEFAULT_WALLET) {
        defaultWallet = process.env.XRPL_DEFAULT_WALLET.toLowerCase();
    }

    // Approval settings
    const ttlSeconds = process.env.XRPL_APPROVAL_TTL
        ? parseInt(process.env.XRPL_APPROVAL_TTL, 10)
        : 300;
    const approvalRequired = process.env.XRPL_APPROVAL_REQUIRED !== "false";

    return {
        defaultWallet,
        approval: {
            required: approvalRequired,
            ttlSeconds,
        },
        wallets,
    };
}

/**
 * Initialize the wallet registry from a custody config.
 * Creates CustodyProvider instances and registers them.
 */
export function initializeRegistry(
    config: CustodyConfig,
    registry: WalletRegistry
): void {
    for (const [name, walletConfig] of Object.entries(config.wallets)) {
        if (walletConfig.type === "env") {
            const seed = walletConfig.seed || (walletConfig.seedEnvVar
                ? process.env[walletConfig.seedEnvVar]
                : undefined);
            if (!seed) {
                console.error(
                    `Skipping wallet "${name}": no seed found`
                );
                continue;
            }
            try {
                const provider = new EnvCustodyProvider(name, seed);
                registry.register(name, provider);
                console.error(
                    `Registered wallet "${name}" (${provider.getAddress()})`
                );
            } catch (error) {
                console.error(
                    `Failed to register wallet "${name}": ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
        if (walletConfig.type === "encrypted-file") {
            const keystorePath = walletConfig.keystorePath;
            if (!keystorePath) {
                console.error(
                    `Skipping wallet "${name}": no keystorePath configured`
                );
                continue;
            }
            const password = process.env.XRPL_KEYSTORE_PASSWORD;
            if (!password) {
                console.error(
                    `Skipping wallet "${name}": XRPL_KEYSTORE_PASSWORD env var not set`
                );
                continue;
            }
            try {
                const provider = new EncryptedFileCustodyProvider(
                    name,
                    keystorePath,
                    password
                );
                registry.register(name, provider);
                console.error(
                    `Registered encrypted wallet "${name}" (${provider.getAddress()})`
                );
            } catch (error) {
                console.error(
                    `Failed to register encrypted wallet "${name}": ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }
    }

    // Set explicit default if configured
    if (config.defaultWallet && registry.hasWallets()) {
        try {
            registry.setDefault(config.defaultWallet);
        } catch {
            console.error(
                `Default wallet "${config.defaultWallet}" not found in registry, using first registered wallet`
            );
        }
    }
}
