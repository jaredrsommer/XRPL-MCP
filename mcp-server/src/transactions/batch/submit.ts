import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Batch mode flags
const BatchModes = {
    ALLORNOTHING: 1,  // All transactions must succeed or none are applied
    ONLYONE: 2,       // Only the first successful transaction is applied
    UNTILFAILURE: 3,  // Apply transactions until one fails
};

// Inner transaction flag
const tfInnerBatchTxn = 0x80000000;

server.registerTool(
    "batch-submit",
    {
        title: "Submit Batch",
        description: "Submit a batch of up to 8 transactions atomically on the XRP Ledger. Batch transactions allow multiple operations to succeed or fail together based on the selected batch mode.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the outer transaction sender's wallet. If not provided, the connected wallet will be used."
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
                        signerSeed: z
                            .string()
                            .optional()
                            .describe(
                                "Optional seed for signing this inner transaction. If not provided, uses the outer transaction sender's wallet."
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
    },
    async ({
        fromSeed,
        batchMode,
        rawTransactions,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let outerWallet: Wallet;
            if (fromSeed) {
                outerWallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                outerWallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Process and sign inner transactions
            const signedInnerTxns: any[] = [];
            const batchSigners: any[] = [];
            const accountsUsed = new Set<string>();

            for (let i = 0; i < rawTransactions.length; i++) {
                const { transactionJson, signerSeed } = rawTransactions[i];

                // Parse the transaction JSON
                let innerTx: any;
                try {
                    innerTx = JSON.parse(transactionJson);
                } catch {
                    throw new Error(`Invalid JSON for transaction ${i + 1}: ${transactionJson}`);
                }

                // Add inner batch transaction flag
                innerTx.Flags = (innerTx.Flags || 0) | tfInnerBatchTxn;

                // Determine the signer for this inner transaction
                let innerWallet: Wallet;
                if (signerSeed) {
                    innerWallet = Wallet.fromSeed(signerSeed);
                } else {
                    innerWallet = outerWallet;
                }

                // Ensure Account matches signer
                if (!innerTx.Account) {
                    innerTx.Account = innerWallet.address;
                }

                // Autofill sequence and other fields
                const prepared = await client.autofill(innerTx);

                // Sign the inner transaction
                const signed = innerWallet.sign(prepared);

                signedInnerTxns.push({
                    RawTransaction: {
                        tx_blob: signed.tx_blob,
                    },
                });

                // Track accounts for BatchSigners
                if (!accountsUsed.has(innerWallet.address)) {
                    accountsUsed.add(innerWallet.address);
                    batchSigners.push({
                        BatchSigner: {
                            Account: innerWallet.address,
                            SigningPubKey: innerWallet.publicKey,
                            TxnSignature: signed.hash, // This will be replaced by actual signature in blob
                        },
                    });
                }
            }

            // Create the outer Batch transaction
            const batchTx: any = {
                TransactionType: "Batch",
                Account: outerWallet.address,
                BatchTxnMode: BatchModes[batchMode],
                RawTransactions: signedInnerTxns,
            };

            if (fee) batchTx.Fee = fee;

            // Autofill and sign the batch transaction
            const preparedBatch = await client.autofill(batchTx);
            const signedBatch = outerWallet.sign(preparedBatch);
            const result = await client.submitAndWait(signedBatch.tx_blob);

            let status = "unknown";
            let innerResults: any[] = [];

            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                // Extract inner transaction results if available
                const meta = result.result.meta as any;
                if (meta.batch_executions) {
                    innerResults = meta.batch_executions;
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                batchMode,
                                outerAccount: outerWallet.address,
                                innerTransactionCount: rawTransactions.length,
                                innerResults,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
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
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);

server.registerTool(
    "batch-payment",
    {
        title: "Batch Payment",
        description: "Submit a batch of payment transactions. This is a convenience wrapper around batch-submit for common payment batching scenarios.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the sender's wallet. If not provided, the connected wallet will be used."
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
    },
    async ({
        fromSeed,
        batchMode = "ALLORNOTHING",
        payments,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            let wallet: Wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Build inner payment transactions
            const innerTxns: any[] = [];

            for (const payment of payments) {
                // Convert XRP to drops if needed
                let amountDrops: string;
                if (payment.amount.includes(".") || !payment.amount.match(/^\d+$/)) {
                    // Assume it's XRP, convert to drops
                    amountDrops = String(Math.floor(parseFloat(payment.amount) * 1000000));
                } else {
                    amountDrops = payment.amount;
                }

                const paymentTx: any = {
                    TransactionType: "Payment",
                    Account: wallet.address,
                    Destination: payment.destination,
                    Amount: amountDrops,
                    Flags: tfInnerBatchTxn,
                };

                if (payment.destinationTag !== undefined) {
                    paymentTx.DestinationTag = payment.destinationTag;
                }

                // Autofill and sign
                const prepared = await client.autofill(paymentTx);
                const signed = wallet.sign(prepared);

                innerTxns.push({
                    RawTransaction: {
                        tx_blob: signed.tx_blob,
                    },
                });
            }

            // Create batch transaction
            const batchTx: any = {
                TransactionType: "Batch",
                Account: wallet.address,
                BatchTxnMode: BatchModes[batchMode],
                RawTransactions: innerTxns,
            };

            if (fee) batchTx.Fee = fee;

            const preparedBatch = await client.autofill(batchTx);
            const signedBatch = wallet.sign(preparedBatch);
            const result = await client.submitAndWait(signedBatch.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                batchMode,
                                sender: wallet.address,
                                paymentCount: payments.length,
                                payments: payments.map((p) => ({
                                    destination: p.destination,
                                    amount: p.amount,
                                    destinationTag: p.destinationTag,
                                })),
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                result: result.result,
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
        } finally {
            if (client) {
                await client.disconnect();
            }
        }
    }
);
