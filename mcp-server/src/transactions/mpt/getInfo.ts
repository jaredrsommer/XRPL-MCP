import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "mpt-get-info",
    {
        title: "Get MPT Info",
        description: "Get information about a Multi-Purpose Token (MPT) issuance including metadata, supply, and flags.",
        inputSchema: {
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT to query (64-character hex string)."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ mptIssuanceID, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Use ledger_entry to get MPTokenIssuance object
            const result = await client.request({
                command: "ledger_entry",
                mpt_issuance: mptIssuanceID,
                ledger_index: "validated",
            } as any);

            const issuance = (result.result as any).node;

            // Parse flags
            const flags = issuance.Flags || 0;
            const parsedFlags = {
                lsfMPTLocked: !!(flags & 0x0001),
                lsfMPTCanLock: !!(flags & 0x0002),
                lsfMPTRequireAuth: !!(flags & 0x0004),
                lsfMPTCanEscrow: !!(flags & 0x0008),
                lsfMPTCanTrade: !!(flags & 0x0010),
                lsfMPTCanTransfer: !!(flags & 0x0020),
                lsfMPTCanClawback: !!(flags & 0x0040),
            };

            // Decode metadata if present
            let decodedMetadata: string | null = null;
            if (issuance.MPTokenMetadata) {
                try {
                    decodedMetadata = Buffer.from(issuance.MPTokenMetadata, "hex").toString("utf-8");
                } catch {
                    decodedMetadata = issuance.MPTokenMetadata;
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                mptIssuanceID,
                                issuer: issuance.Issuer,
                                assetScale: issuance.AssetScale ?? 0,
                                maxAmount: issuance.MaximumAmount ?? "unlimited",
                                outstandingAmount: issuance.OutstandingAmount ?? "0",
                                transferFee: issuance.TransferFee ?? 0,
                                sequence: issuance.Sequence,
                                ownerNode: issuance.OwnerNode,
                                metadata: decodedMetadata,
                                metadataHex: issuance.MPTokenMetadata ?? null,
                                flags: parsedFlags,
                                rawFlags: flags,
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
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
                        text: `Error getting MPT info: ${
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

server.registerTool(
    "mpt-get-balance",
    {
        title: "Get MPT Balance",
        description: "Get the MPT balance for a specific account.",
        inputSchema: {
            account: z
                .string()
                .optional()
                .describe(
                    "The account address to check balance for. If not provided, uses the connected wallet."
                ),
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT to query (64-character hex string)."
                ),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ account, mptIssuanceID, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            // Determine account to query
            let queryAccount: string;
            if (account) {
                queryAccount = account;
            } else if (connectedWallet) {
                queryAccount = connectedWallet.address;
            } else {
                throw new Error(
                    "No account specified and no wallet connected."
                );
            }

            // Use ledger_entry to get MPToken object
            const result = await client.request({
                command: "ledger_entry",
                mptoken: {
                    mpt_issuance_id: mptIssuanceID,
                    account: queryAccount,
                },
                ledger_index: "validated",
            } as any);

            const mpToken = (result.result as any).node;

            // Parse flags
            const flags = mpToken.Flags || 0;
            const parsedFlags = {
                lsfMPTLocked: !!(flags & 0x0001),
                lsfMPTAuthorized: !!(flags & 0x0002),
            };

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                account: queryAccount,
                                mptIssuanceID,
                                balance: mpToken.MPTAmount ?? "0",
                                flags: parsedFlags,
                                rawFlags: flags,
                                lockedAmount: mpToken.LockedAmount ?? "0",
                                network: useTestnetNetwork
                                    ? TESTNET_URL
                                    : MAINNET_URL,
                                networkType: useTestnetNetwork
                                    ? "testnet"
                                    : "mainnet",
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            // Check if the error indicates the account doesn't hold this MPT
            if (error instanceof Error && error.message.includes("entryNotFound")) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    account: account ?? connectedWallet?.address,
                                    mptIssuanceID,
                                    balance: "0",
                                    message: "Account does not hold this MPT or has not opted in.",
                                    network: useTestnet ? TESTNET_URL : MAINNET_URL,
                                    networkType: useTestnet ? "testnet" : "mainnet",
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Error getting MPT balance: ${
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
