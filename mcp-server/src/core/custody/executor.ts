import { Client } from "xrpl";
import { getXrplClient } from "../services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../constants.js";
import { isConnectedToTestnet } from "../state.js";
import type { WalletRegistry } from "./registry.js";
import type { PendingTransactionStore } from "./pending.js";
import type { AuditLog } from "./audit.js";
import type { TransactionSummary, PendingTransaction } from "./types.js";

export interface PrepareOptions {
    walletName?: string;
    useTestnet?: boolean;
    toolName: string;
    summary: TransactionSummary;
    ttlSeconds?: number;
    /** Optional callback to extract metadata from submission result (e.g. NFToken ID) */
    resultExtractor?: (result: Record<string, unknown>) => Record<string, unknown>;
}

export interface PrepareResult {
    pendingTransaction: {
        id: string;
        summary: TransactionSummary;
        status: string;
        expiresAt: string;
        walletName: string;
        network: string;
        networkType: string;
    };
    message: string;
}

export interface SubmitResult {
    status: string;
    hash?: string;
    network: string;
    networkType: string;
    result?: Record<string, unknown>;
    extractedData?: Record<string, unknown>;
}

/**
 * Central transaction executor for the two-phase approval flow.
 *
 * Phase 1 (prepare): Builds transaction, autofills, stores as pending.
 * Phase 2 (submitApproved): Re-autofills if needed, signs via CustodyProvider, submits.
 */
export class TransactionExecutor {
    constructor(
        private registry: WalletRegistry,
        private pendingStore: PendingTransactionStore,
        private auditLog: AuditLog
    ) {}

    /**
     * Prepare a transaction for approval.
     * Autofills the transaction and stores it as pending.
     * Returns a summary for display to the user.
     */
    async prepare(
        transaction: Record<string, unknown>,
        options: PrepareOptions
    ): Promise<PrepareResult> {
        const useTestnet =
            options.useTestnet !== undefined
                ? options.useTestnet
                : isConnectedToTestnet;

        // Resolve wallet to fill Account field
        const provider = this.registry.resolve(options.walletName);
        const walletName = options.walletName || this.registry.getDefaultName() || "default";

        // Set Account if not already set
        if (!transaction.Account) {
            transaction.Account = provider.getAddress();
        }

        // Fill summary fromAddress
        options.summary.fromAddress = provider.getAddress();

        // Autofill via a temporary client connection
        let client: Client | null = null;
        let autofilled: Record<string, unknown>;
        try {
            client = await getXrplClient(useTestnet);
            autofilled = await client.autofill(transaction as any) as Record<string, unknown>;
        } finally {
            if (client) await client.disconnect();
        }

        // Update summary fee from autofilled transaction
        if (autofilled.Fee && !options.summary.fee) {
            options.summary.fee = String(autofilled.Fee);
        }

        // Store as pending
        const pending = this.pendingStore.add({
            transaction: autofilled,
            summary: options.summary,
            walletName,
            useTestnet,
            toolName: options.toolName,
            ttlSeconds: options.ttlSeconds,
            resultExtractor: options.resultExtractor,
        });

        // Audit the preparation
        this.auditLog.record({
            toolName: options.toolName,
            transactionType: String(transaction.TransactionType || "unknown"),
            walletName,
            walletAddress: provider.getAddress(),
            network: useTestnet ? "testnet" : "mainnet",
            transactionId: pending.id,
            status: "prepared",
            details: options.summary.description,
        });

        const network = useTestnet ? TESTNET_URL : MAINNET_URL;
        const networkType = useTestnet ? "testnet" : "mainnet";

        return {
            pendingTransaction: {
                id: pending.id,
                summary: pending.summary,
                status: pending.status,
                expiresAt: new Date(pending.expiresAt).toISOString(),
                walletName,
                network,
                networkType,
            },
            message: `Transaction prepared and awaiting approval. Use approve-transaction with ID "${pending.id}" to sign and submit.`,
        };
    }

