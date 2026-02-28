import { Client, Wallet, PaymentChannelFund } from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register payment-channel-fund tool
server.registerTool(
    "payment-channel-fund",
    {
        title: "Fund Payment Channel",
        description: "Add additional XRP to an existing Payment Channel",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (sender/source) funding the channel. If not provided, the connected wallet will be used."
                ),
            channel: z
                .string()
                .describe("The ID of the Payment Channel to add funds to."),
            amount: z
                .string()
                .describe("Amount of XRP, in drops, to add to the channel."),
            expiration: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional: New expiration time (seconds since Ripple Epoch) for the channel. Must be later than the existing expiration."
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
    async ({ fromSeed, channel, amount, expiration, fee, useTestnet }) => {
        let client: Client | null = null;
        try {
            // Determine which network to use
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use provided seed or connected wallet (must be channel source)
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

            // Create PaymentChannelFund transaction
            const channelFundTx: PaymentChannelFund = {
                TransactionType: "PaymentChannelFund",
                Account: wallet.address, // Must be the source of the channel
                Channel: channel, // Required channel ID
                Amount: amount, // Required amount in drops to add
            };

            // Add optional expiration
            if (expiration) {
                channelFundTx.Expiration = expiration;
            }
            if (fee) {
                channelFundTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(channelFundTx);
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
                                channel,
                                fundedAmount: amount,
                                newExpiration: expiration,
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
                        text: `Error funding Payment Channel: ${
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
