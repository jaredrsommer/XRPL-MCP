import { Client, XrplError, Wallet } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Define asset type
type Asset = {
    currency: string;
    issuer?: string;
    value?: string;
};

// Define the transaction type for AMMDeposit
type AMMDepositTransaction = {
    TransactionType: "AMMDeposit";
    Account: string;
    Asset: {
        currency: string;
        issuer?: string;
    };
    Asset2: {
        currency: string;
        issuer?: string;
    };
    Amount?:
        | string
        | {
              currency: string;
              issuer?: string;
              value: string;
          };
    Amount2?:
        | string
        | {
              currency: string;
              issuer?: string;
              value: string;
          };
    LPTokenOut?: {
        currency: string;
        issuer: string;
        value: string;
    };
    Flags?: number;
    Fee?: string;
};

// Register amm-deposit tool
server.registerTool(
    "amm-deposit",
    {
        title: "AMM Deposit",
        description: "Deposit assets into an existing Automated Market Maker (AMM) on the XRP Ledger",
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
                })
                .describe("First asset in the AMM's pool"),
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
                })
                .describe("Second asset in the AMM's pool"),
            amount1: z
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
                .optional()
                .describe("Amount of the first asset to deposit"),
            amount2: z
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
                .optional()
                .describe("Amount of the second asset to deposit"),
            lpTokensOut: z
                .object({
                    currency: z.string().describe("Currency code of LP token"),
                    issuer: z.string().describe("Issuer address of LP token"),
                    value: z
                        .string()
                        .describe("Minimum amount of LP tokens to receive"),
                })
                .optional()
                .describe("Minimum amount of LP tokens to receive"),
            singleAsset: z
                .boolean()
                .optional()
                .describe("Whether to deposit only a single asset type"),
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
        asset1,
        asset2,
        amount1,
        amount2,
        lpTokensOut,
        singleAsset,
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
            // Format assets for the transaction
            const formatAsset = (
                asset: Asset
            ): { currency: string; issuer?: string } => {
                if (asset.currency === "XRP") {
                    return { currency: "XRP" };
                } else {
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                    };
                }
            };
            // Format amounts for the transaction
            const formatAmount = (
                asset: Asset
            ):
                | string
                | { currency: string; issuer?: string; value: string } => {
                if (asset.currency === "XRP") {
                    return xrpl.xrpToDrops(asset.value || "0");
                } else {
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                        value: asset.value || "0",
                    };
                }
            };
            // Create AMMDeposit transaction
            const ammDepositTx: AMMDepositTransaction = {
                TransactionType: "AMMDeposit",
                Account: wallet.address,
                Asset: formatAsset(asset1),
                Asset2: formatAsset(asset2),
            };
            // Add optional fields if provided
            if (amount1) {
                ammDepositTx.Amount = formatAmount(amount1);
            }
            if (amount2) {
                ammDepositTx.Amount2 = formatAmount(amount2);
            }
            if (lpTokensOut) {
                ammDepositTx.LPTokenOut = lpTokensOut;
            }
            // Set flags if needed
            if (singleAsset) {
                // Set the tfSingleAsset flag (0x00080000 = 524288)
                ammDepositTx.Flags = 0x00080000;
            }
            if (fee) {
                ammDepositTx.Fee = fee;
            }
            // Submit transaction
            const prepared = await client.autofill(ammDepositTx as any);
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
                                amount1: amount1 || "Not specified",
                                amount2: amount2 || "Not specified",
                                lpTokensOut: lpTokensOut || "Not specified",
                                singleAsset: singleAsset || false,
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
                        text: `Error depositing to AMM: ${
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
