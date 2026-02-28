import {
    Client,
    Wallet,
    PaymentChannelClaim,
    PaymentChannelClaimFlags,
} from "xrpl";
import * as xrpl from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register payment-channel-claim tool
server.registerTool(
    "payment-channel-claim",
    {
        title: "Claim Payment Channel",
        description: "Claim funds from a Payment Channel on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet claiming funds. If not provided, the connected wallet will be used."
                ),
            channel: z
                .string()
                .describe("The ID of the Payment Channel to claim from."),
            balance: z
                .string()
                .optional()
                .describe(
                    "Total amount of XRP drops delivered by this channel after this claim. Required unless closing the channel."
                ),
            amount: z
                .string()
                .optional()
                .describe(
                    "Amount of XRP drops to claim. Required unless closing the channel or specifying balance."
                ),
            signature: z
                .string()
                .optional()
                .describe(
                    "Signature of the claim, signed by the channel owner. Required unless closing the channel."
                ),
            publicKey: z
                .string()
                .optional()
                .describe(
                    "Public key corresponding to the private key used for the signature. Required if signature is provided."
                ),
            close: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    "If true, close the channel. Either the channel source or destination can close."
                ),
            renew: z
                .boolean()
                .optional()
                .default(false)
                .describe("If true, renew the channel's expiration time."),
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
        channel,
        balance,
        amount,
        signature,
        publicKey,
        close,
        renew,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Validation for claim parameters
            if (!close && !balance && !amount) {
                throw new Error(
                    "Either balance or amount must be specified unless closing the channel."
                );
            }
            if (!close && balance && amount) {
                throw new Error(
                    "Cannot specify both balance and amount for a claim."
                );
            }
            if (!close && !signature) {
                throw new Error(
                    "Signature is required to claim funds unless closing the channel."
                );
            }
            if (signature && !publicKey) {
                throw new Error(
                    "Public key must be provided with the signature."
                );
            }

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

            // Create PaymentChannelClaim transaction
            const claimTx: PaymentChannelClaim = {
                TransactionType: "PaymentChannelClaim",
                Account: wallet.address,
                Channel: channel,
                Flags: 0, // Initialize flags
            };

            // Add claim-specific fields
            if (balance) {
                claimTx.Balance = balance; // Amount in drops
            }
            if (amount) {
                claimTx.Amount = amount; // Amount in drops
            }
            if (signature) {
                claimTx.Signature = signature;
            }
            if (publicKey) {
                claimTx.PublicKey = publicKey;
            }

            // Set flags
            let flags = 0;
            if (renew) flags |= PaymentChannelClaimFlags.tfRenew;
            if (close) flags |= PaymentChannelClaimFlags.tfClose;

            if (flags > 0) {
                claimTx.Flags = flags;
            }

            // Add optional fee if provided
            if (fee) {
                claimTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(claimTx);
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
                                claimedAmount: amount,
                                newBalance: balance,
                                closed: close,
                                renewed: renew,
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
                        text: `Error claiming from Payment Channel: ${
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
