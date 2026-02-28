import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Format amount based on type (XRP drops, MPT, or issued currency)
const formatAmount = (amountObj: string | any) => {
    if (typeof amountObj === "string") {
        return amountObj;
    } else if (amountObj.mpt_issuance_id) {
        return {
            mpt_issuance_id: amountObj.mpt_issuance_id,
            value: amountObj.value,
        };
    } else if (amountObj.currency.toUpperCase() === "XRP") {
        return amountObj.value;
    } else {
        return {
            currency: amountObj.currency,
            issuer: amountObj.issuer,
            value: amountObj.value,
        };
    }
};

server.registerTool(
    "payment",
    {
        title: "Send Payment",
        description: "Send a payment from one account to another on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            destination: z
                .string()
                .describe("Address of the account to receive the payment"),
            amount: z
                .union([
                    z.string().describe("Amount of XRP to send (in drops)"),
                    z
                        .object({
                            currency: z.string().describe("Currency code"),
                            issuer: z
                                .string()
                                .optional()
                                .describe(
                                    "Issuer account address (not needed for XRP)"
                                ),
                            value: z.string().describe("Amount to send"),
                            mpt_issuance_id: z
                                .string()
                                .optional()
                                .describe("MPT issuance ID for MPT payments"),
                        })
                        .describe("Amount to deliver"),
                ])
                .describe("Amount to deliver to the destination"),
            sendMax: z
                .union([
                    z.string().describe("Maximum amount of XRP to send (in drops)"),
                    z.object({
                        currency: z.string().describe("Currency code"),
                        issuer: z
                            .string()
                            .optional()
                            .describe(
                                "Issuer account address (not needed for XRP)"
                            ),
                        value: z.string().describe("Maximum amount to send"),
                        mpt_issuance_id: z
                            .string()
                            .optional()
                            .describe("MPT issuance ID for MPT payments"),
                    }),
                ])
                .optional()
                .describe("Maximum amount of source currency to use"),
            deliverMin: z
                .union([
                    z
                        .string()
                        .describe("Minimum amount of XRP to deliver (in drops)"),
                    z.object({
                        currency: z.string().describe("Currency code"),
                        issuer: z
                            .string()
                            .optional()
                            .describe(
                                "Issuer account address (not needed for XRP)"
                            ),
                        value: z.string().describe("Minimum amount to deliver"),
                        mpt_issuance_id: z
                            .string()
                            .optional()
                            .describe("MPT issuance ID for MPT payments"),
                    }),
                ])
                .optional()
                .describe("Minimum amount to deliver for partial payments"),
            destinationTag: z
                .number()
                .optional()
                .describe("Destination tag to identify the reason for payment"),
            invoiceId: z
                .string()
                .optional()
                .describe(
                    "Arbitrary 256-bit hash representing a specific reason for the payment"
                ),
            paths: z
                .array(z.array(z.any()))
                .optional()
                .describe("Array of payment paths to use for this transaction"),
            credentialIDs: z
                .array(z.string())
                .optional()
                .describe("Set of Credentials to authorize a deposit"),
            partialPayment: z
                .boolean()
                .optional()
                .describe(
                    "Allow partial payments - deliver less than the full amount"
                ),
            noRippleDirect: z
                .boolean()
                .optional()
                .describe("Do not use the default path; only use paths included"),
            limitQuality: z
                .boolean()
                .optional()
                .describe(
                    "Only take paths with an input:output ratio equal/better than Amount:SendMax"
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
        amount,
        sendMax,
        deliverMin,
        destinationTag,
        invoiceId,
        paths,
        credentialIDs,
        partialPayment,
        noRippleDirect,
        limitQuality,
        fee,
        useTestnet,
    }) => {
        try {
            // Validate payment type rules
            if (typeof amount === "string" && typeof sendMax === "string") {
                throw new Error(
                    "Cannot use both XRP for amount and sendMax in a direct XRP payment"
                );
            }

            if (paths && typeof amount === "string" && !sendMax) {
                throw new Error(
                    "Paths should not be specified for direct XRP payments"
                );
            }

            // Create Payment transaction
            const paymentTx: Record<string, unknown> = {
                TransactionType: "Payment",
                Destination: destination,
                DeliverMax: formatAmount(amount),
            };

            if (sendMax !== undefined) {
                paymentTx.SendMax = formatAmount(sendMax);
            }

            if (deliverMin !== undefined) {
                paymentTx.DeliverMin = formatAmount(deliverMin);
            }

            if (destinationTag !== undefined) {
                paymentTx.DestinationTag = destinationTag;
            }

            if (invoiceId !== undefined) {
                paymentTx.InvoiceID = invoiceId;
            }

            if (paths !== undefined) {
                paymentTx.Paths = paths;
            }

            if (credentialIDs !== undefined && credentialIDs.length > 0) {
                paymentTx.CredentialIDs = credentialIDs;
            }

            // Set flags
            let flags = 0;
            if (partialPayment === true) {
                flags |= 0x00020000; // tfPartialPayment
            }
            if (noRippleDirect === true) {
                flags |= 0x00010000; // tfNoRippleDirect
            }
            if (limitQuality === true) {
                flags |= 0x00040000; // tfLimitQuality
            }
            if (flags !== 0) {
                paymentTx.Flags = flags;
            }

            if (fee) {
                paymentTx.Fee = fee;
            }

            // Build description
            const amountStr =
                typeof amount === "string"
                    ? `${amount} drops`
                    : amount.mpt_issuance_id
                      ? `${amount.value} MPT`
                      : `${amount.value} ${amount.currency}`;

            const result = await executor.prepare(paymentTx, {
                walletName,
                useTestnet,
                toolName: "payment",
                summary: {
                    transactionType: "Payment",
                    fromAddress: "",
                    toAddress: destination,
                    amount: typeof amount === "string" ? amount : amount.value,
                    currency:
                        typeof amount === "string"
                            ? "XRP (drops)"
                            : amount.currency || "MPT",
                    description: `Payment of ${amountStr} to ${destination}`,
                },
                resultExtractor: (result) => {
                    const meta = result.meta as any;
                    if (!meta) return {};
                    return {
                        deliveredAmount: meta.delivered_amount ?? null,
                    };
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
                        text: `Error making payment: ${
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
