/**
 * Simple Duplicate Check Service
 * Provides absolute duplicate checking with memory cache optimization
 */

import { GoogleSheetsService, SalesListItem } from '../googleSheets';

export class SimpleDuplicateCheck {
  private memoryCache = new Map<string, boolean>();
  private sheets: GoogleSheetsService;
  private cacheExpiry = 30 * 60 * 1000; // 30分
  private lastCacheUpdate = 0;

  constructor() {
    this.sheets = new GoogleSheetsService();
  }

  /**
   * Absolute duplicate check - 絶対的な重複判定
   */
  async isDuplicate(company: string, location: string): Promise<boolean> {
    const key = this.createSimpleKey(company, location);
    
    // メモリキャッシュチェック（高速）
    if (this.isValidCache() && this.memoryCache.has(key)) {
      return this.memoryCache.get(key)!;
    }

    // Google Sheets チェック（確実）
    try {
      await this.refreshCacheIfNeeded();
      return this.memoryCache.get(key) || false;
      
    } catch (error) {
      console.error('重複チェックエラー:', error);
      // エラー時は重複なしとして処理継続（安全側に倒す）
      return false;
    }
  }

  /**
   * Batch duplicate filtering - バッチ重複除去
   */
  async filterDuplicates<T extends {company: string, location: string}>(
    items: T[]
  ): Promise<T[]> {
    try {
      // 既存データを一度だけ取得してキャッシュ更新
      await this.refreshCache();

      // 高速フィルタリング
      return items.filter(item => {
        const key = this.createSimpleKey(item.company, item.location);
        const isDup = this.memoryCache.get(key) || false;
        
        if (!isDup) {
          // 新規アイテムをキャッシュに追加（今後の重複防止）
          this.memoryCache.set(key, false);
        }
        
        return !isDup;
      });

    } catch (error) {
      console.error('バッチ重複チェックエラー:', error);
      // エラー時は全てを通す（データ損失を防ぐ）
      return items;
    }
  }

  /**
   * Add new entry to cache (after successful save)
   */
  addToCache(company: string, location: string): void {
    const key = this.createSimpleKey(company, location);
    this.memoryCache.set(key, true);
  }

  /**
   * Simple key generation with minimal normalization
   */
  private createSimpleKey(company: string, location: string): string {
    // 企業名正規化（最小限）
    const cleanCompany = (company || '')
      .replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();
      
    // 地域正規化（最小限）
    const cleanLocation = (location || '')
      .replace(/[都道府県市区町村]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();
      
    return `${cleanCompany}__${cleanLocation}`;
  }

  /**
   * Refresh cache from Google Sheets
   */
  private async refreshCache(): Promise<void> {
    try {
      console.log('🔄 重複チェックキャッシュを更新中...');
      
      const existingData = await this.sheets.getSalesData();
      
      // キャッシュクリア
      this.memoryCache.clear();
      
      // 既存データをキャッシュに登録
      for (const row of existingData) {
        if (row.企業名 && row.住所) {
          const key = this.createSimpleKey(row.企業名, row.住所);
          this.memoryCache.set(key, true);
        }
      }
      
      this.lastCacheUpdate = Date.now();
      
      console.log(`✅ キャッシュ更新完了: ${this.memoryCache.size}件の企業データ`);
      
    } catch (error) {
      console.error('キャッシュ更新エラー:', error);
      throw error;
    }
  }

  /**
   * Refresh cache if needed (based on expiry time)
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    if (!this.isValidCache()) {
      await this.refreshCache();
    }
  }

  /**
   * Check if cache is still valid
   */
  private isValidCache(): boolean {
    return (
      this.memoryCache.size > 0 && 
      (Date.now() - this.lastCacheUpdate) < this.cacheExpiry
    );
  }

  /**
   * Clear cache manually
   */
  clearCache(): void {
    this.memoryCache.clear();
    this.lastCacheUpdate = 0;
    console.log('🗑️ 重複チェックキャッシュをクリアしました');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    lastUpdate: Date | null;
    isValid: boolean;
    expiresIn: number;
  } {
    return {
      size: this.memoryCache.size,
      lastUpdate: this.lastCacheUpdate ? new Date(this.lastCacheUpdate) : null,
      isValid: this.isValidCache(),
      expiresIn: Math.max(0, this.cacheExpiry - (Date.now() - this.lastCacheUpdate))
    };
  }

  /**
   * Batch check for debugging
   */
  async checkDuplicatesWithDetails<T extends {company: string, location: string}>(
    items: T[]
  ): Promise<Array<T & {isDuplicate: boolean, key: string}>> {
    await this.refreshCacheIfNeeded();

    return items.map(item => {
      const key = this.createSimpleKey(item.company, item.location);
      const isDuplicate = this.memoryCache.get(key) || false;
      
      return {
        ...item,
        isDuplicate,
        key
      };
    });
  }

  /**
   * Find potential duplicates within a batch (before checking against existing data)
   */
  findInternalDuplicates<T extends {company: string, location: string}>(
    items: T[]
  ): Array<{item: T, key: string, duplicateIndex: number}> {
    const seen = new Map<string, number>();
    const duplicates: Array<{item: T, key: string, duplicateIndex: number}> = [];

    items.forEach((item, index) => {
      const key = this.createSimpleKey(item.company, item.location);
      
      if (seen.has(key)) {
        duplicates.push({
          item,
          key,
          duplicateIndex: seen.get(key)!
        });
      } else {
        seen.set(key, index);
      }
    });

    return duplicates;
  }
}