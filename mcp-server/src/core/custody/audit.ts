import type { AuditEntry } from "./types.js";

/**
 * In-memory audit log for all signing and transaction operations.
 * Also logs to stderr for persistence in MCP server logs.
 */
export class AuditLog {
    private entries: AuditEntry[] = [];
    private maxEntries: number;

    constructor(maxEntries = 1000) {
        this.maxEntries = maxEntries;
    }

    /** Record an audit event */
    record(entry: Omit<AuditEntry, "timestamp">): void {
        const fullEntry: AuditEntry = {
            ...entry,
            timestamp: new Date().toISOString(),
        };

        this.entries.push(fullEntry);

        // Trim old entries if over limit
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }

        // Also log to stderr for external persistence
        console.error(
            `[AUDIT] ${fullEntry.timestamp} | ${fullEntry.toolName} | ${fullEntry.transactionType} | wallet=${fullEntry.walletName} (${fullEntry.walletAddress}) | network=${fullEntry.network} | status=${fullEntry.status}${fullEntry.hash ? ` | hash=${fullEntry.hash}` : ""}${fullEntry.details ? ` | ${fullEntry.details}` : ""}`
        );
    }

    /** Get recent audit entries, optionally filtered */
    getEntries(options?: {
        limit?: number;
        walletName?: string;
        toolName?: string;
        network?: "testnet" | "mainnet";
    }): AuditEntry[] {
        let filtered = this.entries;

        if (options?.walletName) {
            filtered = filtered.filter(
                (e) => e.walletName === options.walletName
            );
        }
        if (options?.toolName) {
            filtered = filtered.filter(
                (e) => e.toolName === options.toolName
            );
        }
        if (options?.network) {
            filtered = filtered.filter(
                (e) => e.network === options.network
            );
        }

        const limit = options?.limit ?? 50;
        return filtered.slice(-limit);
    }

    /** Get total number of entries */
    get size(): number {
        return this.entries.length;
    }

    /** Clear all entries */
    clear(): void {
        this.entries = [];
    }
}
