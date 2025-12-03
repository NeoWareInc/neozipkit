/**
 * WalletManagerNode - Node.js-specific wallet functionality with file system operations
 * Extends CoreWalletManager with file-based wallet management
 */

import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { CoreWalletManager } from '../core/WalletManager';
import { WalletSetupResult, WalletInfo, MintingOptions } from '../../types';
import { Logger } from '../../core/components/Logger';

/**
 * Node.js-specific wallet manager with file system operations
 */
export class WalletManagerNode extends CoreWalletManager {
  constructor() {
    super();
  }

  /**
   * Setup wallet with file system support
   */
  async setupWalletWithOptions(options: MintingOptions): Promise<WalletSetupResult> {
    try {
      let privateKey: string;
      
      if ((options as any).wallet) {
        const val = (options as any).wallet as string;
        if (fs.existsSync(val)) {
          const loaded = this.loadWalletFromFile(val);
          if (!loaded) throw new Error(`Could not load valid private key from ${val}`);
          privateKey = loaded;
        } else {
          privateKey = val;
        }
      } else {
        const existing = this.findExistingWallets();
        if (existing.length > 0) {
          const selected = existing[0];
          const relativePath = path.relative(process.cwd(), selected);
          Logger.log(`Using existing wallet: ${relativePath}`);
          const loaded = this.loadWalletFromFile(selected);
          if (!loaded) throw new Error(`Could not load valid private key from ${selected}`);
          privateKey = loaded;
        } else {
          Logger.log('No existing wallet found. Creating new wallet...');
          privateKey = await this.createNewWallet();
        }
      }

      return await super.setupWallet(privateKey, options.network, (options as any).mintToken === true);
    } catch (error) {
      Logger.error('Error setting up wallet:', error);
      return { 
        wallet: null, 
        provider: null, 
        success: false, 
        message: `Wallet setup failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Find existing wallet files
   */
  private findExistingWallets(): string[] {
    const walletFiles: string[] = [];
    const currentDir = process.cwd();
    const walletDir = path.join(currentDir, 'wallet');
    const walletFileNames = ['neozip-wallet.json'];
    
    for (const fileName of walletFileNames) {
      const filePath = path.join(currentDir, fileName);
      if (fs.existsSync(filePath)) walletFiles.push(filePath);
    }
    
    if (fs.existsSync(walletDir)) {
      for (const fileName of walletFileNames) {
        const filePath = path.join(walletDir, fileName);
        if (fs.existsSync(filePath)) walletFiles.push(filePath);
      }
    }
    
    return walletFiles;
  }

  /**
   * Load wallet from file
   * 
   * SECURITY WARNING: This method reads private keys from disk.
   * - Only use for development/testing
   * - Wallet files are automatically excluded from git via .gitignore
   * - Wallet files are excluded from NPM packages via .npmignore
   * - Use secure key management (HSMs, KMS) for production
   */
  private loadWalletFromFile(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      try {
        const walletData = JSON.parse(content);
        if (walletData.privateKey) {
          Logger.log(`Found wallet file: ${filePath}`);
          Logger.log(`Wallet address: ${walletData.address}`);
          return walletData.privateKey;
        }
      } catch {
        if (content.startsWith('0x') && content.length === 66) {
          Logger.log(`Found private key file: ${filePath}`);
          return content;
        }
      }
      return null;
    } catch (error) {
      Logger.warn(`Could not read wallet file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Create a new wallet and save to file
   * 
   * SECURITY WARNING: This method saves private keys to disk.
   * - Only use for development/testing
   * - Never commit wallet files to version control
   * - Use secure key management for production
   * - Wallet files are automatically excluded via .gitignore and .npmignore
   * - Protect file system permissions on wallet files
   */
  private async createNewWallet(): Promise<string> {
    Logger.log('Creating a new wallet...');
    const newWallet = ethers.Wallet.createRandom();
    const walletInfo: WalletInfo = { 
      address: newWallet.address, 
      privateKey: newWallet.privateKey, 
      mnemonic: newWallet.mnemonic?.phrase || "" 
    };
    
    const walletDir = path.join(process.cwd(), 'wallet');
    if (!fs.existsSync(walletDir)) fs.mkdirSync(walletDir, { recursive: true });
    
    const walletFilePath = path.join(walletDir, 'neozip-wallet.json');
    fs.writeFileSync(walletFilePath, JSON.stringify(walletInfo, null, 2));
    
    Logger.log(`New wallet created and saved to ${walletFilePath}`);
    Logger.log(`Wallet address: ${newWallet.address}`);
    Logger.log(`IMPORTANT: Please fund this wallet with testnet ETH to use for minting NFTs!`);
    Logger.log(`SECURITY: Wallet file is automatically excluded from git (.gitignore) and NPM packages (.npmignore)`);
    Logger.log(`SECURITY: Never commit wallet files to version control`);
    Logger.log(`SECURITY: Use secure key management (HSMs, KMS) for production applications`);
    
    return newWallet.privateKey;
  }

  /**
   * Detect NZIP contract from deployment file
   */
  static detectNZipContract(): string | undefined {
    const deploymentPath = path.join(process.cwd(), 'zipfile-nft-deployment.json');
    if (fs.existsSync(deploymentPath)) {
      try { 
        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')); 
        if (deploymentInfo.address) return deploymentInfo.address; 
      } catch {}
    }
    return undefined;
  }
}

// Re-export the old class name for backward compatibility
export { WalletManagerNode as ZipkitWallet };
