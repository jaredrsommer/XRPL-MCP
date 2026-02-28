import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

server.registerTool(
    "check-create",
    {
        title: "Create Check",
        description: "Create a Check that can be cashed by the destination account",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            destination: z
                .string()
                .describe("The XRP Ledger address that can cash the Check"),
            sendMax: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (not needed for XRP)"),
                    value: z
                        .string()
                        .describe(
                            "Maximum amount the Check can debit from your account"
                        ),
                })
                .describe("Maximum amount the Check can debit from your account"),
            destinationTag: z
                .number()
                .optional()
                .describe(
                    "Destination tag to identify the beneficiary or purpose at the destination account"
                ),
            expiration: z
                .number()
                .optional()
                .describe(
                    "Time after which the Check expires, in seconds since the Ripple Epoch"
                ),
            invoiceID: z
                .string()
                .optional()
                .describe(
                    "Arbitrary 256-bit hash representing a specific reason or identifier for this Check"
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
    async ({
        walletName,
        destination,
        sendMax,
        destinationTag,
        expiration,
        invoiceID,
        fee,
        useTestnet,
    }) => {
        try {
            // Format amounts for the transaction
            const formatAmount = (asset: {
                currency: string;
                issuer?: string;
                value: string;
            }) => {
                if (asset.currency === "XRP") {
                    return xrpl.xrpToDrops(asset.value);
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer is required for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value,
                    };
                }
            };

            const tx: Record<string, unknown> = {
                TransactionType: "CheckCreate",
                Destination: destination,
                SendMax: formatAmount(sendMax),
            };

            if (destinationTag !== undefined) {
                tx.DestinationTag = destinationTag;
            }
            if (expiration !== undefined) {
                tx.Expiration = expiration;
            }
            if (invoiceID !== undefined) {
                tx.InvoiceID = invoiceID;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "check-create",
                summary: {
                    transactionType: "CheckCreate",
                    fromAddress: "",
                    toAddress: destination,
                    amount: sendMax.value,
                    currency: sendMax.currency,
                    description: `Create Check for ${sendMax.value} ${sendMax.currency} to ${destination}`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    let checkID = null;
                    if (meta && meta.AffectedNodes) {
                        for (const node of meta.AffectedNodes) {
                            if (
                                "CreatedNode" in node &&
                                node.CreatedNode.LedgerEntryType === "Check"
                            ) {
                                checkID = node.CreatedNode.LedgerIndex;
                                break;
                            }
                        }
                    }
                    return { checkID: checkID || "Not found in metadata" };
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
                        text: `Error creating Check: ${
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
