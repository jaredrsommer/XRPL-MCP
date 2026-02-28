import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register oracle-delete tool
server.registerTool(
    "oracle-delete",
    {
        title: "Delete Oracle",
        description:
            "Delete an Oracle object on the XRP Ledger Price Oracle amendment is required",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            oracleDocumentID: z
                .number()
                .int()
                .positive()
                .describe("The ID of the Oracle object to delete."),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Requires Price Oracle amendment enabled network. If not provided, uses the network from the connected wallet."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({ walletName, oracleDocumentID, fee, useTestnet }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "OracleDelete",
                OracleDocumentID: oracleDocumentID,
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "oracle-delete",
                summary: {
                    transactionType: "OracleDelete",
                    fromAddress: "",
                    description: `Delete Oracle document ID ${oracleDocumentID}`,
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
                                networkType:
                                    result.pendingTransaction.networkType,
                                message: result.message,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            // Check for specific error indicating amendment not enabled
            if (
                error instanceof Error &&
                error.message.includes("Unsupported Transaction type")
            ) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error deleting Oracle: The OracleDelete transaction requires the Price Oracle amendment, which may not be enabled on the selected network. Original error: ${error.message}`,
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Error deleting Oracle: ${
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
