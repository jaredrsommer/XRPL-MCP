import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../server/server.js";
import { getXrplClient } from "../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../core/state.js";

server.registerTool(
    "deposit-preauth",
    {
        title: "Deposit Preauth",
        description: "Grant or revoke preauthorization for an account to deliver payments to your account",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet to use. If not provided, the connected wallet will be used."
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
        fromSeed,
        authorize,
        authorizeCredentials,
        unauthorize,
        unauthorizeCredentials,
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
            const depositPreauthTx: any = {
                TransactionType: "DepositPreauth",
                Account: wallet.address,
            };

            // Add the appropriate authorization field
            if (authorize !== undefined) {
                depositPreauthTx.Authorize = authorize;
            } else if (authorizeCredentials !== undefined) {
                depositPreauthTx.AuthorizeCredentials =
                    authorizeCredentials.map((cred) => ({
                        Issuer: cred.issuer,
                        CredentialType: cred.credentialType,
                    }));
            } else if (unauthorize !== undefined) {
                depositPreauthTx.Unauthorize = unauthorize;
            } else if (unauthorizeCredentials !== undefined) {
                depositPreauthTx.UnauthorizeCredentials =
                    unauthorizeCredentials.map((cred) => ({
                        Issuer: cred.issuer,
                        CredentialType: cred.credentialType,
                    }));
            }

            // Add optional fee if provided
            if (fee) {
                depositPreauthTx.Fee = fee;
            }

            // Submit transaction
            const prepared = await client.autofill(depositPreauthTx);
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
                                authorize: authorize || undefined,
                                authorizeCredentials:
                                    authorizeCredentials || undefined,
                                unauthorize: unauthorize || undefined,
                                unauthorizeCredentials:
                                    unauthorizeCredentials || undefined,
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
                        text: `Error setting deposit preauthorization: ${
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
