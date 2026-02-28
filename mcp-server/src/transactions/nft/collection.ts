import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register get-nft-collection tool
server.registerTool(
    "get-nft-collection",
    {
        title: "Get NFT Collection",
        description: "Get all NFTs owned by an address",
        inputSchema: {
            address: z
                .string()
                .optional()
                .describe("Account address to check, defaults to connected wallet"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ address, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided address or connected wallet's address
            const accountAddress =
                address ||
                (connectedWallet ? connectedWallet.address : undefined);

            if (!accountAddress) {
                throw new Error("No address provided and no wallet connected.");
            }

            // Get account NFTs
            const accountNfts = await client.request({
                command: "account_nfts",
                account: accountAddress,
                ledger_index: "validated",
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                address: accountAddress,
                                count:
                                    accountNfts.result.account_nfts?.length ||
                                    0,
                                nfts: accountNfts.result.account_nfts || [],
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
                        text: `Error getting NFT collection: ${
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
