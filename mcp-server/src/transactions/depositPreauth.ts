import { z } from "zod";
import { server } from "../server/server.js";
import { executor } from "../core/custody/index.js";

server.registerTool(
    "deposit-preauth",
    {
        title: "Deposit Preauth",
        description: "Grant or revoke preauthorization for an account to deliver payments to your account",
        inputSchema: {
            walletName: z
                .string()
                .optional()
                .describe(
                    "Optional name of the registered wallet to use. If not provided, the default wallet will be used."
                ),
            authorize: z
                .string()
                .optional()
                .describe(
                    "Account address to preauthorize for sending payments to you"
                ),
            authorizeCredentials: z
                .array(
                    z.object({
                        issuer: z.string().describe("The issuer of the credential"),
                        credentialType: z
                            .string()
                            .describe(
                                "The credential type of the credential (in hex)"
                            ),
                    })
                )
                .optional()
                .describe(
                    "A set of credentials to authorize (requires Credentials amendment)"
                ),
            unauthorize: z
                .string()
                .optional()
                .describe(
                    "Account address whose preauthorization should be revoked"
                ),
            unauthorizeCredentials: z
                .array(
                    z.object({
                        issuer: z.string().describe("The issuer of the credential"),
                        credentialType: z
                            .string()
                            .describe(
                                "The credential type of the credential (in hex)"
                            ),
                    })
                )
                .optional()
                .describe(
                    "A set of credentials whose preauthorization should be revoked (requires Credentials amendment)"
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
    async ({
        walletName,
        authorize,
        authorizeCredentials,
        unauthorize,
        unauthorizeCredentials,
        fee,
        useTestnet,
    }) => {
        try {
            // Validate input - must provide exactly one of the authorization fields
            const providedFields = [
                authorize !== undefined,
                authorizeCredentials !== undefined,
                unauthorize !== undefined,
                unauthorizeCredentials !== undefined,
            ].filter(Boolean).length;

            if (providedFields !== 1) {
                throw new Error(
                    "Must provide exactly one of: authorize, authorizeCredentials, unauthorize, or unauthorizeCredentials"
                );
            }

            // Create DepositPreauth transaction
            const tx: Record<string, unknown> = {
                TransactionType: "DepositPreauth",
            };

            // Add the appropriate authorization field
            if (authorize !== undefined) {
                tx.Authorize = authorize;
            } else if (authorizeCredentials !== undefined) {
                tx.AuthorizeCredentials =
                    authorizeCredentials.map((cred) => ({
                        Issuer: cred.issuer,
                        CredentialType: cred.credentialType,
                    }));
            } else if (unauthorize !== undefined) {
                tx.Unauthorize = unauthorize;
            } else if (unauthorizeCredentials !== undefined) {
                tx.UnauthorizeCredentials =
                    unauthorizeCredentials.map((cred) => ({
                        Issuer: cred.issuer,
                        CredentialType: cred.credentialType,
                    }));
            }

            // Add optional fee if provided
            if (fee) {
                tx.Fee = fee;
            }

            // Build description
            let description = "Deposit preauthorization: ";
            if (authorize) {
                description += `authorize ${authorize}`;
            } else if (authorizeCredentials) {
                description += `authorize credentials`;
            } else if (unauthorize) {
                description += `unauthorize ${unauthorize}`;
            } else if (unauthorizeCredentials) {
                description += `unauthorize credentials`;
            }

            const result = await executor.prepare(tx, {
                walletName,
                useTestnet,
                toolName: "deposit-preauth",
                summary: {
                    transactionType: "DepositPreauth",
                    fromAddress: "",
                    toAddress: authorize || unauthorize,
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
                        text: `Error setting deposit preauthorization: ${
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
