/**
 * Processing Dashboard API
 * 処理進捗とリアルタイム統計の表示
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'

const STATE_FILE = './data/processing_state.json'
const RESULTS_FILE = './data/processing_results.json'

export async function GET(request: NextRequest) {
  try {
    // 処理状態の読み込み
    const state = await loadProcessingState()
    
    // 結果統計の計算
    const statistics = await calculateStatistics()
    
    // 最近の結果を取得
    const recentResults = await getRecentResults(10)
    
    // 処理速度の計算
    const processingSpeed = calculateProcessingSpeed(state, statistics)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      state,
      statistics,
      recentResults,
      processingSpeed,
      dashboard: {
        progressPercentage: state.totalRecords > 0 ? 
          Math.round((state.currentIndex / state.totalRecords) * 100) : 0,
        remaining: Math.max(0, state.totalRecords - state.currentIndex),
        successRate: statistics.totalProcessed > 0 ? 
          Math.round((statistics.successCount / statistics.totalProcessed) * 100) : 0,
        avgConfidence: statistics.avgConfidence,
        estimatedTimeRemaining: processingSpeed.estimatedTimeRemaining
      }
    })
    
  } catch (error) {
    console.error('❌ Dashboard取得エラー:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * 処理状態の読み込み
 */
async function loadProcessingState(): Promise<any> {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return {
        currentIndex: 0,
        totalRecords: 0,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        isProcessing: false
      }
    }
    
    const data = await fs.promises.readFile(STATE_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    console.error('状態ファイル読み込みエラー:', error)
    return {
      currentIndex: 0,
      totalRecords: 0,
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      isProcessing: false
    }
  }
}

/**
 * 統計情報の計算
 */
async function calculateStatistics(): Promise<any> {
  try {
    if (!fs.existsSync(RESULTS_FILE)) {
      return {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        phoneFoundCount: 0,
        emailFoundCount: 0,
        avgConfidence: 0,
        avgExecutionTime: 0,
        highQualityCount: 0
      }
    }
    
    const data = await fs.promises.readFile(RESULTS_FILE, 'utf8')
    const results = JSON.parse(data)
    
    if (results.length === 0) {
      return {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        phoneFoundCount: 0,
        emailFoundCount: 0,
        avgConfidence: 0,
        avgExecutionTime: 0,
        highQualityCount: 0
      }
    }
    
    const successResults = results.filter((r: any) => r.processed && r.scrapingResult)
    const phoneFoundCount = results.filter((r: any) => r.scrapingResult?.phoneNumber).length
    const emailFoundCount = results.filter((r: any) => r.scrapingResult?.email).length
    
    const avgConfidence = successResults.length > 0 ? 
      successResults.reduce((sum: number, r: any) => sum + (r.scrapingResult?.confidence || 0), 0) / successResults.length : 0
    
    const avgExecutionTime = results.length > 0 ?
      results.reduce((sum: number, r: any) => sum + (r.executionTime || 0), 0) / results.length : 0
    
    const highQualityCount = results.filter((r: any) => 
      r.scrapingResult && r.scrapingResult.confidence >= 70
    ).length
    
    return {
      totalProcessed: results.length,
      successCount: successResults.length,
      errorCount: results.length - successResults.length,
      phoneFoundCount,
      emailFoundCount,
      avgConfidence: Math.round(avgConfidence * 10) / 10,
      avgExecutionTime: Math.round(avgExecutionTime),
      highQualityCount
    }
    
  } catch (error) {
    console.error('統計計算エラー:', error)
    return {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      phoneFoundCount: 0,
      emailFoundCount: 0,
      avgConfidence: 0,
      avgExecutionTime: 0,
      highQualityCount: 0
    }
  }
}

/**
 * 最近の結果を取得
 */
async function getRecentResults(limit: number = 10): Promise<any[]> {
  try {
    if (!fs.existsSync(RESULTS_FILE)) {
      return []
    }
    
    const data = await fs.promises.readFile(RESULTS_FILE, 'utf8')
    const results = JSON.parse(data)
    
    return results
      .slice(-limit)
      .reverse()
      .map((r: any) => ({
        timestamp: r.timestamp,
        companyName: r.companyName,
        cityName: r.cityName,
        success: r.processed && !!r.scrapingResult,
        phoneFound: !!r.scrapingResult?.phoneNumber,
        emailFound: !!r.scrapingResult?.email,
        confidence: r.scrapingResult?.confidence || 0,
        executionTime: r.executionTime
      }))
      
  } catch (error) {
    console.error('最近の結果取得エラー:', error)
    return []
  }
}

/**
 * 処理速度の計算
 */
function calculateProcessingSpeed(state: any, statistics: any): any {
  if (!state.startTime || state.processedCount === 0) {
    return {
      recordsPerMinute: 0,
      estimatedTimeRemaining: null
    }
  }
  
  const elapsedMs = Date.now() - new Date(state.startTime).getTime()
  const elapsedMinutes = elapsedMs / (1000 * 60)
  
  const recordsPerMinute = Math.round(state.processedCount / elapsedMinutes * 10) / 10
  
  const remainingRecords = state.totalRecords - state.currentIndex
  const estimatedMinutes = recordsPerMinute > 0 ? remainingRecords / recordsPerMinute : null
  
  let estimatedTimeRemaining = null
  if (estimatedMinutes) {
    const hours = Math.floor(estimatedMinutes / 60)
    const minutes = Math.floor(estimatedMinutes % 60)
    estimatedTimeRemaining = hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`
  }
  
  return {
    recordsPerMinute,
    estimatedTimeRemaining
  }
}