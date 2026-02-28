import { PaymentChannelClaimFlags } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { executor } from "../../core/custody/index.js";

// Register payment-channel-claim tool
server.registerTool(
    "payment-channel-claim",
    {
        title: "Claim Payment Channel",
        description: "Claim funds from a Payment Channel on the XRP Ledger",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
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
        walletName,
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

            // Create PaymentChannelClaim transaction
            const tx: Record<string, unknown> = {
                TransactionType: "PaymentChannelClaim",
                Channel: channel,
                Flags: 0,
            };

            // Add claim-specific fields
            if (balance) {
                tx.Balance = balance;
            }
            if (amount) {
                tx.Amount = amount;
            }
            if (signature) {
                tx.Signature = signature;
            }
            if (publicKey) {
                tx.PublicKey = publicKey;
            }

            // Set flags
            let flags = 0;
            if (renew) flags |= PaymentChannelClaimFlags.tfRenew;
            if (close) flags |= PaymentChannelClaimFlags.tfClose;

            if (flags > 0) {
                tx.Flags = flags;
            }

            // Add optional fee if provided
            if (fee) {
                tx.Fee = fee;
            }

            const description = close
                ? `Close payment channel ${channel}`
                : `Claim ${amount || balance} drops from payment channel ${channel}`;

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "payment-channel-claim",
                summary: {
                    transactionType: "PaymentChannelClaim",
                    fromAddress: "",
                    amount: amount || balance,
                    currency: "XRP",
                    description,
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
                                networkType: result.pendingTransaction.networkType,
                                message: result.message,
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
        }
    }
);
