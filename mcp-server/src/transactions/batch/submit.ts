import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Batch mode flags
const BatchModes: Record<string, number> = {
    ALLORNOTHING: 1,
    ONLYONE: 2,
    UNTILFAILURE: 3,
};

server.registerTool(
    "batch-submit",
    {
        title: "Submit Batch",
        description: "Submit a batch of up to 8 transactions atomically on the XRP Ledger. Batch transactions allow multiple operations to succeed or fail together based on the selected batch mode.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet for the outer transaction sender. If not provided, the default wallet will be used."
                ),
            batchMode: z
                .enum(["ALLORNOTHING", "ONLYONE", "UNTILFAILURE"])
                .describe(
                    "Batch mode: ALLORNOTHING (all must succeed), ONLYONE (first success wins), or UNTILFAILURE (apply until failure)."
                ),
            rawTransactions: z
                .array(
                    z.object({
                        transactionJson: z
                            .string()
                            .describe(
                                "The raw transaction JSON as a string. The transaction must include Account and TransactionType at minimum."
                            ),
                        walletName: z
                            .string()
                            .optional()
                            .describe(
                                "Optional name of the registered wallet for signing this inner transaction. If not provided, uses the outer transaction sender's wallet."
                            ),
                    })
                )
                .min(1)
                .max(8)
                .describe(
                    "Array of inner transactions (1-8). Each transaction will be flagged as an inner batch transaction automatically."
                ),
            fee: z.string().optional().describe("Transaction fee in drops for the outer batch transaction"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({
        walletName,
        batchMode,
        rawTransactions,
        fee,
        useTestnet,
    }) => {
        try {
            // Parse inner transactions
            const innerTransactions = rawTransactions.map((raw, i) => {
                let transaction: Record<string, unknown>;
                try {
                    transaction = JSON.parse(raw.transactionJson);
                } catch {
                    throw new Error(`Invalid JSON for transaction ${i + 1}: ${raw.transactionJson}`);
                }
                return {
                    transaction,
                    walletName: raw.walletName,
                };
            });

            const result = await executor.prepareBatch({
                outerWalletName: walletName,
                batchMode: BatchModes[batchMode],
                innerTransactions,
                fee,
                useTestnet,
                toolName: "batch-submit",
                summary: {
                    transactionType: "Batch",
                    fromAddress: "",
                    description: `Batch (${batchMode}) with ${rawTransactions.length} inner transaction(s)`,
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
                                batchMode,
                                innerTransactionCount: rawTransactions.length,
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
                        text: `Error submitting batch transaction: ${
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

server.registerTool(
    "batch-payment",
    {
        title: "Batch Payment",
        description: "Submit a batch of payment transactions. This is a convenience wrapper around batch-submit for common payment batching scenarios.",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            batchMode: z
                .enum(["ALLORNOTHING", "ONLYONE", "UNTILFAILURE"])
                .optional()
                .describe(
                    "Batch mode. Defaults to ALLORNOTHING for payment batches."
                ),
            payments: z
                .array(
                    z.object({
                        destination: z.string().describe("Destination account address"),
                        amount: z.string().describe("Amount in XRP or drops"),
                        destinationTag: z.number().int().optional().describe("Optional destination tag"),
                    })
                )
                .min(1)
                .max(8)
                .describe("Array of payments to batch (1-8)"),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),
        },
        annotations: { destructiveHint: true },
    },
    async ({
        walletName,
        batchMode = "ALLORNOTHING",
        payments,
        fee,
        useTestnet,
    }) => {
        try {
            // Build inner payment transactions
            const innerTransactions = payments.map((payment) => {
                let amountDrops: string;
                if (payment.amount.includes(".") || !payment.amount.match(/^\d+$/)) {
                    amountDrops = String(Math.floor(parseFloat(payment.amount) * 1000000));
                } else {
                    amountDrops = payment.amount;
                }

                const paymentTx: Record<string, unknown> = {
                    TransactionType: "Payment",
                    Destination: payment.destination,
                    Amount: amountDrops,
                };

                if (payment.destinationTag !== undefined) {
                    paymentTx.DestinationTag = payment.destinationTag;
                }

                return { transaction: paymentTx };
            });

            const totalAmount = payments
                .map((p) => parseFloat(p.amount))
                .reduce((a, b) => a + b, 0);

            const result = await executor.prepareBatch({
                outerWalletName: walletName,
                batchMode: BatchModes[batchMode],
                innerTransactions,
                fee,
                useTestnet,
                toolName: "batch-payment",
                summary: {
                    transactionType: "Batch",
                    fromAddress: "",
                    amount: String(totalAmount),
                    currency: "XRP",
                    description: `Batch payment (${batchMode}) of ${payments.length} payment(s), total ~${totalAmount} XRP`,
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
                                batchMode,
                                paymentCount: payments.length,
                                payments: payments.map((p) => ({
                                    destination: p.destination,
                                    amount: p.amount,
                                    destinationTag: p.destinationTag,
                                })),
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
                        text: `Error submitting batch payments: ${
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
