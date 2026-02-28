import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register verify-nft-ownership tool
server.registerTool(
    "verify-nft-ownership",
    {
        title: "Verify NFT Ownership",
        description: "Verify if an address owns a specific NFT",
        inputSchema: {
            address: z
                .string()
                .optional()
                .describe("Account address to check, defaults to connected wallet"),
            tokenID: z.string().describe("NFT token ID"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ address, tokenID, useTestnet }) => {
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

            // Check if the specific NFT is owned
            const nfts = accountNfts.result.account_nfts || [];
            const ownsNft = nfts.some((nft) => nft.NFTokenID === tokenID);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                address: accountAddress,
                                tokenID,
                                ownsNft,
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
                        text: `Error verifying NFT ownership: ${
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
