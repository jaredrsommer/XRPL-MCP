import { z } from "zod";
import { server } from "../server/server.js";
import { executor } from "../core/custody/index.js";

// Register set-regular-key tool
server.registerTool(
    "set-regular-key",
    {
        title: "Set Regular Key",
        description: "Assign, change, or remove a regular key pair for an account",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            regularKey: z
                .string()
                .optional()
                .describe(
                    "Address of the regular key to assign. If omitted, removes any existing regular key"
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { idempotentHint: true },
    },
    async ({ walletName, regularKey, fee, useTestnet }) => {
        try {
            // Create SetRegularKey transaction
            const tx: Record<string, unknown> = {
                TransactionType: "SetRegularKey",
            };

            // Add optional regularKey if provided
            if (regularKey !== undefined) {
                tx.RegularKey = regularKey;
            }

            // Add optional fee if provided
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "set-regular-key",
                summary: {
                    transactionType: "SetRegularKey",
                    fromAddress: "",
                    description: regularKey
                        ? `Set regular key to ${regularKey}`
                        : "Remove regular key",
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
                        text: `Error setting regular key: ${
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
