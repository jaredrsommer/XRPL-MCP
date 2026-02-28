import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "token-clawback",
    {
        title: "Token Clawback",
        description: "Claw back tokens issued by your account from a holder",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the issuer wallet to use. If not provided, the connected wallet will be used."
                ),
            amount: z
                .object({
                    currency: z
                        .string()
                        .describe("Currency code of the token to claw back"),
                    issuer: z
                        .string()
                        .describe(
                            "Address of the holder (not the issuer) of the tokens"
                        ),
                    value: z.string().describe("Amount of tokens to claw back"),
                })
                .describe("Token amount details"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { destructiveHint: true },
    },
    async ({ fromSeed, amount, fee, useTestnet }) => {
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

            // Validate amount
            if (parseFloat(amount.value) <= 0) {
                throw new Error("Clawback amount must be greater than zero");
            }

            // Validate holder address is not the same as issuer
            if (amount.issuer === wallet.address) {
                throw new Error(
                    "Holder address (in amount.issuer) cannot be the same as the issuer account"
                );
            }

            // Create Clawback transaction
            const clawbackTx: any = {
                TransactionType: "Clawback",
                Account: wallet.address, // The issuer
                Amount: {
                    currency: amount.currency,
                    issuer: amount.issuer, // The holder's address
                    value: amount.value,
                },
            };

            // Add optional fee if provided
            if (fee) {
                clawbackTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(clawbackTx);
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
                                issuer: wallet.address,
                                holder: amount.issuer,
                                currency: amount.currency,
                                amount: amount.value,
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
                        text: `Error performing token clawback: ${
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
