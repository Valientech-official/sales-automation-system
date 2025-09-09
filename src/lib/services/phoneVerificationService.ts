/**
 * Phone Verification Service
 * Provides comprehensive phone number verification using Brave Search API
 */

import { BraveSearchTool } from './braveSearchTool';

export interface PhoneVerificationResult {
  phone: string;
  company: string;
  verified: boolean;
  confidence: number;
  sources: string[];
  details: {
    phoneFormatValid: boolean;
    companyAssociated: boolean;
    multipleSourcesFound: boolean;
    businessListingFound: boolean;
  };
}

export class PhoneVerificationService {
  private braveSearch: BraveSearchTool;

  constructor() {
    this.braveSearch = new BraveSearchTool();
  }

  /**
   * Main phone verification method
   */
  async verifyPhone(phone: string, company: string): Promise<PhoneVerificationResult> {
    console.log(`📞 電話番号検証開始: ${phone} - ${company}`);

    // 1. 電話番号フォーマット検証
    const phoneFormatValid = this.validatePhoneFormat(phone);
    console.log(`📋 フォーマット検証: ${phoneFormatValid ? '✅' : '❌'}`);
    
    // 2. 企業関連付け検証
    const associationResults = await this.verifyCompanyAssociation(phone, company);
    console.log(`🔗 企業関連付け: ${associationResults.companyAssociated ? '✅' : '❌'}`);
    
    // 3. ビジネスリスティング確認
    const listingResults = await this.checkBusinessListings(phone, company);
    console.log(`🏢 ビジネスリスティング: ${listingResults.businessListingFound ? '✅' : '❌'}`);
    
    // 4. 信頼性スコア算出
    const confidence = this.calculateConfidence({
      phoneFormatValid,
      ...associationResults,
      ...listingResults
    });

    const result = {
      phone,
      company,
      verified: confidence >= 70,
      confidence,
      sources: [...associationResults.sources, ...listingResults.sources],
      details: {
        phoneFormatValid,
        companyAssociated: associationResults.companyAssociated,
        multipleSourcesFound: associationResults.sources.length > 1,
        businessListingFound: listingResults.businessListingFound
      }
    };

    console.log(`📊 検証結果: 信頼度 ${confidence}% (${result.verified ? '認証済み' : '未認証'})`);
    return result;
  }

  /**
   * Validate Japanese phone number format
   */
  private validatePhoneFormat(phone: string): boolean {
    const patterns = [
      /^0\d{1,4}-\d{1,4}-\d{3,4}$/, // 0X-XXXX-XXXX
      /^0\d{9,10}$/, // 0XXXXXXXXX
      /^\+81-\d{1,4}-\d{1,4}-\d{3,4}$/, // +81-X-XXXX-XXXX
      /^0\d{2,4}\s\d{1,4}\s\d{3,4}$/, // 0XX XXXX XXXX (space separated)
    ];
    
    const cleanPhone = phone.replace(/[^\d\-\+]/g, '');
    return patterns.some(pattern => pattern.test(cleanPhone));
  }

  /**
   * Verify company association with phone number
   */
  private async verifyCompanyAssociation(phone: string, company: string): Promise<{
    companyAssociated: boolean;
    sources: string[];
  }> {
    const cleanPhone = phone.replace(/[-\s()]/g, '');
    const sources: string[] = [];
    let companyAssociated = false;

    // 複数パターンで検索
    const searchQueries = [
      `"${phone}" "${company}"`, // 完全一致
      `"${cleanPhone}" "${company}"`, // クリーン版
      `${company} 電話番号 ${phone}`, // 自然語
      `${company} TEL ${phone}`, // TEL表記
      `${company} お問い合わせ ${phone}`, // お問い合わせ
      `"${company}" 連絡先 "${phone}"`, // 連絡先
      `${company} 代表 ${phone}`, // 代表電話
      `${company} 本社 ${phone}` // 本社電話
    ];

    for (const query of searchQueries) {
      try {
        console.log(`🔍 検索中: ${query}`);
        await this.braveSearch.rateLimitDelay();
        
        const result = await this.braveSearch.braveSearch(query, {
          count: 10,
          country: 'JP',
          search_lang: 'ja'
        });

        for (const item of result.results) {
          const text = `${item.title} ${item.description}`.toLowerCase();
          const companyName = company.toLowerCase();
          
          // 企業名と電話番号の共起確認
          const hasCompany = text.includes(companyName);
          const hasPhone = text.includes(phone) || text.includes(cleanPhone);
          
          if (hasCompany && hasPhone) {
            companyAssociated = true;
            sources.push(item.url);
            console.log(`✅ 関連付け発見: ${item.title}`);
            
            // 十分な証拠が見つかったら早期終了
            if (sources.length >= 3) break;
          }
        }
        
        if (companyAssociated && sources.length >= 2) break;
        
      } catch (error) {
        console.error(`❌ 電話番号検索エラー [${query}]:`, error);
        continue;
      }
    }

    return {
      companyAssociated,
      sources: [...new Set(sources)].slice(0, 5) // 重複除去、最大5件
    };
  }

