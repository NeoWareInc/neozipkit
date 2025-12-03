# Compilation Notes

## Original Deployment Bytecode

The files `ABI.txt` and `Bytecode.txt` contain the **deployed** contract ABI and bytecode that match contracts already deployed on-chain. These files should **NEVER** be overwritten by the compilation script.

## Current Compilation Settings

The contract is currently compiled with:
- **Solidity Version**: 0.8.20
- **Optimizer**: Enabled (200 runs)
- **EVM Version**: Paris

## Matching Original Bytecode

**It is NOT possible to exactly match the original `Bytecode.txt`** because:

1. **Different Solidity Version**: The original bytecode was likely compiled with Solidity 0.8.19 (the contract pragma is `^0.8.19`), while current compilation uses 0.8.20 to match OpenZeppelin requirements.

2. **Different Compiler Settings**: The original deployment may have used different optimizer settings (runs, enabled/disabled) or EVM version.

3. **Different OpenZeppelin Versions**: The original deployment may have used a different version of OpenZeppelin contracts, which would affect the bytecode.

4. **Bytecode Size Difference**: The original `Bytecode.txt` is significantly larger (~48KB) than the newly compiled bytecode (~19KB), indicating different compilation settings or dependencies.

## For Future Deployments

When deploying new contracts or upgrading:

1. **Document Compiler Settings**: Always record the exact compiler settings used for each deployment:
   - Solidity version
   - Optimizer settings (enabled/disabled, runs)
   - EVM version
   - OpenZeppelin version

2. **Use Consistent Settings**: Use the same compiler settings for:
   - Compilation
   - Deployment
   - Verification

3. **Version Control**: Keep deployment records in `deployment-*.json` files with:
   - Contract address
   - Network
   - Compiler settings used
   - Deployment timestamp

4. **Preserve Original Files**: Never overwrite `ABI.txt` and `Bytecode.txt` - they represent the deployed contract. Use `ABI-compiled.txt` and `Bytecode-compiled.txt` for new compilations.

## Current Deployment Information

### Arbitrum One (Chain ID: 42161)
- **Address**: `0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60`
- **Version**: 2.10.0
- **Deployed**: 2025-11-18
- **Explorer**: https://arbiscan.io/address/0x2716c4609fD97DaEdF429BC4B4Ec2faa81e2cC60

### Other Deployments
See individual `deployment-*.json` files in the contracts directory for complete deployment information.

