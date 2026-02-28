import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register escrow-cancel tool
server.registerTool(
    "escrow-cancel",
    {
        title: "Cancel Escrow",
        description: "Cancel an unexecuted Escrow on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            owner: z
                .string()
                .describe("Address of the account that created the escrow"),
            offerSequence: z
                .number()
                .int()
                .positive()
                .describe(
                    "Transaction sequence number of the EscrowCreate transaction that created the escrow"
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
    async ({ walletName, owner, offerSequence, fee, useTestnet }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "EscrowCancel",
                Owner: owner,
                OfferSequence: offerSequence,
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "escrow-cancel",
                summary: {
                    transactionType: "EscrowCancel",
                    fromAddress: "",
                    description: `Cancel escrow created by ${owner} with sequence ${offerSequence}`,
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
            return {
                content: [
                    {
                        type: "text",
                        text: `Error canceling Escrow: ${
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
