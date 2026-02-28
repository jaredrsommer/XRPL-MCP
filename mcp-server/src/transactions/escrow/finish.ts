import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register escrow-finish tool
server.registerTool(
    "escrow-finish",
    {
        title: "Finish Escrow",
        description:
            "Finish an Escrow on the XRP Ledger, releasing funds to the recipient",
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
            condition: z
                .string()
                .optional()
                .describe(
                    "Hex value matching the one supplied in EscrowCreate (if conditional escrow)."
                ),
            fulfillment: z
                .string()
                .optional()
                .describe(
                    "Hex value of the PREIMAGE-SHA-256 fulfillment matching the condition (if conditional escrow)."
                ),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),
        },
    },
    async ({
        walletName,
        owner,
        offerSequence,
        condition,
        fulfillment,
        fee,
        useTestnet,
    }) => {
        try {
            // Check if condition and fulfillment are provided together if needed
            if (condition && !fulfillment) {
                throw new Error(
                    "Fulfillment must be provided if condition is specified."
                );
            }
            if (!condition && fulfillment) {
                throw new Error(
                    "Condition must be provided if fulfillment is specified."
                );
            }

            const tx: Record<string, unknown> = {
                TransactionType: "EscrowFinish",
                Owner: owner,
                OfferSequence: offerSequence,
            };

            if (condition) {
                tx.Condition = condition;
            }
            if (fulfillment) {
                tx.Fulfillment = fulfillment;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "escrow-finish",
                summary: {
                    transactionType: "EscrowFinish",
                    fromAddress: "",
                    description: `Finish escrow created by ${owner} with sequence ${offerSequence}${condition ? " (conditional)" : ""}`,
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
                        text: `Error finishing Escrow: ${
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
