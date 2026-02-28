import type { CustodyProvider } from "./types.js";

/**
 * Named wallet registry. Replaces the global connectedWallet singleton.
 * Supports multiple wallets with a configurable default.
 */
export class WalletRegistry {
    private providers = new Map<string, CustodyProvider>();
    private defaultName: string | null = null;

    /** Register a custody provider under a name */
    register(name: string, provider: CustodyProvider): void {
        this.providers.set(name, provider);
        // Auto-set default to the first registered wallet
        if (this.defaultName === null) {
            this.defaultName = name;
        }
    }

    /** Unregister a wallet by name */
    unregister(name: string): boolean {
        const deleted = this.providers.delete(name);
        if (deleted && this.defaultName === name) {
            // Reset default to first remaining wallet or null
            const firstKey = this.providers.keys().next().value;
            this.defaultName = firstKey ?? null;
        }
        return deleted;
    }

    /**
     * Resolve a wallet by name.
     * If no name is given, returns the default wallet.
     * Throws if no wallet is found.
     */
    resolve(walletName?: string): CustodyProvider {
        if (walletName) {
            const provider = this.providers.get(walletName);
            if (!provider) {
                const available = this.list().map((w) => w.name).join(", ");
                throw new Error(
                    `Wallet "${walletName}" not found. Available wallets: ${available || "none"}`
                );
            }
            return provider;
        }

        if (this.defaultName) {
            const provider = this.providers.get(this.defaultName);
            if (provider) return provider;
        }

        throw new Error(
            "No wallet connected. Please connect first using connect-to-xrpl tool or register a wallet."
        );
    }

    /** Try to resolve a wallet without throwing. Returns null if not found. */
    tryResolve(walletName?: string): CustodyProvider | null {
        try {
            return this.resolve(walletName);
        } catch {
            return null;
        }
    }

    /** Set the default wallet name */
    setDefault(name: string): void {
        if (!this.providers.has(name)) {
            throw new Error(`Wallet "${name}" not found in registry.`);
        }
        this.defaultName = name;
    }

    /** Get the default wallet name */
    getDefaultName(): string | null {
        return this.defaultName;
    }

    /** List all registered wallets */
    list(): Array<{
        name: string;
        address: string;
        publicKey: string;
        type: string;
        isDefault: boolean;
    }> {
        const result: Array<{
            name: string;
            address: string;
            publicKey: string;
            type: string;
            isDefault: boolean;
        }> = [];
        for (const [name, provider] of this.providers) {
            result.push({
                name,
                address: provider.getAddress(),
                publicKey: provider.getPublicKey(),
                type: provider.type,
                isDefault: name === this.defaultName,
            });
        }
        return result;
    }

    /** Check if any wallets are registered */
    hasWallets(): boolean {
        return this.providers.size > 0;
    }

    /** Get count of registered wallets */
    get size(): number {
        return this.providers.size;
    }
}
