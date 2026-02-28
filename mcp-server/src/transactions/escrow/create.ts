import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register escrow-create tool
server.registerTool(
    "escrow-create",
    {
        title: "Create Escrow",
        description:
            "Create an Escrow on the XRP Ledger to hold funds until a condition is met or time passes",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to hold in escrow"),
            destination: z
                .string()
                .describe("Address of the recipient of the escrowed funds"),
            destinationTag: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional arbitrary unsigned 32-bit integer tag for the destination."
                ),
            condition: z
                .string()
                .optional()
                .describe(
                    "Hex value representing a PREIMAGE-SHA-256 crypto-condition. If provided, escrow can only be finished with the preimage."
                ),
            finishAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be finished."
                ),
            cancelAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be cancelled."
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
        amount,
        destination,
        destinationTag,
        condition,
        finishAfter,
        cancelAfter,
        fee,
        useTestnet,
    }) => {
        try {
            // Ensure at least one release condition is specified
            if (!condition && !finishAfter) {
                throw new Error(
                    "Either condition or finishAfter must be specified for the escrow."
                );
            }

            const tx: Record<string, unknown> = {
                TransactionType: "EscrowCreate",
                Amount: amount,
                Destination: destination,
            };

            if (destinationTag) {
                tx.DestinationTag = destinationTag;
            }
            if (condition) {
                tx.Condition = condition;
            }
            if (finishAfter) {
                tx.FinishAfter = finishAfter;
            }
            if (cancelAfter) {
                tx.CancelAfter = cancelAfter;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "escrow-create",
                summary: {
                    transactionType: "EscrowCreate",
                    fromAddress: "",
                    toAddress: destination,
                    amount,
                    currency: "XRP (drops)",
                    description: `Create escrow of ${amount} drops to ${destination}`,
                },
                resultExtractor: (txResult) => {
                    const meta = txResult.meta as any;
                    if (!meta?.AffectedNodes) return {};
                    for (const node of meta.AffectedNodes) {
                        if (
                            "CreatedNode" in node &&
                            node.CreatedNode?.LedgerEntryType === "Escrow"
                        ) {
                            return {
                                offerSequence: (
                                    node.CreatedNode.NewFields as any
                                )?.Sequence,
                            };
                        }
                    }
                    return {};
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
                        text: `Error creating Escrow: ${
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
