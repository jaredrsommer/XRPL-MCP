import { Client, Wallet, xrpToDrops, Amount, AMMCreate } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "amm-create",
    {
        title: "Create AMM",
        description: "Create a new Automated Market Maker (AMM) on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
                ),
            asset1: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the first asset"),
                    issuer: z
                        .string()
                        .optional()
                        .describe(
                            "Issuer address of the first asset (not needed for XRP)"
                        ),
                    value: z
                        .string()
                        .describe("Amount of the first asset to deposit"),
                })
                .describe("First asset to deposit in the AMM's pool"),
            asset2: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the second asset"),
                    issuer: z
                        .string()
                        .optional()
                        .describe(
                            "Issuer address of the second asset (not needed for XRP)"
                        ),
                    value: z
                        .string()
                        .describe("Amount of the second asset to deposit"),
                })
                .describe("Second asset to deposit in the AMM's pool"),
            tradingFee: z
                .number()
                .min(0)
                .max(1000)
                .optional()
                .describe("Trading fee in basis points (0-1000, where 100 = 1%)"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
    },
    async ({ fromSeed, asset1, asset2, tradingFee, fee, useTestnet }) => {
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
            }): Amount => {
                if (asset.currency === "XRP") {
                    return xrpToDrops(asset.value);
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer must be provided for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value,
                    };
                }
            };

            // Create AMMCreate transaction with explicit typing
            const ammCreateTx: AMMCreate = {
                TransactionType: "AMMCreate",
                Account: wallet.address,
                Amount: formatAmount(asset1),
                Amount2: formatAmount(asset2),
                TradingFee: tradingFee !== undefined ? tradingFee : 0,
            };

            if (fee) {
                ammCreateTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(ammCreateTx);
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
                                asset1,
                                asset2,
                                tradingFee:
                                    tradingFee !== undefined
                                        ? tradingFee
                                        : "Default (0)",
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
                        text: `Error creating AMM: ${
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
