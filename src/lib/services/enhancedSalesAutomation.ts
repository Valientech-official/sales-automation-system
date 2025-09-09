/**
 * Enhanced Sales Automation Service
 * Orchestrates the complete automation workflow with all verification services
 */

import { CompanyVerificationService, CompanyInfo } from './companyVerificationService';
import { SimpleDuplicateCheck } from './simpleDuplicateCheck';
import { PhoneVerificationService } from './phoneVerificationService';
import { DataForSeoService, JobResult } from './dataForSeoService';
import { GoogleSheetsService } from '../googleSheets';

export interface AutomationResult {
  processed: number;
  verified: number;
  saved: number;
  duplicatesSkipped: number;
  errors: number;
  highQualityCount: number;
  averageConfidence: number;
  executionTime: number;
}

export interface ProcessingStats {
  totalJobs: number;
  uniqueJobs: number;
  processedJobs: number;
  verifiedJobs: number;
  savedJobs: number;
  startTime: Date;
  endTime?: Date;
  errors: string[];
}

export class EnhancedSalesAutomationService {
  private companyVerification: CompanyVerificationService;
  private duplicateCheck: SimpleDuplicateCheck;
  private phoneVerification: PhoneVerificationService;
  private dataForSeo: DataForSeoService;
  private sheets: GoogleSheetsService;

  constructor() {
    this.companyVerification = new CompanyVerificationService();
    this.duplicateCheck = new SimpleDuplicateCheck();
    this.phoneVerification = new PhoneVerificationService();
    this.dataForSeo = new DataForSeoService();
    this.sheets = new GoogleSheetsService();
  }

