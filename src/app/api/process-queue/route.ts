/**
 * Sequential Queue Processing API
 * 1件ずつ処理してVercelでトリガー連鎖実現
 */

import { NextRequest, NextResponse } from 'next/server'
import { CSVCompanyProcessor } from '@/lib/services/csvCompanyProcessor'
import fs from 'fs'
import path from 'path'

// 進捗管理用の型定義
export interface ProcessingState {
  currentIndex: number
  totalRecords: number
  processedCount: number
  successCount: number
  errorCount: number
  lastProcessed?: string
  isProcessing: boolean
  startTime?: string
  estimatedCompletion?: string
}

const STATE_FILE = './data/processing_state.json'
const RESULTS_FILE = './data/processing_results.json'

export async function GET(request: NextRequest) {
  try {
    // 進捗状況を返す
    const state = await loadProcessingState()
    return NextResponse.json({
      success: true,
      state,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, csvPath = './data/01_hokkaido_all_20250829.csv' } = body

    switch (action) {
      case 'start':
        return await startProcessing(csvPath)
      
      case 'next':
        return await processNext(csvPath)
      
      case 'status':
        return await getStatus()
      
      case 'reset':
        return await resetProcessing()
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: start, next, status, reset'
        }, { status: 400 })
    }
    
  } catch (error) {
    console.error('❌ Queue処理エラー:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * 処理開始 - 初期化とカウント
 */
async function startProcessing(csvPath: string): Promise<NextResponse> {
  console.log('🚀 連続処理開始')
  
  // CSVの総行数をカウント
  const totalRecords = await countCSVRecords(csvPath)
  
  const initialState: ProcessingState = {
    currentIndex: 0,
    totalRecords,
    processedCount: 0,
    successCount: 0,
    errorCount: 0,
    isProcessing: false,
    startTime: new Date().toISOString()
  }
  
  await saveProcessingState(initialState)
  
  // 結果ファイル初期化
  await fs.promises.writeFile(RESULTS_FILE, JSON.stringify([], null, 2))
  
  console.log(`📊 処理準備完了: ${totalRecords}件`)
  
  return NextResponse.json({
    success: true,
    message: '処理開始準備完了',
    state: initialState,
    nextAction: 'POST /api/process-queue with {"action": "next"}'
  })
}

/**
 * 次の1件を処理
 */
async function processNext(csvPath: string): Promise<NextResponse> {
  const state = await loadProcessingState()
  
  if (state.isProcessing) {
    return NextResponse.json({
      success: false,
      error: '処理中です。しばらく待ってから再実行してください。',
      state
    })
  }
  
  if (state.currentIndex >= state.totalRecords) {
    return NextResponse.json({
      success: true,
      message: '全件処理完了！',
      state: {
        ...state,
        isProcessing: false,
        estimatedCompletion: new Date().toISOString()
      },
      completed: true
    })
  }
  
  // 処理中フラグを立てる
  state.isProcessing = true
  await saveProcessingState(state)
  
  try {
    const processor = new CSVCompanyProcessor()
    
    console.log(`📋 処理中: ${state.currentIndex + 1}/${state.totalRecords}`)
    
    // 1件だけ処理
    const results = await processor.processBatch(csvPath, 1, state.currentIndex)
    const result = results[0]
    
    // 結果を保存
    await appendResult(result)
    
    // 状態更新
    const updatedState: ProcessingState = {
      ...state,
      currentIndex: state.currentIndex + 1,
      processedCount: state.processedCount + 1,
      successCount: state.successCount + (result.processed ? 1 : 0),
      errorCount: state.errorCount + (result.processed ? 0 : 1),
      lastProcessed: result.originalData.corporateName || result.originalData.法人名 || 'Unknown',
      isProcessing: false
    }
    
    // 完了時間推定
    if (updatedState.processedCount > 5) {
      const avgTime = (Date.now() - new Date(updatedState.startTime!).getTime()) / updatedState.processedCount
      const remainingRecords = updatedState.totalRecords - updatedState.currentIndex
      const estimatedMs = remainingRecords * avgTime
      updatedState.estimatedCompletion = new Date(Date.now() + estimatedMs).toISOString()
    }
    
    await saveProcessingState(updatedState)
    
    console.log(`✅ 完了: ${updatedState.currentIndex}/${updatedState.totalRecords}`)
    
    return NextResponse.json({
      success: true,
      result: {
        companyName: result.originalData.corporateName || result.originalData.法人名,
        cityName: result.originalData.cityName || result.originalData.住所,
        processed: result.processed,
        scrapingSuccess: !!result.scrapingResult,
        phoneNumber: result.scrapingResult?.phoneNumber,
        email: result.scrapingResult?.email,
        confidence: result.scrapingResult?.confidence || 0
      },
      state: updatedState,
      progress: {
        percentage: Math.round((updatedState.currentIndex / updatedState.totalRecords) * 100),
        remaining: updatedState.totalRecords - updatedState.currentIndex,
        estimatedCompletion: updatedState.estimatedCompletion
      },
      // 次の処理のトリガー情報
      nextTrigger: updatedState.currentIndex < updatedState.totalRecords ? {
        url: '/api/process-queue',
        method: 'POST',
        body: { action: 'next', csvPath }
      } : null
    })
    
  } catch (error) {
    console.error('❌ 処理エラー:', error)
    
    // エラー時も状態を更新
    const errorState = {
      ...state,
      currentIndex: state.currentIndex + 1,
      processedCount: state.processedCount + 1,
      errorCount: state.errorCount + 1,
      isProcessing: false
    }
    
    await saveProcessingState(errorState)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      state: errorState,
      // エラーでも次に進む
      nextTrigger: errorState.currentIndex < errorState.totalRecords ? {
        url: '/api/process-queue',
        method: 'POST', 
        body: { action: 'next', csvPath }
      } : null
    }, { status: 500 })
  }
}

