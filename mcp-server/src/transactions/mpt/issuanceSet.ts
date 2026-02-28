import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// MPTokenIssuanceSet flags
const MPTokenIssuanceSetFlags = {
    tfMPTLock: 0x0001,    // Lock the MPT issuance (prevent further minting)
    tfMPTUnlock: 0x0002,  // Unlock the MPT issuance
};

server.registerTool(
    "mpt-issuance-set",
    {
        title: "Set MPT Issuance",
        description: "Modify the properties of an existing Multi-Purpose Token (MPT) issuance. Can lock/unlock the issuance or update holder authorization.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT to modify (64-character hex string)."
                ),
            holder: z
                .string()
                .optional()
                .describe(
                    "Optional: The account address of the holder to authorize/unauthorize. Required when using the authorization flags."
                ),
            lock: z
                .boolean()
                .optional()
                .describe(
                    "If true, lock the MPT issuance (prevent further minting). If false, unlock it."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { idempotentHint: true },
    },
    async ({
        walletName,
        mptIssuanceID,
        holder,
        lock,
        fee,
        useTestnet,
    }) => {
        try {
            // Build transaction
            const tx: Record<string, unknown> = {
                TransactionType: "MPTokenIssuanceSet",
                MPTokenIssuanceID: mptIssuanceID,
            };

            // Set flags
            if (lock !== undefined) {
                tx.Flags = lock
                    ? MPTokenIssuanceSetFlags.tfMPTLock
                    : MPTokenIssuanceSetFlags.tfMPTUnlock;
            }

            if (holder) {
                tx.Holder = holder;
            }

            if (fee) tx.Fee = fee;

            const action = lock !== undefined
                ? (lock ? "lock" : "unlock")
                : "modify";

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "mpt-issuance-set",
                summary: {
                    transactionType: "MPTokenIssuanceSet",
                    fromAddress: "",
                    description: `${action} MPT issuance ${mptIssuanceID}${holder ? ` for holder ${holder}` : ""}`,
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "pending_approval",
                                transactionId: result.pendingTransaction.id,
                                summary: result.pendingTransaction.summary,
                                expiresAt: result.pendingTransaction.expiresAt,
                                network: result.pendingTransaction.network,
                                networkType: result.pendingTransaction.networkType,
                                message: result.message,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error modifying MPT issuance: ${
                            error instanceof Error
                                ? error.message
                                : String(error)
                        }`,
                    },
                ],
            };
        }
    }
);
