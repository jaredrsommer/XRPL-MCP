import { Client, Wallet, CheckCash } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register check-cash tool
server.registerTool(
    "check-cash",
    {
        title: "Cash Check",
        description: "Cash a Check to receive funds from it",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
                ),
            checkID: z
                .string()
                .describe(
                    "The ID of the Check ledger object to cash, as a 64-character hexadecimal string"
                ),
            amount: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (not needed for XRP)"),
                    value: z.string().describe("Amount to cash"),
                })
                .optional()
                .describe(
                    "Amount to cash. Required for Checks with a sendMax, or to cash a lesser amount"
                ),
            deliverMin: z
                .object({
                    currency: z.string().describe("Currency code"),
                    issuer: z
                        .string()
                        .optional()
                        .describe("Issuer address (not needed for XRP)"),
                    value: z.string().describe("Minimum amount to receive"),
                })
                .optional()
                .describe(
                    "Minimum amount to receive. Required for Checks with an amount"
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
    async ({ fromSeed, checkID, amount, deliverMin, fee, useTestnet }) => {
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
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value,
                    };
                }
            };

            // Create CheckCash transaction
            const checkCashTx: any = {
                TransactionType: "CheckCash",
                Account: wallet.address,
                CheckID: checkID,
            };

            // Add either Amount or DeliverMin - one is required but not both
            if (amount) {
                checkCashTx.Amount = formatAmount(amount);
            } else if (deliverMin) {
                checkCashTx.DeliverMin = formatAmount(deliverMin);
            } else {
                throw new Error(
                    "Either amount or deliverMin must be provided to cash a Check"
                );
            }

            // Add optional fee if provided
            if (fee) {
                checkCashTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(checkCashTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

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
                                account: wallet.address,
                                checkID,
                                amount: amount || "Not specified",
                                deliverMin: deliverMin || "Not specified",
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
                        text: `Error cashing Check: ${
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
