import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Register token-escrow-create tool
server.registerTool(
    "token-escrow-create",
    {
        title: "Create Token Escrow",
        description: "Create an Escrow for fungible tokens (Trust Line Tokens or MPTs) on the XRP Ledger. Requires the TokenEscrow amendment. For Trust Line Tokens, the issuer must have lsfAllowTrustLineLocking enabled. For MPTs, the issuance must have lsfMPTCanEscrow enabled.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (sender) to use. If not provided, the connected wallet will be used."
                ),
            tokenType: z
                .enum(["trustline", "mpt"])
                .describe(
                    "Type of token to escrow: 'trustline' for Trust Line Tokens (issued currencies) or 'mpt' for Multi-Purpose Tokens."
                ),
            // For Trust Line Tokens
            currency: z
                .string()
                .optional()
                .describe(
                    "Currency code for Trust Line Token escrow (e.g., 'USD', 'EUR'). Required when tokenType is 'trustline'."
                ),
            issuer: z
                .string()
                .optional()
                .describe(
                    "Issuer account address for Trust Line Token escrow. Required when tokenType is 'trustline'."
                ),
            // For MPTs
            mptIssuanceID: z
                .string()
                .optional()
                .describe(
                    "MPTokenIssuanceID for MPT escrow (64-character hex string). Required when tokenType is 'mpt'."
                ),
            // Common fields
            value: z
                .string()
                .describe("Amount of tokens to escrow."),
            destination: z
                .string()
                .describe("Address of the recipient of the escrowed tokens."),
            destinationTag: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Optional arbitrary unsigned 32-bit integer tag for the destination."
                ),
            condition: z
                .string()
                .optional()
                .describe(
                    "Hex value representing a PREIMAGE-SHA-256 crypto-condition. If provided, escrow can only be finished with the preimage."
                ),
            finishAfter: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be finished."
                ),
            cancelAfter: z
                .number()
                .int()
                .positive()
                .describe(
                    "Timestamp (seconds since Ripple Epoch) after which the escrow can be cancelled. REQUIRED for token escrows."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). Note: Token Escrow requires the TokenEscrow amendment."
                ),

        },
    },
    async ({
        fromSeed,
        tokenType,
        currency,
        issuer,
        mptIssuanceID,
        value,
        destination,
        destinationTag,
        condition,
        finishAfter,
        cancelAfter,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
            // Validate required fields based on token type
            if (tokenType === "trustline") {
                if (!currency || !issuer) {
                    throw new Error(
                        "Currency and issuer are required for Trust Line Token escrow."
                    );
                }
            } else if (tokenType === "mpt") {
                if (!mptIssuanceID) {
                    throw new Error(
                        "mptIssuanceID is required for MPT escrow."
                    );
                }
            }

            // Token escrows require cancelAfter
            if (!cancelAfter) {
                throw new Error(
                    "cancelAfter is required for token escrows."
                );
            }

            // Ensure at least one release condition is specified
            if (!condition && !finishAfter) {
                throw new Error(
                    "Either condition or finishAfter must be specified for the escrow."
                );
            }

            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

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

            // Build Amount field based on token type
            let amount: any;
            if (tokenType === "trustline") {
                amount = {
                    currency: currency,
                    issuer: issuer,
                    value: value,
                };
            } else {
                // MPT format
                amount = {
                    mpt_issuance_id: mptIssuanceID,
                    value: value,
                };
            }

            // Create EscrowCreate transaction with token amount
            const tx: any = {
                TransactionType: "EscrowCreate",
                Account: wallet.address,
                Amount: amount,
                Destination: destination,
                CancelAfter: cancelAfter,
            };

            if (destinationTag) {
                tx.DestinationTag = destinationTag;
            }
            if (condition) {
                tx.Condition = condition;
            }
            if (finishAfter) {
                tx.FinishAfter = finishAfter;
            }
            if (fee) {
                tx.Fee = fee;
            }

            const prepared = await client.autofill(tx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            let escrowSequence = -1;
            let escrowIndex: string | undefined;

            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";

                if (status === "success" && result.result.meta.AffectedNodes) {
                    for (const node of result.result.meta.AffectedNodes) {
                        if (
                            "CreatedNode" in node &&
                            node.CreatedNode?.LedgerEntryType === "Escrow"
                        ) {
                            escrowSequence = (node.CreatedNode.NewFields as any)?.Sequence;
                            escrowIndex = node.CreatedNode.LedgerIndex;
                            break;
                        }
                    }
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                escrowSequence:
                                    status === "success" && escrowSequence !== -1
                                        ? escrowSequence
                                        : "N/A",
                                escrowIndex,
                                account: wallet.address,
                                tokenType,
                                amount:
                                    tokenType === "trustline"
                                        ? { currency, issuer, value }
                                        : { mptIssuanceID, value },
                                destination,
                                condition: condition ?? null,
                                finishAfter: finishAfter ?? null,
                                cancelAfter,
                                note: "Token escrow requires the TokenEscrow amendment. For Trust Line Tokens, the issuer must have lsfAllowTrustLineLocking. For MPTs, the issuance must have lsfMPTCanEscrow.",
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
                        text: `Error creating token escrow: ${
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
