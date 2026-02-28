/**
 * Core types for the custody system.
 * CustodyProvider never exposes the seed/private key.
 */

export interface SignedTransaction {
    tx_blob: string;
    hash: string;
}

export interface CustodyProvider {
    /** Human-readable name for this provider */
    readonly name: string;

    /** Provider type identifier (e.g. "env", "encrypted-file") */
    readonly type: string;

    /** Get the classic address for this wallet */
    getAddress(): string;

    /** Get the public key for this wallet */
    getPublicKey(): string;

    /** Sign a prepared transaction (never exposes the private key) */
    sign(preparedTx: Record<string, unknown>): SignedTransaction;

    /** Check if this provider is available and can sign */
    isAvailable(): Promise<boolean>;
}

export type TransactionStatus =
    | "pending"
    | "approved"
    | "submitted"
    | "rejected"
    | "expired";

export interface TransactionSummary {
    transactionType: string;
    fromAddress: string;
    toAddress?: string;
    amount?: string;
    currency?: string;
    fee?: string;
    description: string;
}

export interface PendingTransaction {
    id: string;
    transaction: Record<string, unknown>;
    summary: TransactionSummary;
    status: TransactionStatus;
    walletName: string;
    useTestnet: boolean;
    toolName: string;
    createdAt: number;
    expiresAt: number;
    /** Optional callback to extract metadata from submission result */
    resultExtractor?: (result: Record<string, unknown>) => Record<string, unknown>;
}

export interface AuditEntry {
    timestamp: string;
    toolName: string;
    transactionType: string;
    walletName: string;
    walletAddress: string;
    network: "testnet" | "mainnet";
    transactionId?: string;
    hash?: string;
    status: string;
    details?: string;
}

export interface CustodyConfig {
    defaultWallet?: string;
    approval: {
        required: boolean;
        ttlSeconds: number;
    };
    wallets: Record<string, WalletConfig>;
}

export interface WalletConfig {
    type: "env" | "encrypted-file";
    seedEnvVar?: string;
    seed?: string;
    keystorePath?: string;
}
