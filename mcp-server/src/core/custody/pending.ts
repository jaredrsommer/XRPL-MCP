import crypto from "node:crypto";
import type { PendingTransaction, TransactionSummary, TransactionStatus } from "./types.js";

/**
 * In-memory store for pending transactions awaiting approval.
 * Each transaction has a UUID, TTL, and status lifecycle:
 * pending -> approved -> submitted (or rejected/expired)
 */
export class PendingTransactionStore {
    private transactions = new Map<string, PendingTransaction>();
    private defaultTtlSeconds: number;

    constructor(defaultTtlSeconds = 300) {
        this.defaultTtlSeconds = defaultTtlSeconds;
    }

    /** Store a prepared transaction as pending. Returns the pending transaction with its ID. */
    add(params: {
        transaction: Record<string, unknown>;
        summary: TransactionSummary;
        walletName: string;
        useTestnet: boolean;
        toolName: string;
        ttlSeconds?: number;
        resultExtractor?: (result: Record<string, unknown>) => Record<string, unknown>;
    }): PendingTransaction {
        const id = crypto.randomUUID();
        const ttl = params.ttlSeconds ?? this.defaultTtlSeconds;
        const now = Date.now();

        const pending: PendingTransaction = {
            id,
            transaction: params.transaction,
            summary: params.summary,
            status: "pending",
            walletName: params.walletName,
            useTestnet: params.useTestnet,
            toolName: params.toolName,
            createdAt: now,
            expiresAt: now + ttl * 1000,
            resultExtractor: params.resultExtractor,
        };

        this.transactions.set(id, pending);
        return pending;
    }

    /** Get a pending transaction by ID. Returns null if not found or expired. */
    get(id: string): PendingTransaction | null {
        const tx = this.transactions.get(id);
        if (!tx) return null;

        // Auto-expire
        if (tx.status === "pending" && Date.now() > tx.expiresAt) {
            tx.status = "expired";
        }

        return tx;
    }

    /** Mark a transaction as approved */
    approve(id: string): PendingTransaction {
        const tx = this.get(id);
        if (!tx) throw new Error(`Transaction "${id}" not found.`);
        if (tx.status !== "pending") {
            throw new Error(
                `Transaction "${id}" cannot be approved: current status is "${tx.status}".`
            );
        }
        tx.status = "approved";
        return tx;
    }

    /** Mark a transaction as submitted (after successful sign + submit) */
    markSubmitted(id: string): void {
        const tx = this.transactions.get(id);
        if (tx) tx.status = "submitted";
    }

    /** Reject a pending transaction */
    reject(id: string): PendingTransaction {
        const tx = this.get(id);
        if (!tx) throw new Error(`Transaction "${id}" not found.`);
        if (tx.status !== "pending") {
            throw new Error(
                `Transaction "${id}" cannot be rejected: current status is "${tx.status}".`
            );
        }
        tx.status = "rejected";
        return tx;
    }

    /** List all pending transactions (not expired/completed) */
    listPending(): PendingTransaction[] {
        const result: PendingTransaction[] = [];
        for (const tx of this.transactions.values()) {
            // Auto-expire check
            if (tx.status === "pending" && Date.now() > tx.expiresAt) {
                tx.status = "expired";
            }
            if (tx.status === "pending") {
                result.push(tx);
            }
        }
        return result;
    }

    /** List all transactions regardless of status */
    listAll(): PendingTransaction[] {
        // Auto-expire check on all pending
        for (const tx of this.transactions.values()) {
            if (tx.status === "pending" && Date.now() > tx.expiresAt) {
                tx.status = "expired";
            }
        }
        return Array.from(this.transactions.values());
    }

    /** Remove old completed/expired/rejected transactions */
    cleanup(maxAgeMs = 3600000): number {
        const cutoff = Date.now() - maxAgeMs;
        let removed = 0;
        for (const [id, tx] of this.transactions) {
            if (
                tx.status !== "pending" &&
                tx.status !== "approved" &&
                tx.createdAt < cutoff
            ) {
                this.transactions.delete(id);
                removed++;
            }
        }
        return removed;
    }

    get size(): number {
        return this.transactions.size;
    }
}
