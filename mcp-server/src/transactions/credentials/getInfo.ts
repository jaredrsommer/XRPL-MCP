import { Client } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-get-info",
    {
        title: "Get Credential Info",
        description: "Get information about a specific credential on the XRP Ledger.",
        inputSchema: {
            issuer: z
                .string()
                .describe("The account address of the credential issuer."),
            subject: z
                .string()
                .describe("The account address of the credential subject."),
            credentialType: z
                .string()
                .describe("Type of credential to query. Will be hex-encoded."),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
        annotations: { readOnlyHint: true },
    },
    async ({ issuer, subject, credentialType, useTestnet }) => {
        let client: Client | null = null;
        try {
            const useTestnetNetwork =
                useTestnet !== undefined ? useTestnet : isConnectedToTestnet;

            client = await getXrplClient(useTestnetNetwork);

            const result = await client.request({
                command: "ledger_entry",
                credential: {
                    subject,
                    issuer,
                    credential_type: toHex(credentialType),
                },
                ledger_index: "validated",
            } as any);

            const credential = (result.result as any).node;

            // Parse flags
            const flags = credential.Flags || 0;
            const isAccepted = !!(flags & 0x00010000); // lsfAccepted

            // Decode URI if present
            let decodedURI: string | null = null;
            if (credential.URI) {
                try {
                    decodedURI = Buffer.from(credential.URI, "hex").toString("utf-8");
                } catch {
                    decodedURI = credential.URI;
                }
            }

            // Decode credential type
            let decodedCredentialType: string | null = null;
            if (credential.CredentialType) {
                try {
                    decodedCredentialType = Buffer.from(credential.CredentialType, "hex").toString("utf-8");
                } catch {
                    decodedCredentialType = credential.CredentialType;
                }
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                issuer: credential.Issuer,
                                subject: credential.Subject,
                                credentialType: decodedCredentialType,
                                credentialTypeHex: credential.CredentialType,
                                isAccepted,
                                isValid: isAccepted,
                                expiration: credential.Expiration ?? null,
                                uri: decodedURI,
                                uriHex: credential.URI ?? null,
                                flags,
                                ownerNode: credential.OwnerNode,
                                previousTxnID: credential.PreviousTxnID,
                                previousTxnLgrSeq: credential.PreviousTxnLgrSeq,
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
                                    issuer,
                                    subject,
                                    credentialType,
                                    found: false,
                                    message: "Credential not found.",
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
                        text: `Error getting credential info: ${
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
    "credentials-list",
    {
        title: "List Credentials",
        description: "List all credentials for an account (either as issuer or subject).",
        inputSchema: {
            account: z
                .string()
                .optional()
                .describe(
                    "The account address to list credentials for. If not provided, uses the connected wallet."
                ),
            role: z
                .enum(["subject", "issuer", "both"])
                .optional()
                .describe(
                    "Filter by role: 'subject' (credentials issued to this account), 'issuer' (credentials issued by this account), or 'both' (default)."
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
    async ({ account, role = "both", useTestnet }) => {
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

            // Get account objects filtered by Credential type
            const result = await client.request({
                command: "account_objects",
                account: queryAccount,
                type: "credential",
                ledger_index: "validated",
            } as any);

            const credentials = (result.result as any).account_objects || [];

            // Filter and format credentials
            const formattedCredentials = credentials
                .filter((cred: any) => {
                    if (role === "subject") return cred.Subject === queryAccount;
                    if (role === "issuer") return cred.Issuer === queryAccount;
                    return true;
                })
                .map((cred: any) => {
                    const flags = cred.Flags || 0;
                    const isAccepted = !!(flags & 0x00010000);

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
                        subject: cred.Subject,
                        credentialType: decodedType,
                        credentialTypeHex: cred.CredentialType,
                        isAccepted,
                        expiration: cred.Expiration ?? null,
                        index: cred.index,
                    };
                });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                account: queryAccount,
                                role,
                                count: formattedCredentials.length,
                                credentials: formattedCredentials,
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
                        text: `Error listing credentials: ${
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
