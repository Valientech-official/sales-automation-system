/**
 * 直接Gemini API使用版
 * LLM ScraperのようなPlaywright + AI機能を自作実装
 */

import { chromium } from 'playwright'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

// 環境変数読み込み
dotenv.config({ path: '.env.local' })

// 企業情報のスキーマ定義
const companySchema = z.object({
  companyName: z.string().describe("企業の正式名称"),
  phoneNumber: z.string().nullable().optional().describe("代表電話番号"),
  email: z.string().nullable().optional().describe("メールアドレス"),
  website: z.string().nullable().optional().describe("公式サイトURL"),
  address: z.string().nullable().optional().describe("本社住所"),
  confidence: z.number().min(0).max(100).describe("情報の信頼度")
})

type CompanyInfo = z.infer<typeof companySchema>

class DirectGeminiScraper {
  private genAI: GoogleGenerativeAI
  private model: any
  private browser: any
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1, // 一貫性重視
        topP: 0.8,
        maxOutputTokens: 2048
      }
    })
  }
  
  async init() {
    console.log('🚀 ブラウザ初期化中...')
    this.browser = await chromium.launch({ 
      headless: true, // VPS環境対応
      slowMo: 100
    })
  }
  
  async extractFromHTML(htmlContent: string, companyName: string): Promise<CompanyInfo | null> {
    // HTMLを短縮（トークン制限対策）
    const cleanedHTML = htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, '') // スクリプト削除
      .replace(/<style[\s\S]*?<\/style>/gi, '')   // スタイル削除
      .replace(/<!--[\s\S]*?-->/g, '')            // コメント削除
      .replace(/\s+/g, ' ')                       // 空白正規化
      .substring(0, 15000) // 15KB制限
    
    const prompt = `
以下のHTMLコンテンツから企業情報を抽出してください。

対象企業: ${companyName}

HTMLコンテンツ:
${cleanedHTML}

以下のJSON形式で情報を返してください。情報が見つからない場合はnullまたは空文字を設定してください:

{
  "companyName": "企業の正式名称（必須）",
  "phoneNumber": "代表電話番号（日本の形式、例：03-1234-5678）またはnull",
  "email": "代表メールアドレスまたはnull",
  "website": "公式ウェブサイトURLまたはnull",
  "address": "本社住所またはnull",
  "confidence": "情報の信頼度を0-100の数値で評価"
}

JSON以外は返さないでください:
`
    
    try {
      console.log('🤖 Gemini分析中...')
      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()
      
      console.log('📝 Geminiレスポンス:', responseText.substring(0, 500))
      
      // JSONを抽出
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error('❌ JSON形式が見つかりません')
        return null
      }
      
      const data = JSON.parse(jsonMatch[0])
      
      // Zodでバリデーション
      return companySchema.parse(data)
      
    } catch (error) {
      console.error('❌ Gemini処理エラー:', error.message)
      return null
    }
  }
  
  async searchCompany(companyName: string, location: string = "東京"): Promise<CompanyInfo | null> {
    const page = await this.browser.newPage()
    
    try {
      console.log(`🔍 検索開始: ${companyName} (${location})`)
      
      // DuckDuckGoで検索
      await page.goto('https://duckduckgo.com/')
      await page.waitForTimeout(2000)
      
      const searchQuery = `"${companyName}" "${location}" 連絡先 電話番号`
      console.log(`🔎 検索クエリ: ${searchQuery}`)
      
      await page.fill('input[name="q"]', searchQuery)
      await page.press('input[name="q"]', 'Enter')
      await page.waitForTimeout(5000)
      
      // ページ内容を取得
      const htmlContent = await page.content()
      
      // Geminiで分析
      const result = await this.extractFromHTML(htmlContent, companyName)
      
      return result
      
    } catch (error) {
      console.error(`❌ 検索エラー [${companyName}]:`, error.message)
      return null
    } finally {
      await page.close()
    }
  }
  
  async testCompany(companyName: string, location: string = "東京") {
    console.log(`\n📊 テスト: ${companyName}`)
    console.log('=' .repeat(50))
    
    const result = await this.searchCompany(companyName, location)
    
    if (result) {
      console.log('✅ 抽出成功:')
      console.log(`📋 企業名: ${result.companyName}`)
      console.log(`📞 電話: ${result.phoneNumber || 'なし'}`)
      console.log(`📧 メール: ${result.email || 'なし'}`)
      console.log(`🌐 サイト: ${result.website || 'なし'}`)
      console.log(`📍 住所: ${result.address || 'なし'}`)
      console.log(`🎯 信頼度: ${result.confidence}%`)
      
      if (result.confidence >= 70) {
        console.log('🎉 高信頼度データ - 保存対象')
      } else {
        console.log('⚠️ 信頼度不足 - 要改善')
      }
    } else {
      console.log('❌ 情報抽出失敗')
    }
    
    return result
  }
  
  async close() {
    if (this.browser) {
      await this.browser.close()
      console.log('🔐 ブラウザ終了')
    }
  }
}

// メイン実行
async function main() {
  console.log('🌟 Direct Gemini Scraper テスト開始')
  console.log('=' .repeat(60))
  
  const scraper = new DirectGeminiScraper()
  
  try {
    await scraper.init()
    
    // テストケース
    const testCompanies = [
      { name: "株式会社リクルート", location: "東京" },
      // { name: "楽天株式会社", location: "東京" },
      // { name: "株式会社サイバーエージェント", location: "東京" }
    ]
    
    const results: CompanyInfo[] = []
    
    for (const company of testCompanies) {
      const result = await scraper.testCompany(company.name, company.location)
      
      if (result && result.confidence >= 70) {
        results.push(result)
      }
      
      // レート制限対応
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    console.log('\n📊 テスト結果サマリー:')
    console.log(`✅ 成功: ${results.length}件`)
    if (results.length > 0) {
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      console.log(`📈 平均信頼度: ${Math.round(avgConfidence)}%`)
    }
    
  } catch (error) {
    console.error('💥 致命的エラー:', error)
  } finally {
    await scraper.close()
  }
  
  console.log('\n🏁 テスト完了')
}

// 実行
if (require.main === module) {
  main().catch(console.error)
}

export { DirectGeminiScraper, companySchema, type CompanyInfo }