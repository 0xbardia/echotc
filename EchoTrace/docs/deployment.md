# Deployment

The current contract is on Studionet. An earlier deployment could create cases, but source review ended `UNDETERMINED` because validators disagreed on free-form model wording. That address is not the one the desk uses.

| Field | Value |
| --- | --- |
| Address | `0x3Af6aD96e89A8B120A329cc472b2B52D1E55E319` |
| Deployment transaction | `0xae2d2c64ea7b7670996c70e117248b6b471d00977446e4481de54fa43240aac2` |
| Consensus | MAJORITY_AGREE |
| Execution | SUCCESS |
| Artifact | `contracts/echotrace.py` |
| Artifact SHA-256 | `ccc59986e57bb5ef8570d87fdd4d5943f4de8eb50257d9ae5c6ed168a5aca616` |
| Authoritative QA Case | `et-c3a20529e6a1` (owner `0x39cCdcf2338CE3D6c8F345A0ebb11a19F193EAbA`, finalized complete) |
| Historical address 1 | `0x0BcE79508f7705412D6c6E83750D12547715DB53` |
| Historical address 0 | `0xCABcFaBC7a76d602b8c4b0Aed367853155aDe59B` |

Studionet’s validator set is the hosted Studio configuration. That is not a claim about independent mainnet operators.

`VITE_ECHO_CONTRACT_ADDRESS` overrides the address baked into the desk. WalletConnect still needs a real `VITE_WALLETCONNECT_PROJECT_ID`. Injected wallets can submit writes.
