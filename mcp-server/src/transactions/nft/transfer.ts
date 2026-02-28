import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register transfer-nft tool
server.registerTool(
    "transfer-nft",
    {
        title: "Transfer NFT",
        description: "Transfer NFT between addresses",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Seed of the wallet to send from, if not using connected wallet"
                ),
            toAddress: z.string().describe("Destination address"),
            tokenID: z.string().describe("NFT token ID to transfer"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
    },
    async ({ fromSeed, toAddress, tokenID, useTestnet }) => {
        let client: Client | null = null;
        try {
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
                    "No wallet connected. Please connect first or provide a fromSeed."
                );
            }

            // Create NFT transfer transaction (via NFTokenCreateOffer for 0 amount)
            const nftSellOffer = {
                TransactionType: "NFTokenCreateOffer",
                Account: wallet.address,
                NFTokenID: tokenID,
                Amount: "0", // Indicate a transfer by offering for 0
                Flags: 1, // tfSellToken
                Destination: toAddress, // The recipient of the transfer
            };

            const prepared = await client.autofill(nftSellOffer as any);
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
                                fromAddress: wallet.address,
                                toAddress,
                                tokenID,
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
                        text: `Error transferring NFT: ${
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
