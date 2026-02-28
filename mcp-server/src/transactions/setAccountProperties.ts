import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

// Register set-account-properties tool
server.registerTool(
    "set-account-properties",
    {
        title: "Set Account Properties",
        description: "Set or modify account properties on the XRP Ledger",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to modify. If not provided, the connected wallet will be used."
                ),
            domain: z
                .string()
                .optional()
                .describe(
                    "Domain name to associate with this account (in hex format)"
                ),
            emailHash: z
                .string()
                .optional()
                .describe("MD5 hash of an email address for Gravatar (in hex)"),
            messageKey: z
                .string()
                .optional()
                .describe(
                    "Public key for sending encrypted messages to this account"
                ),
            transferRate: z
                .number()
                .optional()
                .describe(
                    "Fee to charge when users transfer this account's tokens (in billionths)"
                ),
            tickSize: z
                .number()
                .optional()
                .describe("Tick size for offers (between 3-15, or 0 to disable)"),
            setFlag: z
                .number()
                .optional()
                .describe("Integer flag to enable for this account"),
            clearFlag: z
                .number()
                .optional()
                .describe("Integer flag to disable for this account"),
            fee: z.string().optional().describe("Transaction fee in XRP"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false). If not provided, uses the network from the connected wallet."
                ),

        },
        annotations: { idempotentHint: true },
    },
    async ({
        fromSeed,
        domain,
        emailHash,
        messageKey,
        transferRate,
        tickSize,
        setFlag,
        clearFlag,
        fee,
        useTestnet,
    }) => {
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

            // Create AccountSet transaction
            const accountSetTx: any = {
                TransactionType: "AccountSet",
                Account: wallet.address,
            };

            // Add optional fields if provided
            if (domain !== undefined) {
                accountSetTx.Domain = domain;
            }

            if (emailHash !== undefined) {
                accountSetTx.EmailHash = emailHash;
            }

            if (messageKey !== undefined) {
                accountSetTx.MessageKey = messageKey;
            }

            if (transferRate !== undefined) {
                accountSetTx.TransferRate = transferRate;
            }

            if (tickSize !== undefined) {
                accountSetTx.TickSize = tickSize;
            }

            if (setFlag !== undefined) {
                accountSetTx.SetFlag = setFlag;
            }

            if (clearFlag !== undefined) {
                accountSetTx.ClearFlag = clearFlag;
            }

            if (fee !== undefined) {
                accountSetTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(accountSetTx);
            const signed = wallet.sign(prepared);
            const result = await client.submitAndWait(signed.tx_blob);

            let status = "unknown";
            if (typeof result.result.meta !== "string" && result.result.meta) {
                status =
                    result.result.meta.TransactionResult === "tesSUCCESS"
                        ? "success"
                        : "failed";
            }

            // Get updated account info
            const accountInfo = await client.request({
                command: "account_info",
                account: wallet.address,
                ledger_index: "validated",
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                account: wallet.address,
                                updatedProperties: {
                                    domain:
                                        domain !== undefined
                                            ? domain
                                            : undefined,
                                    emailHash:
                                        emailHash !== undefined
                                            ? emailHash
                                            : undefined,
                                    messageKey:
                                        messageKey !== undefined
                                            ? messageKey
                                            : undefined,
                                    transferRate:
                                        transferRate !== undefined
                                            ? transferRate
                                            : undefined,
                                    tickSize:
                                        tickSize !== undefined
                                            ? tickSize
                                            : undefined,
                                    setFlag:
                                        setFlag !== undefined
                                            ? setFlag
                                            : undefined,
                                    clearFlag:
                                        clearFlag !== undefined
                                            ? clearFlag
                                            : undefined,
                                },
                                accountFlags:
                                    accountInfo.result.account_data.Flags,
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
                        text: `Error setting account properties: ${
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
