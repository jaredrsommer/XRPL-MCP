import { Client, Wallet, OracleSet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

// Register oracle-set tool
server.registerTool(
    "oracle-set",
    {
        title: "Set Oracle",
        description: "Set or update Oracle data on the XRP Ledger (Requires Price Oracle amendment)",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet that owns the oracle. If not provided, the connected wallet will be used."
                ),
            oracleDocumentID: z
                .number()
                .int()
                .positive()
                .describe("The ID of the Oracle object to set/update."),
            lastUpdateTime: z
                .number()
                .int()
                .positive()
                .describe(
                    "Timestamp of the last update (seconds since Ripple Epoch). A unique ID for the price data."
                ),
            dataProvider: z
                .string()
                .optional()
                .describe(
                    "Optional: Source or provider of the data (e.g., 'Chainlink', 'Band Protocol'). Must be hex encoded."
                ),
            assetClass: z
                .string()
                .optional()
                .describe(
                    "Optional: Classification of the asset (e.g., 'currency', 'commodity'). Must be hex encoded."
                ),
            uri: z
                .string()
                .url()
                .optional()
                .describe(
                    "Optional: URI for additional data or metadata. Must be hex encoded."
                ),
            dataSeries: z
                .array(
                    z.object({
                        baseAsset: z
                            .string()
                            .describe("Base asset currency code (e.g., 'XRP')."),
                        quoteAsset: z
                            .string()
                            .describe("Quote asset currency code (e.g., 'USD')."),
                        scale: z
                            .number()
                            .int()
                            .optional()
                            .describe(
                                "Optional scale factor for the price (e.g., 6 for 6 decimal places). Defaults to 0."
                            ),
                        price: z
                            .number()
                            .positive()
                            .describe(
                                "Price of the base asset in terms of the quote asset."
                            ),
                    })
                )
                .min(1)
                .describe("Array of price data points (at least one required)."),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Requires Price Oracle amendment enabled network. If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { idempotentHint: true },
    },
    async ({
        fromSeed,
        oracleDocumentID,
        lastUpdateTime,
        dataProvider,
        assetClass,
        uri,
        dataSeries,
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
            // Prepare DataSeries
            const formattedDataSeries = dataSeries.map(
                (item) => ({
                    PriceData: {
                        BaseAsset: item.baseAsset,
                        QuoteAsset: item.quoteAsset,
                        AssetPrice: Math.round(
                            item.price * 10 ** (item.scale ?? 0)
                        ), // Scale the price
                        Scale: item.scale ?? 0,
                    },
                })
            );

            // Create OracleSet transaction
            const oracleSetTx: OracleSet = {
                TransactionType: "OracleSet",
                Account: wallet.address,
                OracleDocumentID: oracleDocumentID,
                LastUpdateTime: lastUpdateTime,
                PriceDataSeries: formattedDataSeries,
            };

            // Add optional fields (hex encoded)
            if (dataProvider) {
                oracleSetTx.Provider = toHex(dataProvider);
            }
            if (assetClass) {
                oracleSetTx.AssetClass = toHex(assetClass);
            }
            if (uri) {
                oracleSetTx.URI = toHex(uri);
            }
            if (fee) {
                oracleSetTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(oracleSetTx);
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
                                oracleDocumentID,
                                lastUpdateTime,
                                dataSeriesCount: dataSeries.length,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                                message:
                                    "Requires Price Oracle amendment (available on testnet/devnet)",
                                result: result.result,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            // Check for specific error indicating amendment not enabled
            if (
                error instanceof Error &&
                error.message.includes("Unsupported Transaction type")
            ) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error setting Oracle data: The OracleSet transaction requires the Price Oracle amendment, which may not be enabled on the selected network (${
                                useTestnet ? "Testnet" : "Mainnet"
                            }). Original error: ${error.message}`,
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Error setting Oracle data: ${
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
