import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// MPTokenAuthorize flags
const MPTokenAuthorizeFlags = {
    tfMPTUnauthorize: 0x0001,  // Remove authorization (issuer) or opt out (holder)
};

server.registerTool(
    "mpt-authorize",
    {
        title: "Authorize MPT",
        description: "Authorize an account to hold a Multi-Purpose Token (MPT), or as a holder, opt-in to hold an MPT. For MPTs with requireAuth flag, issuers must authorize holders before they can receive tokens.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the wallet. If not provided, the connected wallet will be used."
                ),
            mptIssuanceID: z
                .string()
                .describe(
                    "The MPTokenIssuanceID of the MPT (64-character hex string)."
                ),
            holder: z
                .string()
                .optional()
                .describe(
                    "The account address to authorize. Only used when the transaction sender is the issuer authorizing a holder. Omit when opting in as a holder."
                ),
            unauthorize: z
                .boolean()
                .optional()
                .describe(
                    "If true, remove the authorization (issuer) or opt out of holding the token (holder). Default is false (authorize/opt-in)."
                ),
            fee: z.string().optional().describe("Transaction fee in drops"),
            useTestnet: z
                .boolean()
                .optional()
                .describe(
                    "Whether to use the testnet (true) or mainnet (false)."
                ),

        },
    },
    async ({
        fromSeed,
        mptIssuanceID,
        holder,
        unauthorize,
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
                TransactionType: "MPTokenAuthorize",
                Account: wallet.address,
                MPTokenIssuanceID: mptIssuanceID,
            };

            if (holder) {
                tx.Holder = holder;
            }

            if (unauthorize) {
                tx.Flags = MPTokenAuthorizeFlags.tfMPTUnauthorize;
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

            const action = unauthorize
                ? (holder ? "unauthorized holder" : "opted out")
                : (holder ? "authorized holder" : "opted in");

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                status,
                                hash: result.result.hash,
                                mptIssuanceID,
                                account: wallet.address,
                                holder: holder ?? null,
                                action,
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
                        text: `Error with MPT authorization: ${
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
