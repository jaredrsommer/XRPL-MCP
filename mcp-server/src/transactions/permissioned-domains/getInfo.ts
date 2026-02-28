import { Client } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

server.registerTool(
    "permissioned-domain-get-info",
    {
        title: "Get Permissioned Domain Info",
        description: "Get information about a Permissioned Domain on the XRP Ledger.",
        inputSchema: {
            domainID: z
                .string()
                .describe(
                    "The ID of the Permissioned Domain to query (64-character hex string)."
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
    async ({ domainID, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            const result = await client.request({
                command: "ledger_entry",
                permissioned_domain: domainID,
                ledger_index: "validated",
            } as any);

            const domain = (result.result as any).node;

            // Parse accepted credentials
            const acceptedCredentials = (domain.AcceptedCredentials || []).map((item: any) => {
                const cred = item.Credential;
                let decodedType: string | null = null;
                if (cred.CredentialType) {
                    try {
                        decodedType = Buffer.from(cred.CredentialType, "hex").toString("utf-8");
                    } catch {
                        decodedType = cred.CredentialType;
                    }
                }
                return {
                    issuer: cred.Issuer,
                    credentialType: decodedType,
                    credentialTypeHex: cred.CredentialType,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                domainID,
                                owner: domain.Owner,
                                sequence: domain.Sequence,
                                acceptedCredentials,
                                ownerNode: domain.OwnerNode,
                                previousTxnID: domain.PreviousTxnID,
                                previousTxnLgrSeq: domain.PreviousTxnLgrSeq,
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
            if (error instanceof Error && error.message.includes("entryNotFound")) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    domainID,
                                    found: false,
                                    message: "Permissioned Domain not found.",
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
                        text: `Error getting permissioned domain info: ${
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
    "permissioned-domains-list",
    {
        title: "List Permissioned Domains",
        description: "List all Permissioned Domains owned by an account.",
        inputSchema: {
            account: z
                .string()
                .optional()
                .describe(
                    "The account address to list domains for. If not provided, uses the connected wallet."
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
    async ({ account, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

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

            const result = await client.request({
                command: "account_objects",
                account: queryAccount,
                type: "permissioned_domain",
                ledger_index: "validated",
            } as any);

            const domains = (result.result as any).account_objects || [];

            const formattedDomains = domains.map((domain: any) => {
                const acceptedCredentials = (domain.AcceptedCredentials || []).map((item: any) => {
                    const cred = item.Credential;
                    let decodedType: string | null = null;
                    if (cred.CredentialType) {
                        try {
                            decodedType = Buffer.from(cred.CredentialType, "hex").toString("utf-8");
                        } catch {
                            decodedType = cred.CredentialType;
                        }
                    }
                    return {
                        issuer: cred.Issuer,
                        credentialType: decodedType,
                    };
                });

                return {
                    domainID: domain.index,
                    sequence: domain.Sequence,
                    acceptedCredentials,
                };
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                account: queryAccount,
                                count: formattedDomains.length,
                                domains: formattedDomains,
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
                        text: `Error listing permissioned domains: ${
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
