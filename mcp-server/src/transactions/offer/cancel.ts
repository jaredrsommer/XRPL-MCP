import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register offer-cancel tool
server.registerTool(
    "offer-cancel",
    {
        title: "Cancel Offer",
        description: "Cancel an existing Offer (order) in the XRP Ledger's decentralized exchange",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            offerSequence: z
                .number()
                .int()
                .positive()
                .describe(
                    "The sequence number of the OfferCreate transaction that created the offer to cancel."
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
    async ({ walletName, offerSequence, fee, useTestnet }) => {
        try {
            const tx: Record<string, unknown> = {
                TransactionType: "OfferCancel",
                OfferSequence: offerSequence,
            };

            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "offer-cancel",
                summary: {
                    transactionType: "OfferCancel",
                    fromAddress: "",
                    description: `Cancel Offer with sequence ${offerSequence}`,
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
                        text: `Error cancelling Offer: ${
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
