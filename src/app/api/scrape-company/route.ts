/**
 * Playwright + Gemini Company Scraper API Endpoint
 * Vercel serverless function for job-focused company information extraction
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getPlaywrightBrowser } from '@/lib/playwright-config'

// レスポンススキーマ
const companySchema = z.object({
  companyName: z.string().describe("企業の正式名称"),
  phoneNumber: z.string().nullable().optional().describe("代表電話番号または採用連絡先"),
  email: z.string().nullable().optional().describe("メールアドレス"),
  website: z.string().nullable().optional().describe("公式サイトURL"),
  address: z.string().nullable().optional().describe("本社住所"),
  businessType: z.string().nullable().optional().describe("事業内容・業界"),
  confidence: z.number().min(0).max(100).describe("情報の信頼度")
})

type CompanyInfo = z.infer<typeof companySchema>

class VercelGeminiScraper {
  private genAI: GoogleGenerativeAI
  private model: any
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 2048
      }
    })
  }
  
  async extractFromHTML(htmlContent: string, companyName: string): Promise<CompanyInfo | null> {
    const cleanedHTML = htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 15000)
    
    const prompt = `
以下のHTMLコンテンツから企業情報を抽出してください。これは求人サイトや採用情報ページのコンテンツです。

対象企業: ${companyName}

HTMLコンテンツ:
${cleanedHTML}

求人情報から以下の企業情報を抽出してください:
- 企業の正式名称
- 代表電話番号（応募連絡先や人事部連絡先も含む）
- メールアドレス（採用担当者や人事部メール含む）
- 公式ウェブサイトURL
- 本社住所（勤務地情報からも推測）
- 事業内容（業界・業種情報）

以下のJSON形式で情報を返してください:

{
  "companyName": "企業の正式名称（必須）",
  "phoneNumber": "代表電話番号または採用連絡先電話番号（日本の形式、例：03-1234-5678）またはnull",
  "email": "代表メールアドレスまたは採用担当メールアドレスまたはnull",
  "website": "公式ウェブサイトURLまたはnull",
  "address": "本社住所または主要勤務地住所またはnull",
  "businessType": "事業内容・業界またはnull",
  "confidence": "情報の信頼度を0-100の数値で評価（求人情報なので通常60-90）"
}

JSON以外は返さないでください:
`
    
    try {
      console.log('🤖 Gemini分析開始')
      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error('❌ JSON形式が見つかりません')
        return null
      }
      
      const data = JSON.parse(jsonMatch[0])
      return companySchema.parse(data)
      
    } catch (error) {
      console.error('❌ Gemini処理エラー:', error instanceof Error ? error.message : String(error))
      return null
    }
  }
  
  async searchCompany(companyName: string, location: string = "東京"): Promise<CompanyInfo | null> {
    const browser = await getPlaywrightBrowser()
    const page = await browser.newPage()
    
    try {
      console.log(`🔍 検索開始: ${companyName} (${location})`)
      
      // DuckDuckGoで求人情報を検索
      await page.goto('https://duckduckgo.com/')
      await page.waitForTimeout(2000)
      
      const searchQuery = `"${companyName}" 求人 採用情報 site:indeed.com OR site:rikunabi.com OR site:mynavi.jp`
      console.log(`🔎 検索クエリ: ${searchQuery}`)
      
      await page.fill('input[name="q"]', searchQuery)
      await page.press('input[name="q"]', 'Enter')
      await page.waitForTimeout(5000)
      
      // 検索結果から最初の求人リンクをクリック
      try {
        const resultLinks = await page.locator('a[data-testid="result-title-a"]').all()
        console.log(`🔗 検索結果リンク数: ${resultLinks.length}`)
        
        if (resultLinks.length > 0) {
          const firstLink = resultLinks[0]
          const linkText = await firstLink.textContent()
          console.log(`🌐 クリック対象: ${linkText}`)
          
          await firstLink.click()
          await page.waitForTimeout(5000)
        }
      } catch (e) {
        console.log('🔄 検索結果リンククリック失敗')
      }
      
      // ページ内容を取得
      const htmlContent = await page.content()
      console.log(`📊 HTML長: ${htmlContent.length} characters`)
      
      // Geminiで分析
      const result = await this.extractFromHTML(htmlContent, companyName)
      
      return result
      
    } catch (error) {
      console.error(`❌ 検索エラー [${companyName}]:`, error instanceof Error ? error.message : String(error))
      return null
    } finally {
      await page.close()
      await browser.close()
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('🚀 Playwright + Gemini スクレーパー開始')
    
    const body = await request.json()
    const { companyName, location = "東京" } = body
    
    if (!companyName) {
      return NextResponse.json({
        success: false,
        error: 'companyName is required'
      }, { status: 400 })
    }
    
    console.log(`📋 対象企業: ${companyName} (${location})`)
    
    const scraper = new VercelGeminiScraper()
    const result = await scraper.searchCompany(companyName, location)
    
    const endTime = Date.now()
    const executionTime = endTime - startTime
    
    if (result) {
      console.log('✅ 抽出成功')
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        executionTime: {
          milliseconds: executionTime,
          seconds: Math.round(executionTime / 1000)
        },
        data: result,
        source: 'playwright-gemini-scraper'
      })
    } else {
      console.log('❌ 抽出失敗')
      return NextResponse.json({
        success: false,
        timestamp: new Date().toISOString(),
        executionTime: {
          milliseconds: executionTime,
          seconds: Math.round(executionTime / 1000)
        },
        error: 'Company information extraction failed',
        source: 'playwright-gemini-scraper'
      }, { status: 404 })
    }
    
  } catch (error) {
    const endTime = Date.now()
    const executionTime = endTime - startTime
    
    console.error('❌ スクレーパーエラー:', error)
    
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      executionTime: {
        milliseconds: executionTime,
        seconds: Math.round(executionTime / 1000)
      },
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      source: 'playwright-gemini-scraper'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const companyName = searchParams.get('company')
  const location = searchParams.get('location') || '東京'
  
  if (!companyName) {
    return NextResponse.json({
      success: false,
      error: 'company parameter is required'
    }, { status: 400 })
  }
  
  // POSTメソッドと同じ処理を実行
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ companyName, location }),
    headers: { 'Content-Type': 'application/json' }
  }))
}