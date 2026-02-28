import { Wallet } from "xrpl";
import { walletRegistry } from "./custody/index.js";
import { EnvCustodyProvider } from "./custody/providers/env.js";

/**
 * Legacy state for read-only tools and the connect flow.
 *
 * connectedWallet is used by read-only tools (getAccountInfo, token/balance,
 * nft/collection, etc.) to get the wallet address for queries.
 * isConnectedToTestnet is used for default network resolution.
 * setConnectedWallet syncs into the walletRegistry for the custody system.
 *
 * Write tools use the custody system (walletRegistry + executor) directly.
 */

export let connectedWallet: Wallet | null = null;
export let isConnectedToTestnet = false;

export function setConnectedWallet(
    wallet: Wallet | null,
    isTestnet: boolean
): void {
    connectedWallet = wallet;
    isConnectedToTestnet = isTestnet;

    // Sync into the new wallet registry for forward compatibility
    if (wallet && wallet.seed) {
        try {
            const existing = walletRegistry.tryResolve("default");
            if (!existing || existing.getAddress() !== wallet.address) {
                const provider = new EnvCustodyProvider("default", wallet.seed);
                walletRegistry.register("default", provider);
            }
        } catch {
            // Ignore registration errors during legacy flow
        }
    }
}
