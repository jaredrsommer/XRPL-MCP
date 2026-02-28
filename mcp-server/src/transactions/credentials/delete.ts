import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "credential-delete",
    {
        title: "Delete Credential",
        description: "Delete a credential from the XRP Ledger. Either the issuer or the subject can delete a credential at any time. Anyone can delete an expired credential.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet (issuer, subject, or anyone for expired credentials). If not provided, the connected wallet will be used."
                ),
            issuer: z
                .string()
                .optional()
                .describe(
                    "The account address of the credential issuer. Required if caller is not the issuer."
                ),
            subject: z
                .string()
                .optional()
                .describe(
                    "The account address of the credential subject. Required if caller is not the subject."
                ),
            credentialType: z
                .string()
                .describe(
                    "Type of credential to delete. Will be hex-encoded."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
        annotations: { destructiveHint: true },
    },
    async ({
        fromSeed,
        issuer,
        subject,
        credentialType,
        fee,
        useTestnet,
    }) => {
        let client: Client | null = null;
        try {
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

            const tx: any = {
                TransactionType: "CredentialDelete",
                Account: wallet.address,
                CredentialType: toHex(credentialType),
            };

            // Determine issuer and subject based on who is calling
            if (issuer) {
                tx.Issuer = issuer;
            }
            if (subject) {
                tx.Subject = subject;
            }

            if (fee) tx.Fee = fee;

            const prepared = await client.autofill(tx);
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
                                deletedBy: wallet.address,
                                issuer: issuer ?? wallet.address,
                                subject: subject ?? wallet.address,
                                credentialType,
                                credentialTypeHex: toHex(credentialType),
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
                        text: `Error deleting credential: ${
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
