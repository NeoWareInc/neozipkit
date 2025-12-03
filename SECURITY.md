# Security Guidelines

This document provides comprehensive security guidelines for handling blockchain private keys and sensitive data in NeoZipKit examples and applications.

## Table of Contents

1. [Private Key Security](#private-key-security)
2. [File Security](#file-security)
3. [Development Best Practices](#development-best-practices)
4. [Production Recommendations](#production-recommendations)
5. [Incident Response](#incident-response)
6. [References](#references)

## Private Key Security

### Never Hardcode Private Keys

**CRITICAL**: Never embed private keys directly in your source code, configuration files, or commit them to version control.

**Bad Examples:**
```typescript
// ❌ NEVER DO THIS
const privateKey = "0x1234567890abcdef...";
const wallet = new ethers.Wallet(privateKey);
```

```javascript
// ❌ NEVER DO THIS
module.exports = {
  privateKey: "0x1234567890abcdef..."
};
```

**Good Examples:**
```typescript
// ✅ DO THIS
const privateKey = process.env.NEOZIP_WALLET_PASSKEY;
if (!privateKey) {
  throw new Error('Private key not found in environment variables');
}
const wallet = new ethers.Wallet(privateKey);
```

### Use Environment Variables

Store private keys in environment variables:

1. **Create `.env` file** from `.env.example` template
2. **Add your private key** to `.env` file
3. **Load environment variables** before running code
4. **Never commit `.env`** to version control

```bash
# Copy template
cp .env.example .env

# Edit .env (add your testnet private key)
# NEOZIP_WALLET_PASSKEY=0x...

# Load environment (Node.js)
export $(cat .env | xargs)
# Or use dotenv package
require('dotenv').config();
```

### Secure Key Management for Production

For production applications, use dedicated key management services:

- **AWS Secrets Manager** - Managed secrets service
- **HashiCorp Vault** - Open-source secrets management
- **Azure Key Vault** - Cloud-based key management
- **Google Cloud Secret Manager** - Secret management service
- **Hardware Security Modules (HSMs)** - Physical security for keys

### Testnet vs Mainnet Guidelines

#### Testnet (Development/Examples)

- ✅ Use testnet keys for all examples
- ✅ Use testnet keys for development and testing
- ✅ Testnet keys can have minimal test funds
- ✅ Testnet keys are lower risk if exposed

**Supported Testnets:**
- Base Sepolia (Chain ID: 84532)
- Arbitrum Sepolia (Chain ID: 421614)
- Ethereum Sepolia (Chain ID: 11155111)

#### Mainnet (Production)

- ⚠️ **NEVER** use mainnet keys in examples
- ⚠️ **NEVER** use mainnet keys for development
- ✅ Use secure key management (HSMs, KMS) for production
- ✅ Implement multi-signature wallets for production
- ✅ Use separate keys for different environments

## File Security

### Wallet File Locations

NeoZipKit's `WalletManagerNode` can create wallet files in the following locations:

- `wallet/neozip-wallet.json` - Contains private key, address, and mnemonic
- Current directory - If wallet directory doesn't exist

### Wallet File Protection

Wallet files are automatically protected:

- ✅ Excluded from git (via `.gitignore`)
- ✅ Excluded from NPM packages (via `.npmignore`)
- ⚠️ Still stored on disk - protect file system permissions
- ⚠️ Delete wallet files if no longer needed

### .env File Handling

Environment files are protected:

- ✅ `.env` excluded from git
- ✅ `.env.local` excluded from git
- ✅ `.env.*.local` excluded from git
- ✅ `.env.example` committed (template only, no real keys)

**File Permissions:**
```bash
# Restrict .env file permissions (Unix/Linux/Mac)
chmod 600 .env

# Windows: Right-click → Properties → Security → Remove unnecessary users
```

### .gitignore Exclusions

The following are automatically excluded from git:

```
wallet/           # Wallet files with private keys
*.key             # Private key files
*.pem             # Certificate/key files
secrets/          # Secrets directory
.env              # Environment files
.env.local
.env.*.local
```

### .npmignore Exclusions

The following are automatically excluded from NPM packages:

- Wallet files and directories
- Environment files
- Generated example outputs
- Development files

## Development Best Practices

### Use Testnet for Development

Always use testnet networks for development and testing:

```bash
# Set testnet network
export NEOZIP_NETWORK=base-sepolia
```

### Rotate Keys Regularly

Regularly rotate private keys to minimize risk:

1. Generate new testnet key
2. Transfer any test funds to new key
3. Update environment variables
4. Delete old wallet files

### Monitor for Exposed Secrets

Use tools to detect accidentally committed secrets:

- **GitHub Secret Scanning** - Automatically scans repositories
- **git-secrets** - Prevents committing secrets
- **truffleHog** - Scans git history for secrets
- **detect-secrets** - Detects secrets in code

### Use Hardware Wallets for Production

For production applications, consider using hardware wallets:

- **Ledger** - Hardware wallet with secure element
- **Trezor** - Open-source hardware wallet
- **HSM Integration** - Enterprise-grade key storage

### Code Review Checklist

Before committing code, verify:

- [ ] No hardcoded private keys
- [ ] No private keys in comments
- [ ] Environment variables used for secrets
- [ ] `.env` file not committed
- [ ] Wallet files not committed
- [ ] Testnet keys only (no mainnet)
- [ ] Security warnings in blockchain examples

## Production Recommendations

### Use HSMs or KMS for Production

For production applications, use Hardware Security Modules (HSMs) or Key Management Services (KMS):

**Benefits:**
- Physical and logical protection
- Access control and auditing
- Key rotation capabilities
- Compliance with security standards

**Options:**
- AWS CloudHSM
- Azure Dedicated HSM
- Google Cloud HSM
- HashiCorp Vault (with HSM backend)

### Implement Multi-Signature Wallets

For high-value operations, use multi-signature wallets:

- Require multiple approvals for transactions
- Distribute key management across team members
- Reduce single point of failure
- Enhanced security for production deployments

### Regular Key Rotation

Implement a key rotation policy:

- Rotate keys on a regular schedule (e.g., quarterly)
- Rotate keys immediately after exposure
- Rotate keys when team members leave
- Document rotation procedures

### Access Control and Auditing

Implement proper access control:

- **Principle of Least Privilege** - Grant minimum necessary access
- **Role-Based Access Control (RBAC)** - Assign roles with specific permissions
- **Audit Logging** - Log all key access and usage
- **Monitoring** - Monitor for unauthorized access

### Production Deployment Checklist

Before deploying to production:

- [ ] Use secure key management (HSM/KMS)
- [ ] Implement multi-signature wallets
- [ ] Set up access control and auditing
- [ ] Document key rotation procedures
- [ ] Test incident response procedures
- [ ] Review security architecture
- [ ] Conduct security audit
- [ ] Set up monitoring and alerts

## Incident Response

### What to Do If Keys Are Exposed

If you discover that a private key has been exposed:

#### Immediate Actions

1. **Assess the Risk**
   - Determine if the key is testnet or mainnet
   - Check if the key has been used
   - Review git history to see exposure scope

2. **Rotate the Key Immediately**
   - Generate a new private key
   - Transfer any funds to the new key
   - Update all systems with the new key

3. **Remove from Git History**
   ```bash
   # Option 1: Use git filter-branch
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   
   # Option 2: Use BFG Repo-Cleaner (recommended)
   # Download from https://rtyley.github.io/bfg-repo-cleaner/
   bfg --delete-files wallet/neozip-wallet.json
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```

4. **Force Push to Remote** (if necessary)
   ```bash
   # WARNING: This rewrites history - coordinate with team
   git push origin --force --all
   git push origin --force --tags
   ```

5. **Check for Unauthorized Access**
   - Monitor wallet address for transactions
   - Check blockchain explorer for activity
   - Review access logs if available

6. **Notify Team**
   - Inform team members immediately
   - Coordinate response actions
   - Document the incident

#### Post-Incident Actions

1. **Review Security Practices**
   - Identify how the exposure occurred
   - Update procedures to prevent recurrence
   - Enhance security measures

2. **Update Documentation**
   - Document the incident
   - Update security guidelines
   - Share lessons learned

3. **Conduct Security Audit**
   - Review all code for similar issues
   - Scan git history for other exposures
   - Implement additional safeguards

### Key Rotation Procedures

When rotating keys:

1. **Generate New Key**
   ```bash
   # Using ethers.js
   const newWallet = ethers.Wallet.createRandom();
   console.log('New address:', newWallet.address);
   console.log('New private key:', newWallet.privateKey);
   ```

2. **Fund New Key** (if needed)
   - Transfer test funds to new address
   - Verify balance on blockchain explorer

3. **Update Systems**
   - Update `.env` file with new key
   - Update all deployment environments
   - Update CI/CD secrets

4. **Delete Old Key**
   - Remove from `.env` file
   - Delete old wallet files
   - Remove from all systems

5. **Verify New Key Works**
   - Test with a small transaction
   - Verify all systems are using new key
   - Monitor for any issues

### Monitoring and Detection

Set up monitoring to detect key exposure:

- **GitHub Secret Scanning** - Automatically enabled for public repos
- **Git Hooks** - Pre-commit hooks to detect secrets
- **CI/CD Checks** - Automated secret scanning in pipelines
- **Blockchain Monitoring** - Monitor wallet addresses for unexpected activity

## References

### Industry Best Practices

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - Web application security risks
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Cybersecurity guidelines
- [Ethereum Security Best Practices](https://consensys.github.io/smart-contract-best-practices/) - Smart contract security

### Security Tools

- **git-secrets** - Prevents committing secrets to git
- **truffleHog** - Scans git history for secrets
- **detect-secrets** - Detects secrets in code
- **GitGuardian** - Secret scanning service
- **Snyk** - Security vulnerability scanning

### Additional Resources

- [Hardhat Security Best Practices](https://hardhat.org/docs/best-practices)
- [ethers.js Documentation](https://docs.ethers.org/) - Secure wallet usage
- [OpenZeppelin Security](https://www.openzeppelin.com/security-audits) - Smart contract security
- [ConsenSys Security Best Practices](https://consensys.github.io/smart-contract-best-practices/)

### Getting Help

If you discover a security vulnerability:

1. **Do NOT** create a public issue
2. **Email** security@neoware.com (if available)
3. **Use** GitHub Security Advisories (if available)
4. **Follow** responsible disclosure practices

---

**Remember**: Security is an ongoing process. Regularly review and update your security practices, stay informed about new threats, and always prioritize the protection of private keys and sensitive data.