/**
 * 状態取得
 */
async function getStatus(): Promise<NextResponse> {
  const state = await loadProcessingState()
  
  return NextResponse.json({
    success: true,
    state,
    progress: {
      percentage: state.totalRecords > 0 ? Math.round((state.currentIndex / state.totalRecords) * 100) : 0,
      remaining: Math.max(0, state.totalRecords - state.currentIndex)
    }
  })
}

/**
 * 処理リセット
 */
async function resetProcessing(): Promise<NextResponse> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      await fs.promises.unlink(STATE_FILE)
    }
    if (fs.existsSync(RESULTS_FILE)) {
      await fs.promises.unlink(RESULTS_FILE)
    }
    
    return NextResponse.json({
      success: true,
      message: '処理状態をリセットしました'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Reset failed'
    }, { status: 500 })
  }
}

/**
 * CSV行数カウント
 */
async function countCSVRecords(csvPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0
    
    if (!fs.existsSync(csvPath)) {
      reject(new Error(`CSV file not found: ${csvPath}`))
      return
    }
    
    const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
    
    stream.on('data', (chunk: string) => {
      count += (chunk.match(/\n/g) || []).length
    })
    
    stream.on('end', () => {
      resolve(count)
    })
    
    stream.on('error', reject)
  })
}

/**
 * 処理状態の保存
 */
async function saveProcessingState(state: ProcessingState): Promise<void> {
  await fs.promises.writeFile(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * 処理状態の読み込み
 */
async function loadProcessingState(): Promise<ProcessingState> {
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
 * 結果の追記保存
 */
async function appendResult(result: any): Promise<void> {
  try {
    let results = []
    
    if (fs.existsSync(RESULTS_FILE)) {
      const data = await fs.promises.readFile(RESULTS_FILE, 'utf8')
      results = JSON.parse(data)
    }
    
    results.push({
      timestamp: new Date().toISOString(),
      companyName: result.originalData.corporateName || result.originalData.法人名,
      cityName: result.originalData.cityName,
      processed: result.processed,
      scrapingResult: result.scrapingResult ? {
        phoneNumber: result.scrapingResult.phoneNumber,
        email: result.scrapingResult.email,
        confidence: result.scrapingResult.confidence
      } : null,
      executionTime: result.executionTime,
      error: result.error
    })
    
    await fs.promises.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2))
  } catch (error) {
    console.error('結果保存エラー:', error)
  }
}