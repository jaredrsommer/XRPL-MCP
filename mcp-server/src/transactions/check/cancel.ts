import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register check-cancel tool
server.registerTool(
    "check-cancel",
    {
        title: "Cancel Check",
        description: "Cancel an uncashed Check on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            checkID: z
                .string()
                .describe(
                    "The ID of the Check object to cancel, as a 64-character hexadecimal string."
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, checkID, fee, useTestnet }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "CheckCancel",
                CheckID: checkID,
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "check-cancel",
                summary: {
                    transactionType: "CheckCancel",
                    fromAddress: "",
                    description: `Cancel Check ${checkID}`,
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
                        text: `Error cancelling Check: ${
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
