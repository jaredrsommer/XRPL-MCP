import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

// Register oracle-set tool
server.registerTool(
    "oracle-set",
    {
        title: "Set Oracle",
        description:
            "Set or update Oracle data on the XRP Ledger (Requires Price Oracle amendment)",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
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
                            .describe(
                                "Base asset currency code (e.g., 'XRP')."
                            ),
                        quoteAsset: z
                            .string()
                            .describe(
                                "Quote asset currency code (e.g., 'USD')."
                            ),
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
                .describe(
                    "Array of price data points (at least one required)."
                ),
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
        walletName,
        oracleDocumentID,
        lastUpdateTime,
        dataProvider,
        assetClass,
        uri,
        dataSeries,
        fee,
        useTestnet,
    }) => {
        try {
            // Prepare DataSeries
            const formattedDataSeries = dataSeries.map((item) => ({
                PriceData: {
                    BaseAsset: item.baseAsset,
                    QuoteAsset: item.quoteAsset,
                    AssetPrice: Math.round(
                        item.price * 10 ** (item.scale ?? 0)
                    ),
                    Scale: item.scale ?? 0,
                },
            }));

            const tx: Record<string, unknown> = {
                TransactionType: "OracleSet",
                OracleDocumentID: oracleDocumentID,
                LastUpdateTime: lastUpdateTime,
                PriceDataSeries: formattedDataSeries,
            };

            // Add optional fields (hex encoded)
            if (dataProvider) {
                tx.Provider = toHex(dataProvider);
            }
            if (assetClass) {
                tx.AssetClass = toHex(assetClass);
            }
            if (uri) {
                tx.URI = toHex(uri);
            }
            if (fee) {
                tx.Fee = fee;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "oracle-set",
                summary: {
                    transactionType: "OracleSet",
                    fromAddress: "",
                    description: `Set Oracle document ID ${oracleDocumentID} with ${dataSeries.length} data point(s)`,
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
                                networkType:
                                    result.pendingTransaction.networkType,
                                message: result.message,
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
                            text: `Error setting Oracle data: The OracleSet transaction requires the Price Oracle amendment, which may not be enabled on the selected network. Original error: ${error.message}`,
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
        }
    }
);
