export { WalletRegistry } from "./registry.js";
export { EnvCustodyProvider } from "./providers/env.js";
export { EncryptedFileCustodyProvider, createKeystore } from "./providers/encrypted-file.js";
export { loadCustodyConfig, initializeRegistry } from "./config.js";
export { PendingTransactionStore } from "./pending.js";
export { AuditLog } from "./audit.js";
export { TransactionExecutor } from "./executor.js";
export type {
    CustodyProvider,
    SignedTransaction,
    TransactionSummary,
    TransactionStatus,
    PendingTransaction,
    AuditEntry,
    CustodyConfig,
    WalletConfig,
} from "./types.js";
export type { PrepareOptions, PrepareResult, SubmitResult } from "./executor.js";

// -- Singletons --

import { WalletRegistry } from "./registry.js";
import { PendingTransactionStore } from "./pending.js";
import { AuditLog } from "./audit.js";
import { TransactionExecutor } from "./executor.js";

/** Global wallet registry singleton */
export const walletRegistry = new WalletRegistry();

/** Global pending transaction store singleton */
export const pendingStore = new PendingTransactionStore();

/** Global audit log singleton */
export const auditLog = new AuditLog();

/** Global transaction executor singleton */
export const executor = new TransactionExecutor(
    walletRegistry,
    pendingStore,
    auditLog
);
