/**
 * Google Sheets Initialization API
 * CSV処理結果用シートの初期化
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleSheetsService } from '@/lib/googleSheets'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sheetName = '営業リストV2' } = body
    
    console.log(`📋 スプレッドシート初期化開始: ${sheetName}`)
    
    const sheetsService = new GoogleSheetsService()
    await sheetsService.initializeCSVSheet(sheetName)
    
    return NextResponse.json({
      success: true,
      message: `スプレッドシート「${sheetName}」の初期化が完了しました`,
      timestamp: new Date().toISOString(),
      headers: [
        '処理番号', '法人番号', '企業名', '市区町村', '都道府県',
        '電話番号', 'メール', 'ウェブサイト', '信頼度', '処理成功',
        '処理時間(ms)', '取得日時', 'エラー'
      ],
      sheetName
    })
    
  } catch (error) {
    console.error('❌ スプレッドシート初期化エラー:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'スプレッドシート初期化API',
    usage: {
      method: 'POST',
      body: {
        sheetName: '営業リストV2 (optional, default: 営業リストV2)'
      }
    },
    headers: [
      '処理番号 - 処理した順番',
      '法人番号 - 政府データの13桁法人番号',
      '企業名 - 会社名（G列データ）',
      '市区町村 - 市区町村名（K列データ）',
      '都道府県 - 都道府県名',
      '電話番号 - スクレイピング取得した電話番号',
      'メール - スクレイピング取得したメールアドレス',
      'ウェブサイト - スクレイピング取得したウェブサイト',
      '信頼度 - AI判定の信頼度（0-100）',
      '処理成功 - 成功/失敗',
      '処理時間(ms) - 処理にかかった時間',
      '取得日時 - 処理した日時',
      'エラー - エラーメッセージ'
    ]
  })
}