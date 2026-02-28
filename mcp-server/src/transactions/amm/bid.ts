import {
    Client,
    Wallet,
    AMMBid,
    Amount,
    Currency,
    IssuedCurrencyAmount,
} from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register amm-bid tool
server.registerTool(
    "amm-bid",
    {
        title: "AMM Bid",
        description: "Place a bid on an Automated Market Maker's (AMM) auction slot on the XRP Ledger",
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
            bidMin: z
                .object({
                    currency: z.string().describe("Currency code of the bid"),
                    issuer: z.string().describe("Issuer address of the bid token"),
                    value: z.string().describe("Minimum bid amount"),
                })
                .optional()
                .describe(
                    "Minimum amount for the bid. Required unless bidMax is provided."
                ),
            bidMax: z
                .object({
                    currency: z.string().describe("Currency code of the bid"),
                    issuer: z.string().describe("Issuer address of the bid token"),
                    value: z.string().describe("Maximum bid amount"),
                })
                .optional()
                .describe(
                    "Maximum amount for the bid. Required unless bidMin is provided."
                ),
            authAccounts: z
                .array(
                    z
                        .object({
                            account: z.string().describe("Account address"),
                        })
                        .describe("An authorized account")
                )
                .max(4)
                .optional()
                .describe(
                    "List of up to 4 accounts authorized to trade at the discounted fee."
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
        asset1,
        asset2,
        bidMin,
        bidMax,
        authAccounts,
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

            // Format amounts and assets
            const formatAmount = (amountInput: {
                currency: string;
                issuer: string;
                value: string;
            }): IssuedCurrencyAmount => {
                return {
                    currency: amountInput.currency,
                    issuer: amountInput.issuer,
                    value: amountInput.value,
                };
            };

            const formatAsset = (asset: {
                currency: string;
                issuer?: string;
            }): Currency => {
                if (asset.currency === "XRP") {
                    return { currency: "XRP" };
                } else {
                    if (!asset.issuer) {
                        throw new Error(
                            `Issuer must be provided for non-XRP currency ${asset.currency}`
                        );
                    }
                    return {
                        currency: asset.currency,
                        issuer: asset.issuer,
                    };
                }
            };

            // Create AMMBid transaction with explicit AMMBid type
            const ammBidTx: AMMBid = {
                TransactionType: "AMMBid",
                Account: wallet.address,
                Asset: formatAsset(asset1),
                Asset2: formatAsset(asset2),
            };

            // Add bid amounts using formatAmount
            if (bidMin) {
                ammBidTx.BidMin = formatAmount(bidMin);
            } else if (bidMax) {
                ammBidTx.BidMax = formatAmount(bidMax);
            } else {
                throw new Error("Either bidMin or bidMax must be provided.");
            }

            // Add optional auth accounts using original mapping logic
            if (authAccounts && authAccounts.length > 0) {
                ammBidTx.AuthAccounts = authAccounts.map((a) => ({
                    AuthAccount: { Account: a.account },
                }));
            }

            // Add optional fee if provided
            if (fee) {
                ammBidTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(ammBidTx);
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
                                bidMin,
                                bidMax,
                                authAccounts,
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
                        text: `Error placing AMM bid: ${
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
