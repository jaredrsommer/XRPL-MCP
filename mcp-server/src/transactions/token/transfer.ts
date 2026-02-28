import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register transfer-token tool
server.registerTool(
    "transfer-token",
    {
        title: "Transfer Token",
        description: "Transfer tokens between addresses",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Seed of the wallet to send from, if not using connected wallet"
                ),
            toAddress: z.string().describe("Destination address"),
            currency: z.string().describe("Currency code"),
            issuer: z.string().describe("Issuer address for the token"),
            amount: z.string().describe("Amount to send"),
            useTestnet: z
                .boolean()
                .optional()
                .describe("Whether to use testnet or mainnet"),

        },
    },
    async ({ fromSeed, toAddress, currency, issuer, amount, useTestnet }) => {
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

            // Construct token payment
            const payment = {
                TransactionType: "Payment",
                Account: wallet.address,
                Destination: toAddress,
                Amount: {
                    currency,
                    issuer,
                    value: amount,
                },
            };

            const prepared = await client.autofill(payment as any);
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
                                currency,
                                issuer,
                                amount,
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
                        text: `Error transferring token: ${
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
