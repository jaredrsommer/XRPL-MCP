import { Client, Wallet } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "check-create",
    {
        title: "Create Check",
        description: "Create a Check that can be cashed by the destination account",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
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
    },
    async ({
        fromSeed,
        destination,
        sendMax,
        destinationTag,
        expiration,
        invoiceID,
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

            // Create CheckCreate transaction
            const checkCreateTx: any = {
                TransactionType: "CheckCreate",
                Account: wallet.address,
                Destination: destination,
                SendMax: formatAmount(sendMax),
            };

            // Add optional fields if provided
            if (destinationTag !== undefined) {
                checkCreateTx.DestinationTag = destinationTag;
            }

            if (expiration !== undefined) {
                checkCreateTx.Expiration = expiration;
            }

            if (invoiceID !== undefined) {
                checkCreateTx.InvoiceID = invoiceID;
            }

            if (fee) {
                checkCreateTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(checkCreateTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Extract CheckID from transaction metadata
            let checkID = null;
            if (
                status === "success" &&
                typeof result.result.meta !== "string" &&
                result.result.meta &&
                result.result.meta.AffectedNodes
            ) {
                for (const node of result.result.meta.AffectedNodes) {
                    if (
                        "CreatedNode" in node &&
                        node.CreatedNode.LedgerEntryType === "Check"
                    ) {
                        checkID = node.CreatedNode.LedgerIndex;
                        break;
                    }
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
                                account: wallet.address,
                                destination,
                                sendMax,
                                destinationTag:
                                    destinationTag || "Not specified",
                                expiration: expiration || "Not specified",
                                invoiceID: invoiceID || "Not specified",
                                checkID: checkID || "Not found in metadata",
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
                        text: `Error creating Check: ${
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
