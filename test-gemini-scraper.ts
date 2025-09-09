/**
 * LLM Scraper + Gemini テストスクリプト
 * 企業情報検索のプロトタイプ実装
 */

import { chromium } from 'playwright'
import { z } from 'zod'
import { google } from '@ai-sdk/google'
import LLMScraper from 'llm-scraper'
import dotenv from 'dotenv'

// 環境変数読み込み
dotenv.config({ path: '.env.local' })

// 企業情報のスキーマ定義
const companySchema = z.object({
  companyName: z.string().describe("企業の正式名称（株式会社等の法人格を含む）"),
  phoneNumber: z.string().optional().describe("代表電話番号（日本の形式：03-1234-5678）"),
  email: z.string().optional().describe("代表メールアドレス"),
  website: z.string().optional().describe("公式ウェブサイトのURL"),
  address: z.string().optional().describe("本社所在地の住所"),
  confidence: z.number().min(0).max(100).describe("抽出した情報の信頼度（0-100の数値）")
})

type CompanyInfo = z.infer<typeof companySchema>

class GeminiCompanySearchService {
  private browser: any
  private scraper: LLMScraper
  
  constructor() {
    // Gemini 1.5 Proを使用（日本語対応が優秀）
    const gemini = google('gemini-1.5-pro', {
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
    })
    
    this.scraper = new LLMScraper(gemini)
  }
  
  async init() {
    console.log('🚀 ブラウザ初期化中...')
    this.browser = await chromium.launch({ 
      headless: false, // デバッグのため表示
      slowMo: 1000 // 動作をゆっくりに
    })
  }
  
  async searchCompany(companyName: string, location: string = "東京"): Promise<CompanyInfo | null> {
    const page = await this.browser.newPage()
    
    try {
      console.log(`🔍 検索開始: ${companyName} (${location})`)
      
      // DuckDuckGoで検索
      await page.goto('https://duckduckgo.com/')
      await page.waitForTimeout(2000)
      
      const searchQuery = `"${companyName}" "${location}" 連絡先 電話番号 会社概要`
      console.log(`🔎 検索クエリ: ${searchQuery}`)
      
      await page.fill('input[name="q"]', searchQuery)
      await page.press('input[name="q"]', 'Enter')
      await page.waitForTimeout(5000)
      
      console.log('🤖 Gemini AI分析中...')
      
      // LLM ScraperでGemini分析
      const result = await this.scraper.run(page, companySchema, {
        format: 'html'
      })
      
      console.log('✅ 分析完了:', result)
      return result
      
    } catch (error) {
      console.error(`❌ エラー [${companyName}]:`, error.message)
      return null
    } finally {
      await page.close()
    }
  }
  
  async testMultipleCompanies() {
    const testCompanies = [
      { name: "株式会社リクルート", location: "東京" },
      { name: "楽天株式会社", location: "東京" },
      { name: "株式会社サイバーエージェント", location: "東京" }
    ]
    
    console.log(`📋 ${testCompanies.length}社のテスト開始\n`)
    
    const results: CompanyInfo[] = []
    
    for (let i = 0; i < testCompanies.length; i++) {
      const company = testCompanies[i]
      console.log(`\n📊 ${i + 1}/${testCompanies.length}: ${company.name}`)
      console.log('=' .repeat(50))
      
      const result = await this.searchCompany(company.name, company.location)
      
      if (result && result.confidence >= 70) {
        results.push(result)
        console.log(`🎯 成功: 信頼度 ${result.confidence}%`)
        console.log(`📞 電話番号: ${result.phoneNumber || 'なし'}`)
        console.log(`📧 メール: ${result.email || 'なし'}`)
        console.log(`🌐 サイト: ${result.website || 'なし'}`)
      } else {
        console.log(`⚠️ スキップ: 信頼度不足 (${result?.confidence || 0}%)`)
      }
      
      // レート制限対策（次の検索まで待機）
      if (i < testCompanies.length - 1) {
        console.log('⏳ 次の検索まで5秒待機...')
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
    
    return results
  }
  
  async close() {
    if (this.browser) {
      await this.browser.close()
      console.log('🔐 ブラウザ終了')
    }
  }
}

// メイン実行関数
async function main() {
  console.log('🌟 LLM Scraper + Gemini テスト開始')
  console.log('=' .repeat(60))
  
  const service = new GeminiCompanySearchService()
  
  try {
    await service.init()
    
    // 単体テスト
    console.log('\n🧪 単体テスト: 株式会社リクルート')
    const singleResult = await service.searchCompany("株式会社リクルート", "東京")
    
    if (singleResult) {
      console.log('\n📋 単体テスト結果:')
      console.log(JSON.stringify(singleResult, null, 2))
    }
    
    // バッチテスト（コメントアウト - 必要に応じて有効化）
    /*
    console.log('\n🔄 バッチテスト開始')
    const batchResults = await service.testMultipleCompanies()
    
    console.log('\n📊 最終結果サマリー:')
    console.log(`✅ 成功: ${batchResults.length}社`)
    console.log(`📈 平均信頼度: ${batchResults.length > 0 ? Math.round(batchResults.reduce((sum, r) => sum + r.confidence, 0) / batchResults.length) : 0}%`)
    */
    
  } catch (error) {
    console.error('💥 致命的エラー:', error)
  } finally {
    await service.close()
  }
  
  console.log('\n🏁 テスト完了')
}

// 実行
if (require.main === module) {
  main().catch(console.error)
}

export { GeminiCompanySearchService, companySchema, type CompanyInfo }