  /**
   * Main automation workflow
   */
  async runAutomation(): Promise<AutomationResult> {
    const startTime = Date.now();
    const stats: ProcessingStats = {
      totalJobs: 0,
      uniqueJobs: 0,
      processedJobs: 0,
      verifiedJobs: 0,
      savedJobs: 0,
      startTime: new Date(),
      errors: []
    };

    console.log('🚀 営業リスト自動化システム開始');
    console.log('📊 重複チェックキャッシュ状況:', this.duplicateCheck.getCacheStats());

    try {
      // Phase 1: 求人データ取得
      console.log('\n📋 Phase 1: 求人データ取得');
      const jobsData = await this.dataForSeo.getJobsData();
      stats.totalJobs = jobsData.length;
      console.log(`✅ 求人データ取得完了: ${stats.totalJobs}件`);

      if (stats.totalJobs === 0) {
        console.log('⚠️ 求人データが取得できませんでした');
        return this.createAutomationResult(stats, startTime);
      }

      // Phase 2: 重複除去
      console.log('\n🔍 Phase 2: 重複チェック・除去');
      const uniqueJobs = await this.duplicateCheck.filterDuplicates(
        jobsData.map(job => ({
          company: job.employer_name,
          location: job.location,
          ...job
        }))
      );
      stats.uniqueJobs = uniqueJobs.length;
      stats.duplicatesSkipped = stats.totalJobs - stats.uniqueJobs;
      
      console.log(`✅ 重複除去完了: ${stats.uniqueJobs}件 (${stats.duplicatesSkipped}件重複をスキップ)`);

      if (stats.uniqueJobs === 0) {
        console.log('⚠️ 全て重複データでした');
        return this.createAutomationResult(stats, startTime);
      }

      // Phase 3: 企業情報収集・検証
      console.log('\n🔍 Phase 3: 企業情報収集・検証');
      const confidenceScores: number[] = [];

      for (let i = 0; i < uniqueJobs.length; i++) {
        const job = uniqueJobs[i];
        stats.processedJobs++;
        
        console.log(`\n📊 処理中 ${i + 1}/${uniqueJobs.length}: ${job.company}`);
        
        try {
          // 企業情報収集・検証
          const companyInfo = await this.companyVerification.extractAndVerifyCompany(
            job.company, 
            job.location
          );

          // 電話番号がある場合は追加検証
          if (companyInfo.phone) {
            console.log('📞 電話番号検証実行中...');
            const phoneVerification = await this.phoneVerification.verifyPhone(
              companyInfo.phone,
              companyInfo.company
            );
            
            // 検証結果をマージ
            companyInfo.verification.phoneVerified = phoneVerification.verified;
            companyInfo.verification.confidence = Math.max(
              companyInfo.verification.confidence,
              phoneVerification.confidence
            );
          }

          confidenceScores.push(companyInfo.verification.confidence);

          // 高信頼度のみ保存 (60%以上)
          if (companyInfo.verification.confidence >= 60) {
            await this.saveToSheets(companyInfo);
            
            // 重複チェックキャッシュに追加
            this.duplicateCheck.addToCache(companyInfo.company, companyInfo.location);
            
            stats.verifiedJobs++;
            stats.savedJobs++;
            
            console.log(`✅ 保存完了: 信頼度 ${companyInfo.verification.confidence}%`);
          } else {
            console.log(`⚠️ 信頼度不足でスキップ: ${companyInfo.verification.confidence}%`);
          }

          console.log(`📈 進捗: ${stats.processedJobs}/${stats.uniqueJobs} (${Math.round(stats.processedJobs/stats.uniqueJobs*100)}%)`);
          
        } catch (error) {
          console.error(`❌ 企業処理エラー [${job.company}]:`, error);
          stats.errors.push(`${job.company}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // レート制限対応
        if (i < uniqueJobs.length - 1) {
          console.log('⏳ レート制限待機 (3秒)...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      stats.endTime = new Date();
      const result = this.createAutomationResult(stats, startTime, confidenceScores);
      
      // 最終レポート
      console.log('\n📊 自動化完了レポート:');
      console.log(`📋 処理対象: ${stats.totalJobs}件`);
      console.log(`🔍 重複除去後: ${stats.uniqueJobs}件`);
      console.log(`✅ 保存完了: ${stats.savedJobs}件`);
      console.log(`📈 平均信頼度: ${result.averageConfidence.toFixed(1)}%`);
      console.log(`⏱️ 実行時間: ${(result.executionTime / 1000 / 60).toFixed(1)}分`);
      
      if (stats.errors.length > 0) {
        console.log(`❌ エラー: ${stats.errors.length}件`);
      }

      return result;

    } catch (error) {
      console.error('❌ 自動化処理で致命的エラー:', error);
      stats.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      return this.createAutomationResult(stats, startTime);
    }
  }

  /**
   * Save company information to Google Sheets
   */
  private async saveToSheets(companyInfo: CompanyInfo): Promise<void> {
    const data = {
      企業名: companyInfo.company,
      住所: companyInfo.location,
      電話番号: companyInfo.phone || '',
      ウェブサイト: companyInfo.website || '',
      メール: companyInfo.email || '',
      評価: '', // 空欄
      レビュー数: '', // 空欄
      カテゴリ: '', // 空欄
      検索条件: '自動収集',
      地域: this.extractRegion(companyInfo.location),
      取得日時: new Date().toISOString(),
      信頼度: companyInfo.verification.confidence.toString()
    };

    // Google Sheetsの既存interfaceに合わせて保存
    await this.sheets.appendSalesData(data);
  }

  /**
   * Extract region from location
   */
  private extractRegion(location: string): string {
    const prefecturePattern = /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;
    
    const match = location.match(prefecturePattern);
    return match?.[1] || location;
  }

  /**
   * Create automation result summary
   */
  private createAutomationResult(
    stats: ProcessingStats, 
    startTime: number, 
    confidenceScores: number[] = []
  ): AutomationResult {
    const executionTime = Date.now() - startTime;
    const averageConfidence = confidenceScores.length > 0 
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length 
      : 0;
    
    return {
      processed: stats.processedJobs,
      verified: stats.verifiedJobs,
      saved: stats.savedJobs,
      duplicatesSkipped: stats.duplicatesSkipped,
      errors: stats.errors.length,
      highQualityCount: confidenceScores.filter(score => score >= 80).length,
      averageConfidence,
      executionTime
    };
  }

  /**
   * Get system status for monitoring
   */
  async getSystemStatus(): Promise<{
    cacheStats: any;
    sheetsConnection: boolean;
    apiConnections: {
      dataForSeo: boolean;
      braveSearch: boolean;
      gemini: boolean;
    };
  }> {
    const cacheStats = this.duplicateCheck.getCacheStats();
    
    // API接続テスト
    let sheetsConnection = false;
    let dataForSeoConnection = false;
    let braveSearchConnection = false;
    let geminiConnection = false;

    try {
      // Google Sheets接続テスト
      await this.sheets.getSalesData();
      sheetsConnection = true;
    } catch (error) {
      console.error('Google Sheets接続エラー:', error);
    }

    try {
      // DataForSEO接続テスト（軽量リクエスト）
      const testSearch = await this.dataForSeo.searchGoogle('test', 1);
      dataForSeoConnection = true;
    } catch (error) {
      console.error('DataForSEO接続エラー:', error);
    }

    try {
      // Brave Search接続テスト
      const testBrave = await this.companyVerification['braveSearch'].braveSearch('test', { count: 1 });
      braveSearchConnection = true;
    } catch (error) {
      console.error('Brave Search接続エラー:', error);
    }

    try {
      // Gemini接続テスト（環境変数チェック）
      geminiConnection = !!process.env.GEMINI_API_KEY;
    } catch (error) {
      console.error('Gemini接続エラー:', error);
    }

    return {
      cacheStats,
      sheetsConnection,
      apiConnections: {
        dataForSeo: dataForSeoConnection,
        braveSearch: braveSearchConnection,
        gemini: geminiConnection
      }
    };
  }

  /**
   * Manual cache refresh
   */
  async refreshCache(): Promise<void> {
    console.log('🔄 手動キャッシュリフレッシュ開始');
    this.duplicateCheck.clearCache();
    
    // 次回実行時に自動リフレッシュされる
    console.log('✅ キャッシュクリア完了');
  }

  /**
   * Test run with limited scope
   */
  async testRun(maxCompanies: number = 3): Promise<AutomationResult> {
    console.log(`🧪 テスト実行開始 (最大${maxCompanies}社)`);
    
    const startTime = Date.now();
    const stats: ProcessingStats = {
      totalJobs: 0,
      uniqueJobs: 0,
      processedJobs: 0,
      verifiedJobs: 0,
      savedJobs: 0,
      startTime: new Date(),
      errors: []
    };

    try {
      // 少数のサンプルデータで実行
      const jobsData = await this.dataForSeo.getJobsData();
      const limitedJobs = jobsData.slice(0, maxCompanies);
      
      stats.totalJobs = limitedJobs.length;
      console.log(`📋 テストデータ: ${stats.totalJobs}件`);

      const uniqueJobs = await this.duplicateCheck.filterDuplicates(
        limitedJobs.map(job => ({
          company: job.employer_name,
          location: job.location,
          ...job
        }))
      );
      
      stats.uniqueJobs = uniqueJobs.length;
      
      const confidenceScores: number[] = [];

      for (const job of uniqueJobs) {
        stats.processedJobs++;
        console.log(`🧪 テスト処理: ${job.company}`);
        
        try {
          const companyInfo = await this.companyVerification.extractAndVerifyCompany(
            job.company, 
            job.location
          );

          confidenceScores.push(companyInfo.verification.confidence);
          
          if (companyInfo.verification.confidence >= 60) {
            stats.verifiedJobs++;
            // テスト実行では実際には保存しない
            console.log(`✅ テスト成功: 信頼度 ${companyInfo.verification.confidence}%`);
          }
          
        } catch (error) {
          console.error(`❌ テストエラー:`, error);
          stats.errors.push(`${job.company}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return this.createAutomationResult(stats, startTime, confidenceScores);
      
    } catch (error) {
      console.error('❌ テスト実行エラー:', error);
      stats.errors.push(`Test error: ${error instanceof Error ? error.message : String(error)}`);
      return this.createAutomationResult(stats, startTime);
    }
  }
}