    /**
     * Sign and submit an approved transaction.
     * Called after approve-transaction tool approves the pending tx.
     */
    async submitApproved(transactionId: string): Promise<SubmitResult> {
        // Approve the transaction (validates status)
        const pending = this.pendingStore.approve(transactionId);

        const provider = this.registry.resolve(pending.walletName);
        const useTestnet = pending.useTestnet;
        const network = useTestnet ? TESTNET_URL : MAINNET_URL;
        const networkType = useTestnet ? "testnet" : "mainnet";

        let client: Client | null = null;
        try {
            client = await getXrplClient(useTestnet);

            // Re-autofill to get fresh Sequence/LastLedgerSequence
            const freshTx = await client.autofill(
                pending.transaction as any
            ) as Record<string, unknown>;

            // Sign via custody provider (never touches the raw key)
            const signed = provider.sign(freshTx);

            // Submit and wait
            const result = await client.submitAndWait(signed.tx_blob);

            // Determine status
            let status = "unknown";
            if (
                typeof result.result.meta !== "string" &&
                result.result.meta
            ) {
                status =
                    (result.result.meta as any).TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Mark as submitted
            this.pendingStore.markSubmitted(transactionId);

            // Run result extractor if provided
            let extractedData: Record<string, unknown> | undefined;
            if (pending.resultExtractor) {
                try {
                    extractedData = pending.resultExtractor(
                        result.result as unknown as Record<string, unknown>
                    );
                } catch {
                    // Don't fail the submission if extraction fails
                }
            }

            // Audit the submission
            this.auditLog.record({
                toolName: pending.toolName,
                transactionType: String(
                    pending.transaction.TransactionType || "unknown"
                ),
                walletName: pending.walletName,
                walletAddress: provider.getAddress(),
                network: useTestnet ? "testnet" : "mainnet",
                transactionId,
                hash: result.result.hash,
                status,
                details: `Submitted: ${pending.summary.description}`,
            });

            return {
                status,
                hash: result.result.hash,
                network,
                networkType,
                result: result.result as unknown as Record<string, unknown>,
                extractedData,
            };
        } catch (error) {
            // Audit the failure
            this.auditLog.record({
                toolName: pending.toolName,
                transactionType: String(
                    pending.transaction.TransactionType || "unknown"
                ),
                walletName: pending.walletName,
                walletAddress: provider.getAddress(),
                network: useTestnet ? "testnet" : "mainnet",
                transactionId,
                status: "error",
                details:
                    error instanceof Error
                        ? error.message
                        : String(error),
            });
            throw error;
        } finally {
            if (client) await client.disconnect();
        }
    }

    /**
     * Batch-aware prepare: signs inner transactions and stores the assembled batch as pending.
     * Single approval for the entire batch.
     */
    async prepareBatch(params: {
        outerWalletName?: string;
        batchMode: number;
        innerTransactions: Array<{
            transaction: Record<string, unknown>;
            walletName?: string;
        }>;
        fee?: string;
        useTestnet?: boolean;
        toolName: string;
        summary: TransactionSummary;
        ttlSeconds?: number;
    }): Promise<PrepareResult> {
        const useTestnet =
            params.useTestnet !== undefined
                ? params.useTestnet
                : isConnectedToTestnet;

        const outerProvider = this.registry.resolve(params.outerWalletName);
        const outerWalletName =
            params.outerWalletName ||
            this.registry.getDefaultName() ||
            "default";

        const tfInnerBatchTxn = 0x80000000;

        let client: Client | null = null;
        try {
            client = await getXrplClient(useTestnet);

            const signedInnerTxns: any[] = [];

            for (const inner of params.innerTransactions) {
                const innerProvider = inner.walletName
                    ? this.registry.resolve(inner.walletName)
                    : outerProvider;

                const tx = { ...inner.transaction };
                tx.Flags = ((tx.Flags as number) || 0) | tfInnerBatchTxn;
                if (!tx.Account) {
                    tx.Account = innerProvider.getAddress();
                }

                const prepared = (await client.autofill(
                    tx as any
                )) as Record<string, unknown>;
                const signed = innerProvider.sign(prepared);

                signedInnerTxns.push({
                    RawTransaction: { tx_blob: signed.tx_blob },
                });
            }

            // Build outer batch transaction
            const batchTx: Record<string, unknown> = {
                TransactionType: "Batch",
                Account: outerProvider.getAddress(),
                BatchTxnMode: params.batchMode,
                RawTransactions: signedInnerTxns,
            };

            if (params.fee) batchTx.Fee = params.fee;

            // Autofill the outer batch
            const autofilled = (await client.autofill(
                batchTx as any
            )) as Record<string, unknown>;

            // Fill summary
            params.summary.fromAddress = outerProvider.getAddress();
            if (autofilled.Fee && !params.summary.fee) {
                params.summary.fee = String(autofilled.Fee);
            }

            // Store as pending
            const pending = this.pendingStore.add({
                transaction: autofilled,
                summary: params.summary,
                walletName: outerWalletName,
                useTestnet,
                toolName: params.toolName,
                ttlSeconds: params.ttlSeconds,
            });

            this.auditLog.record({
                toolName: params.toolName,
                transactionType: "Batch",
                walletName: outerWalletName,
                walletAddress: outerProvider.getAddress(),
                network: useTestnet ? "testnet" : "mainnet",
                transactionId: pending.id,
                status: "prepared",
                details: params.summary.description,
            });

            const network = useTestnet ? TESTNET_URL : MAINNET_URL;
            const networkType = useTestnet ? "testnet" : "mainnet";

            return {
                pendingTransaction: {
                    id: pending.id,
                    summary: pending.summary,
                    status: pending.status,
                    expiresAt: new Date(pending.expiresAt).toISOString(),
                    walletName: outerWalletName,
                    network,
                    networkType,
                },
                message: `Batch transaction prepared with ${params.innerTransactions.length} inner transaction(s). Use approve-transaction with ID "${pending.id}" to sign and submit.`,
            };
        } finally {
            if (client) await client.disconnect();
        }
    }
}
