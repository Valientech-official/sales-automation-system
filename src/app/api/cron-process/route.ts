/**
 * Vercel Cron Job - Automated Single Company Processing
 * 1-5分間隔で1社ずつ自動処理
 */

import { NextRequest, NextResponse } from 'next/server'
import { CSVCompanyProcessor } from '@/lib/services/csvCompanyProcessor'
import { GoogleSheetsService, CSVProcessingResult } from '@/lib/googleSheets'
import path from 'path'

export const maxDuration = 60 // Vercel Pro: 60秒タイムアウト
export const revalidate = 0 // キャッシュ無効化でcron実行確実にする
export const dynamic = 'force-dynamic' // 動的レンダリング強制（cron用）

// Vercel Cron設定
export const config = {
  runtime: 'nodejs18.x',
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const userAgent = request.headers.get('user-agent') || 'unknown'
    console.log('🕐 Cron処理開始:', new Date().toISOString())
    console.log('🤖 User-Agent:', userAgent)
    
    // Vercel Cron の User-Agent チェック
    const isVercelCron = userAgent.includes('vercel-cron')
    const isCurlTest = userAgent.includes('curl')
    console.log('📋 実行元:', isVercelCron ? 'Vercel Cron Job' : isCurlTest ? 'Manual cURL' : 'Unknown')
    
    // スプレッドシートから次のindexを自動計算
    const sheetsService = new GoogleSheetsService()
    const currentIndex = await sheetsService.getNextProcessingIndex('営業リストV2')
    
    const { searchParams } = new URL(request.url)
    const defaultCsvFile = searchParams.get('csv') || '01_hokkaido_all_20250829.csv'
    const csvPath = path.join(process.cwd(), 'public', defaultCsvFile)
    
    console.log(`📋 自動計算された処理対象: ${currentIndex + 1}件目 (index: ${currentIndex})`)
    
    // 1件だけ処理
    const processor = new CSVCompanyProcessor()
    const results = await processor.processBatch(csvPath, 1, currentIndex)
    const result = results[0]
    
    const executionTime = Date.now() - startTime
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: '処理対象のデータが見つかりません',
        currentIndex,
        timestamp: new Date().toISOString(),
        executionTime
      }, { status: 404 })
    }
    
    // 結果の整理
    const processedResult = {
      index: currentIndex,
      companyName: result.originalData.corporateName || result.originalData.法人名,
      cityName: result.originalData.cityName,
      corporateNumber: result.originalData.corporateNumber || result.originalData.法人番号,
      processed: result.processed,
      scrapingSuccess: !!result.scrapingResult,
      contactInfo: result.scrapingResult ? {
        phoneNumber: result.scrapingResult.phoneNumber,
        email: result.scrapingResult.email,
        website: result.scrapingResult.website,
        confidence: result.scrapingResult.confidence
      } : null,
      executionTime: result.executionTime,
      error: result.error
    }
    
    // Google Sheetsに保存
    try {
      const sheetData: CSVProcessingResult = {
        処理番号: currentIndex + 1,
        法人番号: result.originalData.corporateNumber || result.originalData.法人番号 || '',
        企業名: result.originalData.corporateName || result.originalData.法人名 || '',
        市区町村: result.originalData.cityName || '',
        都道府県: result.originalData.prefectureName || '',
        電話番号: result.scrapingResult?.phoneNumber || '',
        メール: result.scrapingResult?.email || '',
        ウェブサイト: result.scrapingResult?.website || '',
        信頼度: result.scrapingResult?.confidence || 0,
        処理成功: result.processed && !!result.scrapingResult,
        処理時間: result.executionTime,
        取得日時: new Date().toLocaleString('ja-JP'),
        エラー: result.error || ''
      }
      
      await sheetsService.appendCSVResult(sheetData, '営業リストV2')
      console.log('📊 営業リストV2への保存完了')
    } catch (sheetError) {
      console.error('⚠️ スプレッドシート保存エラー (処理は続行):', sheetError)
      // スプレッドシート保存失敗でも処理は続行
    }
    
    console.log('✅ Cron処理完了:', processedResult.companyName)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      executionTime,
      result: processedResult,
      nextIndex: currentIndex + 1,
      progress: {
        current: currentIndex + 1,
        estimated: '約230,000件',
        dailyRate: '約200-300件/日（1-3分間隔）'
      },
      // 次のCron実行用URL（手動テスト用）
      nextUrl: `/api/cron-process?index=${currentIndex + 1}&csv=${csvPath}`,
      source: 'vercel-cron-job'
    })
    
  } catch (error) {
    const executionTime = Date.now() - startTime
    console.error('❌ Cron処理エラー:', error)
    
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      executionTime,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      currentIndex: parseInt(new URL(request.url).searchParams.get('index') || '0'),
      source: 'vercel-cron-job'
    }, { status: 500 })
  }
}