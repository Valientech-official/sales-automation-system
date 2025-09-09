/**
 * CSV-based Company Processing API Endpoint
 * 政府法人番号CSVを活用した一括企業情報処理
 */

import { NextRequest, NextResponse } from 'next/server'
import { CSVCompanyProcessor } from '@/lib/services/csvCompanyProcessor'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    console.log('🚀 CSV一括処理開始')
    
    const body = await request.json()
    const { 
      csvPath = './data/corporate_data.csv',
      maxRecords = 5,
      startIndex = 0
    } = body
    
    if (!csvPath) {
      return NextResponse.json({
        success: false,
        error: 'csvPath is required'
      }, { status: 400 })
    }
    
    console.log(`📋 設定: CSV=${csvPath}, 最大${maxRecords}件, ${startIndex}行目から`)
    
    const processor = new CSVCompanyProcessor()
    const results = await processor.processBatch(csvPath, maxRecords, startIndex)
    
    const endTime = Date.now()
    const executionTime = endTime - startTime
    
    // 成功統計
    const successResults = results.filter(r => r.processed && r.scrapingResult)
    const highQualityResults = results.filter(r => 
      r.scrapingResult && r.scrapingResult.confidence >= 70
    )
    
    const avgConfidence = successResults.length > 0 
      ? successResults.reduce((sum, r) => sum + (r.scrapingResult?.confidence || 0), 0) / successResults.length
      : 0

    console.log('✅ CSV処理完了')
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      executionTime: {
        milliseconds: executionTime,
        seconds: Math.round(executionTime / 1000),
        minutes: Math.round(executionTime / 1000 / 60 * 10) / 10
      },
      settings: {
        csvPath,
        maxRecords,
        startIndex
      },
      statistics: {
        totalProcessed: results.length,
        successCount: successResults.length,
        highQualityCount: highQualityResults.length,
        averageConfidence: Math.round(avgConfidence * 10) / 10,
        errorCount: results.filter(r => !r.processed).length
      },
      results: results.map(r => ({
        companyName: r.originalData.corporateName || r.originalData.法人名,
        corporateNumber: r.originalData.corporateNumber || r.originalData.法人番号,
        address: r.originalData.住所 || `${r.originalData.prefectureName || ''}${r.originalData.cityName || ''}${r.originalData.streetNumber || ''}`.trim(),
        scrapingSuccess: !!r.scrapingResult,
        confidence: r.scrapingResult?.confidence || 0,
        phoneNumber: r.scrapingResult?.phoneNumber,
        email: r.scrapingResult?.email,
        website: r.scrapingResult?.website,
        businessType: r.scrapingResult?.businessType,
        processed: r.processed,
        executionTime: r.executionTime,
        error: r.error
      })),
      source: 'csv-company-processor'
    })
    
  } catch (error) {
    const endTime = Date.now()
    const executionTime = endTime - startTime
    
    console.error('❌ CSV処理エラー:', error)
    
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
      source: 'csv-company-processor'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const csvPath = searchParams.get('csv') || './data/corporate_data.csv'
  const maxRecords = parseInt(searchParams.get('max') || '5')
  const startIndex = parseInt(searchParams.get('start') || '0')
  
  // POSTメソッドと同じ処理を実行
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ csvPath, maxRecords, startIndex }),
    headers: { 'Content-Type': 'application/json' }
  }))
}