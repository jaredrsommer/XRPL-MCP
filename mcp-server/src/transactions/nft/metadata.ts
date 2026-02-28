import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { isConnectedToTestnet } from "../../core/state.js";

// Register get-nft-metadata tool
server.registerTool(
    "get-nft-metadata",
    {
        title: "Get NFT Metadata",
        description: "Get NFT collection and token metadata",
        inputSchema: {
            tokenID: z.string().describe("NFT token ID"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ tokenID, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Get NFT information
            const nftInfo = await client.request({
                command: "nft_info",
                nft_id: tokenID,
                ledger_index: "validated",
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                ...nftInfo.result,
                                _meta: {
                                    network: useTestnetNetwork
                                        ? TESTNET_URL
                                        : MAINNET_URL,
                                    networkType: useTestnetNetwork
                                        ? "testnet"
                                        : "mainnet",
                                },
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
                        text: `Error getting NFT metadata: ${
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
