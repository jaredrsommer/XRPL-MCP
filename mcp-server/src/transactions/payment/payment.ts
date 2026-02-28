import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "payment",
    {
        title: "Send Payment",
        description: "Send a payment from one account to another on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
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
    },
    async ({
        fromSeed,
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
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;
            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet
            let wallet;
            if (fromSeed) {
                wallet = Wallet.fromSeed(fromSeed);
            } else if (connectedWallet) {
                wallet = connectedWallet;
            } else {
                throw new Error(
                    "No wallet connected. Please connect first using connect-to-xrpl tool or provide a fromSeed."
                );
            }

            // Format amount based on type
            const formatAmount = (amountObj: string | any) => {
                if (typeof amountObj === "string") {
                    // XRP amount in drops
                    return amountObj;
                } else if (amountObj.mpt_issuance_id) {
                    // MPT payment
                    return {
                        mpt_issuance_id: amountObj.mpt_issuance_id,
                        value: amountObj.value,
                    };
                } else if (amountObj.currency.toUpperCase() === "XRP") {
                    // XRP in object form - convert to drops
                    return amountObj.value;
                } else {
                    // Other issued currency
                    return {
                        currency: amountObj.currency,
                        issuer: amountObj.issuer,
                        value: amountObj.value,
                    };
                }
            };

            // Create Payment transaction
            const paymentTx: any = {
                TransactionType: "Payment",
                Account: wallet.address,
                Destination: destination,
                DeliverMax: formatAmount(amount),
            };

            // Add optional fields if provided
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

            // Submit transaction
            const prepared = await client.autofill(paymentTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Get delivered amount from metadata if available
            let deliveredAmount = null;
            if (
                typeof result.result.meta !== "string" &&
                result.result.meta &&
                result.result.meta.delivered_amount
            ) {
                deliveredAmount = result.result.meta.delivered_amount;
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                account: wallet.address,
                                destination,
                                amount,
                                sendMax: sendMax || undefined,
                                deliverMin: deliverMin || undefined,
                                deliveredAmount: deliveredAmount,
                                destinationTag: destinationTag || undefined,
                                invoiceId: invoiceId || undefined,
                                partialPayment: partialPayment || undefined,
                                noRippleDirect: noRippleDirect || undefined,
                                limitQuality: limitQuality || undefined,
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
                        text: `Error making payment: ${
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
