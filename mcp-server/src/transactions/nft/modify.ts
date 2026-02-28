import { Client, Wallet } from "xrpl";
import { z } from "zod";
import { server } from "../../server/server.js";
import { getXrplClient } from "../../core/services/clients.js";
import { MAINNET_URL, TESTNET_URL } from "../../core/constants.js";
import { connectedWallet, isConnectedToTestnet } from "../../core/state.js";

// Helper to convert string to hex
const toHex = (str: string) => Buffer.from(str, "utf-8").toString("hex");

server.registerTool(
    "nft-modify",
    {
        title: "Modify NFT",
        description: "Modify the URI of a dynamic NFT (dNFT) on the XRP Ledger. The NFT must have been minted with the tfMutable flag enabled. Only the issuer or their authorized minter can modify the URI.",
        inputSchema: {
            fromSeed: z
                .string()
                .optional()
                .describe(
                    "Optional seed of the issuer's or authorized minter's wallet. If not provided, the connected wallet will be used."
                ),
            nftokenID: z
                .string()
                .describe(
                    "The NFTokenID of the NFT to modify (64-character hex string). The NFT must have tfMutable flag set."
                ),
            uri: z
                .string()
                .optional()
                .describe(
                    "The new URI for the NFT. Can be an HTTPS URL, IPFS URI, or any other URI format (max 256 bytes). Will be hex-encoded. If empty, the URI will be cleared."
                ),
            owner: z
                .string()
                .optional()
                .describe(
                    "Optional: The account that owns the NFT. Required if the issuer is different from the current owner."
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
        nftokenID,
        uri,
        owner,
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
                TransactionType: "NFTokenModify",
                Account: wallet.address,
                NFTokenID: nftokenID,
            };

            if (uri !== undefined) {
                if (uri === "") {
                    // Empty string clears the URI
                    tx.URI = "";
                } else {
                    tx.URI = toHex(uri);
                }
            }

            if (owner) {
                tx.Owner = owner;
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
                                nftokenID,
                                newUri: uri ?? "(unchanged)",
                                newUriHex: uri ? toHex(uri) : "(unchanged)",
                                modifiedBy: wallet.address,
                                owner: owner ?? wallet.address,
                                note: "NFT URI successfully updated. The NFT must have tfMutable flag for this to work.",
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
                        text: `Error modifying NFT: ${
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
