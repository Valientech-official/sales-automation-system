/**
 * CSV-based Company Processing Service
 * 政府法人番号CSVを活用した企業情報収集システム
 */

import fs from 'fs'
import path from 'path'
import csv from 'csv-parser'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { chromium } from 'playwright'
import { getPlaywrightBrowser } from '../playwright-config'

// 政府法人番号データの型定義（北海道CSVフォーマット）
export interface CorporateRecord {
  // 政府法人番号データの標準フィールド
  sequenceNumber?: string     // 連番
  corporateNumber?: string    // 法人番号（13桁）
  processType?: string        // 処理区分
  correctionType?: string     // 訂正区分
  updateDate?: string         // 更新年月日
  changeDate?: string         // 変更年月日
  corporateName?: string      // 法人名
  corporateNameImageId?: string // 法人名イメージID
  kind?: string              // 法人種別
  prefectureCode?: string    // 都道府県コード
  prefectureName?: string    // 都道府県名
  cityName?: string          // 市区町村名
  streetNumber?: string      // 丁目番地号
  addressImageId?: string    // 住所イメージID
  prefectureCodeAddress?: string
  cityCodeAddress?: string
  postalCode?: string        // 郵便番号
  addressInside?: string     // 国内所在地
  addressOutside?: string    // 国外所在地
  addressImageIdInside?: string
  addressImageIdOutside?: string
  closeDate?: string         // 登記記録の閉鎖等年月日
  closeCause?: string        // 登記記録の閉鎖等の事由
  successorCorporateNumber?: string // 承継先法人番号
  changeReason?: string      // 変更事由の詳細
  assignmentDate?: string    // 法人番号指定年月日
  latest?: string            // 最新履歴
  corporateNameEn?: string   // 商号又は名称(英語表記)
  addressOutsideEn?: string  // 国外所在地(英語表記)
  furigana?: string         // フリガナ
  hihyoji?: string          // 非表示
  
  // 互換性のためのエイリアス
  法人番号?: string
  法人名?: string
  住所?: string
}

// 検索結果の型定義
export interface ProcessingResult {
  originalData: CorporateRecord
  scrapingResult: {
    companyName: string
    phoneNumber?: string
    email?: string
    website?: string
    address?: string
    businessType?: string
    confidence: number
  } | null
  processed: boolean
  timestamp: string
  executionTime: number
  error?: string
}

export class CSVCompanyProcessor {
  private genAI: GoogleGenerativeAI
  private model: any
  private browser: any

