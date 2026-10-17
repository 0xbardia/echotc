# Deployment

The current contract is on Studionet. An earlier deployment could create cases, but source review ended `UNDETERMINED` because validators disagreed on free-form model wording. That address is not the one the desk uses.

| Field | Value |
| --- | --- |
| Address | `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B` |
| Deployment transaction | `0x8c6aa8e55b97139bbda7ac8524b0f28a5b1a2788e871d2f3aee1c183e99b4a30` |
| Consensus | MAJORITY_AGREE |
| Execution | SUCCESS |
| Artifact | `contracts/echotrace.py` |
| Artifact SHA-256 | `8fcf378fe76e90c852307d97b4caa497be1c942a26049fb65b5350b2c2338e44` |
| Previous address | `0x8EB48E25fAE1F8b997b58e27F756FD0A7E1FB5Ce` |

Studionet’s validator set is the hosted Studio configuration. That is not a claim about independent mainnet operators.

`VITE_ECHO_CONTRACT_ADDRESS` overrides the address baked into the desk. WalletConnect still needs a real `VITE_WALLETCONNECT_PROJECT_ID`. Injected wallets can submit writes.
