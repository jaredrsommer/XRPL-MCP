import { Wallet } from "xrpl";
import type { CustodyProvider, SignedTransaction } from "../types.js";

/**
 * CustodyProvider backed by a seed string (from environment variable).
 * Wraps Wallet.fromSeed() internally -- never exposes the seed.
 */
export class EnvCustodyProvider implements CustodyProvider {
    readonly name: string;
    readonly type = "env";
    private readonly wallet: Wallet;

    constructor(name: string, seed: string) {
        this.name = name;
        this.wallet = Wallet.fromSeed(seed);
    }

    getAddress(): string {
        return this.wallet.address;
    }

    getPublicKey(): string {
        return this.wallet.publicKey;
    }

    sign(preparedTx: Record<string, unknown>): SignedTransaction {
        const signed = this.wallet.sign(preparedTx as any);
        return {
            tx_blob: signed.tx_blob,
            hash: signed.hash,
        };
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }
}