  constructor() {
    // Use the same pattern as working feer project
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

  /**
   * 政府法人番号CSV読み込み（文字化け対応）
   */
  async loadCorporateCSV(csvPath: string): Promise<CorporateRecord[]> {
    const records: CorporateRecord[] = []
    
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(csvPath)) {
        reject(new Error(`CSV file not found: ${csvPath}`))
        return
      }

      fs.createReadStream(csvPath, { encoding: 'utf8' })
        .pipe(csv({ 
          headers: false,  // 政府CSVはヘッダーなし
          skipEmptyLines: true
        }))
        .on('data', (row) => {
          // 政府法人番号CSV標準フォーマット（配列インデックスで取得）
          const record: CorporateRecord = {
            sequenceNumber: row[0],       // 連番
            corporateNumber: row[1],      // 法人番号
            processType: row[2],          // 処理区分
            correctionType: row[3],       // 訂正区分
            updateDate: row[4],           // 更新年月日
            changeDate: row[5],           // 変更年月日
            corporateName: row[6],        // 法人名
            corporateNameImageId: row[7], // 法人名イメージID
            kind: row[8],                 // 法人種別
            prefectureCode: row[9],       // 都道府県コード
            prefectureName: row[10],      // 都道府県名
            cityName: row[11],            // 市区町村名
            streetNumber: row[12],        // 丁目番地号
            addressImageId: row[13],      // 住所イメージID
            prefectureCodeAddress: row[14],
            cityCodeAddress: row[15],
            postalCode: row[16],          // 郵便番号
            addressInside: row[17],       // 国内所在地
            addressOutside: row[18],      // 国外所在地
            addressImageIdInside: row[19],
            addressImageIdOutside: row[20],
            closeDate: row[21],           // 閉鎖等年月日
            closeCause: row[22],          // 閉鎖等事由
            successorCorporateNumber: row[23], // 承継先法人番号
            changeReason: row[24],        // 変更事由
            assignmentDate: row[25],      // 法人番号指定年月日
            latest: row[26],              // 最新履歴
            corporateNameEn: row[27],     // 英語法人名
            addressOutsideEn: row[28],    // 英語住所
            furigana: row[29],            // フリガナ
            hihyoji: row[30],             // 非表示
            
            // 互換性エイリアス
            法人番号: row[1],
            法人名: row[6],
            住所: `${row[10] || ''}${row[11] || ''}${row[12] || ''}`.trim()
          }
          
          // 法人名があり、最新データ（latest=1）のみを取得
          if (record.corporateName && record.latest === '1') {
            records.push(record)
          }
        })
        .on('end', () => {
          console.log(`📄 政府CSV読み込み完了: ${records.length}件の法人データ (最新データのみ)`)
          resolve(records)
        })
        .on('error', (error) => {
          reject(error)
        })
    })
  }

  /**
   * Playwrightブラウザ初期化
   */
  async initBrowser() {
    console.log('🚀 ブラウザ初期化中...')
    this.browser = await getPlaywrightBrowser()
  }

  /**
   * 単一企業の情報を検索・抽出（4段階戦略）
   */
  async processCompany(record: CorporateRecord): Promise<ProcessingResult> {
    const startTime = Date.now()
    
    try {
      const page = await this.browser.newPage()
      const companyName = record.corporateName || record.法人名 || ''
      const cityName = record.cityName || record.prefectureName || ''
      
      console.log(`🔍 4段階処理開始: ${companyName} (${cityName})`)

      // Phase 1: 求人募集確認
      console.log('📋 Phase 1: 求人募集確認')
      const hasJobPosting = await this.checkJobPosting(page, companyName, cityName)
      if (!hasJobPosting) {
        await page.close()
        return this.createResult(record, null, false, Date.now() - startTime, '求人募集なし')
      }

      // Phase 2: 公式サイト経由連絡先取得
      console.log('🏢 Phase 2: 公式サイト連絡先取得')
      const officialContact = await this.getOfficialContact(page, companyName, cityName)
      if (officialContact) {
        const verified = await this.verifyContact(page, officialContact, companyName)
        if (verified) {
          await page.close()
          return this.createResult(record, officialContact, true, Date.now() - startTime)
        }
      }

      // Phase 3: 直接検索（5回試行）
      console.log('🔍 Phase 3: 直接検索（5回試行）')
      const directContact = await this.tryDirectSearch(page, companyName, cityName)
      if (directContact) {
        const verified = await this.verifyContact(page, directContact, companyName)
        if (verified) {
          await page.close()
          return this.createResult(record, directContact, true, Date.now() - startTime)
        }
      }

      await page.close()
      return this.createResult(record, null, false, Date.now() - startTime, '連絡先取得失敗')

    } catch (error) {
      const executionTime = Date.now() - startTime
      console.error(`❌ 処理エラー [${record.corporateName || record.法人名}]:`, error)
      
      return {
        originalData: record,
        scrapingResult: null,
        processed: false,
        timestamp: new Date().toISOString(),
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Phase 1: 求人募集確認（スクロール検知）
   */
  private async checkJobPosting(page: any, companyName: string, cityName: string): Promise<boolean> {
    try {
      await page.goto('https://duckduckgo.com/')
      await page.waitForTimeout(2000)

      const searchQuery = `"${companyName}" "${cityName}" 求人 採用`
      console.log(`🔎 求人検索: ${searchQuery}`)

      await page.fill('input[name="q"]', searchQuery)
      await page.press('input[name="q"]', 'Enter')
      await page.waitForTimeout(5000)

      // 求人関連キーワードをスクロールしながら検索
      const jobKeywords = ['求人', '採用', '募集', 'indeed', 'mynavi', 'rikunabi', '転職']
      
      for (let i = 0; i < 3; i++) {
        const content = await page.content()
        const hasJobKeyword = jobKeywords.some(keyword => content.includes(keyword))
        
        if (hasJobKeyword) {
          console.log('✅ 求人募集確認')
          return true
        }
        
        // スクロール
        await page.evaluate(() => window.scrollBy(0, window.innerHeight))
        await page.waitForTimeout(2000)
      }

      console.log('❌ 求人募集なし')
      return false
      
    } catch (error) {
      console.error('求人確認エラー:', error)
      return false
    }
  }

  /**
   * Phase 2: 公式サイト経由連絡先取得
   */
  private async getOfficialContact(page: any, companyName: string, cityName: string): Promise<any> {
    try {
      const searchQueries = [
        `"${companyName}" "${cityName}" プライバシーポリシー`,
        `"${companyName}" "${cityName}" 利用規約`,
        `"${companyName}" "${cityName}" 会社概要 site:${companyName.replace(/株式会社|有限会社/g, '').trim()}.co.jp`
      ]

      for (const query of searchQueries) {
        console.log(`🔎 公式サイト検索: ${query}`)
        
        await page.goto('https://duckduckgo.com/')
        await page.waitForTimeout(2000)
        
        await page.fill('input[name="q"]', query)
        await page.press('input[name="q"]', 'Enter')
        await page.waitForTimeout(5000)

        // 公式っぽいリンクを探してアクセス
        const resultLinks = await page.locator('a[data-testid="result-title-a"]').all()
        
        for (let i = 0; i < Math.min(3, resultLinks.length); i++) {
          try {
            const link = resultLinks[i]
            const linkText = await link.textContent()
            
            // 公式サイトっぽいかAIで判定
            if (await this.isOfficialSite(linkText || '', companyName)) {
              await link.click()
              await page.waitForTimeout(5000)
              
              const htmlContent = await page.content()
              const contactInfo = await this.extractCompanyInfo(htmlContent, companyName)
              
              if (contactInfo && (contactInfo.phoneNumber || contactInfo.email)) {
                console.log('✅ 公式サイト連絡先取得成功')
                return contactInfo
              }
            }
          } catch (e) {
            console.log(`公式サイトアクセス失敗: ${e}`)
          }
        }
      }

      console.log('❌ 公式サイト連絡先取得失敗')
      return null
      
    } catch (error) {
      console.error('公式サイト検索エラー:', error)
      return null
    }
  }

  /**
   * Phase 3: 直接検索（5回試行）
   */
  private async tryDirectSearch(page: any, companyName: string, cityName: string): Promise<any> {
    const searchStrategies = [
      `"${companyName}" "${cityName}" 電話番号`,
      `"${companyName}" "${cityName}" メールアドレス`,
      `"${companyName}" "${cityName}" お問い合わせ`,
      `"${companyName}" "${cityName}" 会社概要`,
      `"${companyName}" "${cityName}" 連絡先`
    ]

    for (let i = 0; i < searchStrategies.length; i++) {
      try {
        const query = searchStrategies[i]
        console.log(`🔍 直接検索 ${i + 1}/5: ${query}`)

        await page.goto('https://duckduckgo.com/')
        await page.waitForTimeout(2000)
        
        await page.fill('input[name="q"]', query)
        await page.press('input[name="q"]', 'Enter')
        await page.waitForTimeout(5000)

        // AIで検索クエリを最適化
        const optimizedQuery = await this.optimizeSearchQuery(query, i + 1)
        if (optimizedQuery !== query) {
          console.log(`🤖 AI最適化クエリ: ${optimizedQuery}`)
          await page.fill('input[name="q"]', optimizedQuery)
          await page.press('input[name="q"]', 'Enter')
          await page.waitForTimeout(5000)
        }

        // 上位3結果を確認
        const resultLinks = await page.locator('a[data-testid="result-title-a"]').all()
        
        for (let j = 0; j < Math.min(3, resultLinks.length); j++) {
          try {
            const link = resultLinks[j]
            await link.click()
            await page.waitForTimeout(5000)
            
            const htmlContent = await page.content()
            const contactInfo = await this.extractCompanyInfo(htmlContent, companyName)
            
            if (contactInfo && (contactInfo.phoneNumber || contactInfo.email)) {
              console.log(`✅ 直接検索成功 (試行${i + 1})`)
              return contactInfo
            }
            
            // 戻る
            await page.goBack()
            await page.waitForTimeout(2000)
            
          } catch (e) {
            console.log(`直接検索リンクアクセス失敗: ${e}`)
          }
        }
        
      } catch (error) {
        console.error(`直接検索エラー (試行${i + 1}):`, error)
      }
    }

    console.log('❌ 直接検索5回試行すべて失敗')
    return null
  }

  /**
   * Phase 4: 連絡先検証（電話番号逆引き）
   */
  private async verifyContact(page: any, contactInfo: any, expectedCompanyName: string): Promise<boolean> {
    if (!contactInfo.phoneNumber) {
      return true // 電話番号がない場合はメール等で検証スキップ
    }

    try {
      console.log(`📞 Phase 4: 電話番号検証 ${contactInfo.phoneNumber}`)
      
      await page.goto('https://duckduckgo.com/')
      await page.waitForTimeout(2000)
      
      const phoneQuery = `"${contactInfo.phoneNumber}"`
      console.log(`🔎 電話番号逆引き: ${phoneQuery}`)
      
      await page.fill('input[name="q"]', phoneQuery)
      await page.press('input[name="q"]', 'Enter')
      await page.waitForTimeout(5000)
      
      const searchResults = await page.content()
      
      // AIで企業名一致判定
      const isMatch = await this.verifyCompanyNameMatch(searchResults, expectedCompanyName)
      
      if (isMatch) {
        console.log('✅ 電話番号検証成功: 企業名一致')
        return true
      } else {
        console.log('❌ 電話番号検証失敗: 企業名不一致')
        return false
      }
      
    } catch (error) {
      console.error('電話番号検証エラー:', error)
      return false
    }
  }

  /**
   * Gemini AIで企業情報抽出（新SDK + 構造化出力使用）
   */
  private async extractCompanyInfo(htmlContent: string, companyName: string): Promise<any> {
    const cleanedHTML = htmlContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 15000)

    const prompt = `
以下のHTMLから「${companyName}」の企業情報を抽出してください。

HTMLコンテンツ:
${cleanedHTML}

企業の正式名称、電話番号、メールアドレス、公式ウェブサイト、住所、事業内容を抽出し、
情報の信頼度を0-100で評価してください。見つからない情報はnullにしてください。
`

    try {
      // 新SDK + 構造化出力使用
      const response = await this.model.generateContent(prompt)
      
      const responseText = response.response.text()
      
      // JSON抽出 (既存APIルートと同じパターン)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('❌ JSON形式が見つかりません')
        return null
      }
      
      return JSON.parse(jsonMatch[0])
      
    } catch (error) {
      console.error('❌ Gemini解析エラー:', error)
    }

    return null
  }

  /**
   * AIヘルパー: 公式サイト判定
   */
  private async isOfficialSite(linkText: string, companyName: string): Promise<boolean> {
    try {
      const prompt = `
リンクテキスト「${linkText}」が企業「${companyName}」の公式サイトかどうか判定してください。

判定基準:
- 企業名が含まれている
- .co.jp, .com などの公式ドメインっぽい
- プライバシーポリシー、利用規約、会社概要などの公式ページ
`
      
      const response = await this.model.generateContent(prompt)
      
      const responseText = response.response.text()
      
      // JSON抽出 (既存APIルートと同じパターン)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('❌ JSON形式が見つかりません')
        return false
      }
      
      const result = JSON.parse(jsonMatch[0])
      return result.isOfficial
      
    } catch (error) {
      console.error('公式サイト判定エラー:', error)
      return false
    }
  }

  /**
   * AIヘルパー: 検索クエリ最適化
   */
  private async optimizeSearchQuery(originalQuery: string, attemptNumber: number): Promise<string> {
    try {
      const prompt = `
検索クエリ「${originalQuery}」の${attemptNumber}回目の試行です。
より効果的な検索結果を得るために、クエリを最適化してください。

改善ポイント:
- 試行回数に応じた戦略変更
- より具体的なキーワード追加
- 検索演算子の活用

最適化クエリ:
`
      
      const response = await this.model.generateContent(prompt)
      
      const responseText = response.response.text()
      
      // JSON抽出 (既存APIルートと同じパターン)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('❌ JSON形式が見つかりません')
        return originalQuery
      }
      
      const result = JSON.parse(jsonMatch[0])
      return result.optimizedQuery || originalQuery
      
    } catch (error) {
      console.error('クエリ最適化エラー:', error)
      return originalQuery
    }
  }

  /**
   * AIヘルパー: 企業名一致検証
   */
  private async verifyCompanyNameMatch(searchResults: string, expectedCompanyName: string): Promise<boolean> {
    try {
      const cleanedResults = searchResults
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .substring(0, 5000)

      const prompt = `
検索結果から企業名「${expectedCompanyName}」が含まれているか確認してください。

検索結果:
${cleanedResults}

判定基準:
- 企業名の完全一致または部分一致
- 株式会社、有限会社などの表記違いは許容
- 明らかに同じ企業の情報か
`
      
      const response = await this.model.generateContent(prompt)
      
      const responseText = response.response.text()
      
      // JSON抽出 (既存APIルートと同じパターン)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('❌ JSON形式が見つかりません')
        return false
      }
      
      const result = JSON.parse(jsonMatch[0])
      return result.isMatch
      
    } catch (error) {
      console.error('企業名一致検証エラー:', error)
      return false
    }
  }

  /**
   * 結果作成ヘルパー
   */
  private createResult(
    record: CorporateRecord, 
    scrapingResult: any, 
    processed: boolean, 
    executionTime: number, 
    error?: string
  ): ProcessingResult {
    return {
      originalData: record,
      scrapingResult,
      processed,
      timestamp: new Date().toISOString(),
      executionTime,
      error
    }
  }

  /**
   * CSV一括処理（指定件数）
   */
  async processBatch(
    csvPath: string, 
    maxRecords: number = 10, 
    startIndex: number = 0
  ): Promise<ProcessingResult[]> {
    console.log(`📋 CSV一括処理開始: 最大${maxRecords}件（${startIndex}行目から）`)
    
    // CSV読み込み
    const records = await this.loadCorporateCSV(csvPath)
    const targetRecords = records.slice(startIndex, startIndex + maxRecords)
    
    console.log(`🎯 処理対象: ${targetRecords.length}件`)

    // ブラウザ初期化
    await this.initBrowser()

    const results: ProcessingResult[] = []

    // 1社ずつ処理
    for (let i = 0; i < targetRecords.length; i++) {
      const record = targetRecords[i]
      console.log(`\n📊 進捗: ${i + 1}/${targetRecords.length} (全体: ${startIndex + i + 1}行目)`)
      
      const result = await this.processCompany(record)
      results.push(result)

      // レート制限対応
      if (i < targetRecords.length - 1) {
        console.log('⏳ 待機中... (3秒)')
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    // ブラウザクリーンアップ
    await this.browser.close()
    console.log('🔐 ブラウザ終了')

    // 結果サマリー
    const successCount = results.filter(r => r.processed && r.scrapingResult).length
    const highQualityCount = results.filter(r => 
      r.scrapingResult && r.scrapingResult.confidence >= 70
    ).length

    console.log('\n📊 処理完了サマリー:')
    console.log(`✅ 成功: ${successCount}/${targetRecords.length}件`)
    console.log(`🎯 高品質: ${highQualityCount}件 (信頼度70%以上)`)

    return results
  }

  /**
   * ブラウザクリーンアップ
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      console.log('🔐 ブラウザ終了完了')
    }
  }
}