  /**
   * Check business listings for phone number
   */
  private async checkBusinessListings(phone: string, company: string): Promise<{
    businessListingFound: boolean;
    sources: string[];
  }> {
    const sources: string[] = [];
    let businessListingFound = false;

    // ビジネスリスティングサイトでの検索
    const businessQueries = [
      `site:itp.ne.jp "${company}" "${phone}"`, // iタウンページ
      `site:mapion.co.jp "${company}" "${phone}"`, // マピオン
      `site:google.com/maps "${company}" "${phone}"`, // Google Maps
      `site:ekiten.jp "${company}" "${phone}"`, // エキテン
      `"${company}" "${phone}" 営業時間`, // 営業時間情報
      `"${company}" "${phone}" 住所`, // 住所情報
      `"${company}" "${phone}" アクセス` // アクセス情報
    ];

    for (const query of businessQueries) {
      try {
        console.log(`🏢 ビジネスリスティング検索: ${query}`);
        await this.braveSearch.rateLimitDelay();
        
        const result = await this.braveSearch.braveSearch(query, {
          count: 5,
          country: 'JP',
          search_lang: 'ja'
        });

        for (const item of result.results) {
          // ビジネスリスティングサイトの判定
          if (this.isBusinessListingSite(item.url)) {
            businessListingFound = true;
            sources.push(item.url);
            console.log(`🏢 ビジネスリスティング発見: ${item.url}`);
          }
        }
        
      } catch (error) {
        console.error(`❌ ビジネスリスティング検索エラー [${query}]:`, error);
        continue;
      }
    }

    return {
      businessListingFound,
      sources: [...new Set(sources)]
    };
  }

  /**
   * Check if URL is from a business listing site
   */
  private isBusinessListingSite(url: string): boolean {
    const businessSites = [
      'itp.ne.jp', // iタウンページ
      'mapion.co.jp', // マピオン
      'google.com/maps', // Google Maps
      'yelp.com', // Yelp
      'foursquare.com', // Foursquare
      'facebook.com', // Facebook
      'navi.co.jp', // ぐるなび系
      'hotpepper.jp', // ホットペッパー
      'ekiten.jp', // エキテン
      'navitime.co.jp', // ナビタイム
      'rjcorp.jp', // 企業情報サイト
      'qr-official.com' // QR公式
    ];
    
    return businessSites.some(site => url.includes(site));
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(factors: {
    phoneFormatValid: boolean;
    companyAssociated: boolean;
    sources: string[];
    businessListingFound: boolean;
  }): number {
    let score = 0;

    // 電話番号フォーマット（基本点）
    if (factors.phoneFormatValid) {
      score += 20;
    }

    // 企業関連付け（最重要）
    if (factors.companyAssociated) {
      score += 40;
    }

    // 情報源の数（複数ソースで信頼性向上）
    const sourcePoints = Math.min(30, factors.sources.length * 10);
    score += sourcePoints;

    // ビジネスリスティング（公的性）
    if (factors.businessListingFound) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Batch phone verification for efficiency
   */
  async verifyMultiplePhones(phoneCompanyPairs: Array<{phone: string, company: string}>): Promise<PhoneVerificationResult[]> {
    console.log(`📞 バッチ電話番号検証開始: ${phoneCompanyPairs.length}件`);
    const results: PhoneVerificationResult[] = [];
    
    for (let i = 0; i < phoneCompanyPairs.length; i++) {
      const pair = phoneCompanyPairs[i];
      
      try {
        console.log(`📞 処理中 ${i + 1}/${phoneCompanyPairs.length}: ${pair.company}`);
        
        const result = await this.verifyPhone(pair.phone, pair.company);
        results.push(result);
        
        // レート制限対応（検証間隔）
        if (i < phoneCompanyPairs.length - 1) {
          console.log('⏳ レート制限待機中...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ 電話番号検証エラー [${pair.company}]:`, error);
        
        // エラー時のフォールバック結果
        results.push({
          phone: pair.phone,
          company: pair.company,
          verified: false,
          confidence: 0,
          sources: [],
          details: {
            phoneFormatValid: this.validatePhoneFormat(pair.phone),
            companyAssociated: false,
            multipleSourcesFound: false,
            businessListingFound: false
          }
        });
      }
    }
    
    console.log(`✅ バッチ検証完了: ${results.filter(r => r.verified).length}/${results.length} 認証済み`);
    return results;
  }

  /**
   * Quick format validation only
   */
  quickValidateFormat(phone: string): boolean {
    return this.validatePhoneFormat(phone);
  }

  /**
   * Extract phone numbers from text
   */
  extractPhoneNumbers(text: string): string[] {
    const patterns = [
      /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g,
      /\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g
    ];
    
    const phones: string[] = [];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        phones.push(...matches);
      }
    }
    
    return [...new Set(phones)]; // 重複除去
  }
}