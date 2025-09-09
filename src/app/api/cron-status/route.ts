/**
 * Cron Status API - 進捗確認とクロン管理
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const currentIndex = parseInt(searchParams.get('index') || '0')
    
    // 概算計算
    const totalEstimated = 230000
    const progressPercentage = Math.round((currentIndex / totalEstimated) * 100 * 100) / 100
    
    // 1日の処理予測（2分間隔 = 720件/日）
    const dailyRate = Math.floor((24 * 60) / 2) // 2分間隔
    const estimatedDaysRemaining = Math.ceil((totalEstimated - currentIndex) / dailyRate)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cronStatus: {
        currentIndex,
        totalEstimated,
        progressPercentage,
        processed: currentIndex,
        remaining: totalEstimated - currentIndex
      },
      schedule: {
        interval: '2分間隔',
        dailyRate: `約${dailyRate}件/日`,
        estimatedDaysRemaining,
        estimatedCompletion: new Date(Date.now() + estimatedDaysRemaining * 24 * 60 * 60 * 1000).toLocaleDateString('ja-JP')
      },
      manual: {
        testUrl: `/api/cron-process?index=${currentIndex}`,
        nextUrl: `/api/cron-process?index=${currentIndex + 1}`,
        skipToUrl: `/api/cron-process?index=${currentIndex + 100}` // 100件スキップ
      },
      tips: [
        '手動テスト: /api/cron-process?index=0',
        '進捗確認: /api/cron-status?index=現在のインデックス',
        'Vercel Cronが自動で2分ごとに実行されます',
        '1日約720件処理予定'
      ]
    })
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Status check failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}