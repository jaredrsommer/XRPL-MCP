import { z } from "zod";
import { server } from "../../server/server.js";
import { pendingStore, executor } from "../../core/custody/index.js";

// List pending transactions awaiting approval
server.registerTool(
    "list-pending-transactions",
    {
        title: "List Pending Transactions",
        description:
            "List all transactions that are pending approval. These are transactions that have been prepared but not yet signed and submitted.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
    },
    async () => {
        try {
            const pending = pendingStore.listPending();

            const items = pending.map((tx) => ({
                id: tx.id,
                toolName: tx.toolName,
                summary: tx.summary,
                walletName: tx.walletName,
                useTestnet: tx.useTestnet,
                createdAt: new Date(tx.createdAt).toISOString(),
                expiresAt: new Date(tx.expiresAt).toISOString(),
                remainingSeconds: Math.max(
                    0,
                    Math.floor((tx.expiresAt - Date.now()) / 1000)
                ),
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                count: items.length,
                                transactions: items,
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
                        text: `Error listing pending transactions: ${
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

// Approve and submit a pending transaction
server.registerTool(
    "approve-transaction",
    {
        title: "Approve Transaction",
        description:
            "Approve a pending transaction, signing and submitting it to the XRP Ledger. This is a destructive action that sends a real transaction.",
        inputSchema: {
            transactionId: z
                .string()
                .describe(
                    "The ID of the pending transaction to approve and submit."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ transactionId }) => {
        try {
            const result = await executor.submitApproved(transactionId);

            const response: Record<string, unknown> = {
                status: result.status,
                hash: result.hash,
                network: result.network,
                networkType: result.networkType,
                result: result.result,
            };

            if (result.extractedData) {
                response.extractedData = result.extractedData;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error approving transaction: ${
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

// Reject a pending transaction
server.registerTool(
    "reject-transaction",
    {
        title: "Reject Transaction",
        description:
            "Reject a pending transaction, preventing it from being signed or submitted.",
        inputSchema: {
            transactionId: z
                .string()
                .describe("The ID of the pending transaction to reject."),
        },
    },
    async ({ transactionId }) => {
        try {
            const rejected = pendingStore.reject(transactionId);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status: "rejected",
                                transactionId: rejected.id,
                                summary: rejected.summary,
                                message: "Transaction has been rejected and will not be submitted.",
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
                        text: `Error rejecting transaction: ${
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
