/**
 * Cron API Endpoint for Sales Automation
 * Triggers the automated sales list generation process
 */

import { NextRequest, NextResponse } from 'next/server';
import { EnhancedSalesAutomationService } from '@/lib/services/enhancedSalesAutomation';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Sales Automation Cron Job Started');
    console.log(`⏰ Start Time: ${new Date().toISOString()}`);

    // Search params for testing mode
    const { searchParams } = new URL(request.url);
    const testMode = searchParams.get('test') === 'true';
    const maxCompanies = parseInt(searchParams.get('max') || '0') || undefined;

    const automation = new EnhancedSalesAutomationService();

    let result;
    
    if (testMode) {
      console.log('🧪 Running in TEST MODE');
      result = await automation.testRun(maxCompanies || 3);
    } else {
      console.log('🔄 Running FULL AUTOMATION');
      result = await automation.runAutomation();
    }

    const endTime = Date.now();
    const executionTimeMinutes = (endTime - startTime) / 1000 / 60;

    console.log('✅ Sales Automation Completed');
    console.log(`⏱️ Total Execution Time: ${executionTimeMinutes.toFixed(2)} minutes`);

    // Return detailed response
    return NextResponse.json({
      success: true,
      mode: testMode ? 'test' : 'production',
      timestamp: new Date().toISOString(),
      executionTime: {
        milliseconds: endTime - startTime,
        minutes: executionTimeMinutes
      },
      results: {
        processed: result.processed,
        verified: result.verified,
        saved: result.saved,
        duplicatesSkipped: result.duplicatesSkipped,
        errors: result.errors,
        highQualityCount: result.highQualityCount,
        averageConfidence: Math.round(result.averageConfidence * 10) / 10
      },
      message: testMode 
        ? `Test completed: ${result.verified}/${result.processed} companies verified`
        : `Automation completed: ${result.saved} high-quality companies added to sales list`,
      nextRun: testMode ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes from now
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    const endTime = Date.now();
    const executionTimeMinutes = (endTime - startTime) / 1000 / 60;

    console.error('❌ Sales Automation Failed:', error);

    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      executionTime: {
        milliseconds: endTime - startTime,
        minutes: executionTimeMinutes
      },
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      message: 'Sales automation failed. Please check logs for details.'
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * POST endpoint for manual triggers with parameters
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      testMode = false, 
      maxCompanies = undefined,
      refreshCache = false 
    } = body;

    console.log('🎯 Manual Sales Automation Trigger');
    console.log('📋 Parameters:', { testMode, maxCompanies, refreshCache });

    const automation = new EnhancedSalesAutomationService();

    // Cache refresh if requested
    if (refreshCache) {
      console.log('🔄 Refreshing cache as requested');
      await automation.refreshCache();
    }

    let result;
    
    if (testMode) {
      result = await automation.testRun(maxCompanies || 3);
    } else {
      result = await automation.runAutomation();
    }

    return NextResponse.json({
      success: true,
      mode: testMode ? 'test' : 'manual',
      timestamp: new Date().toISOString(),
      parameters: { testMode, maxCompanies, refreshCache },
      results: {
        processed: result.processed,
        verified: result.verified,
        saved: result.saved,
        duplicatesSkipped: result.duplicatesSkipped,
        errors: result.errors,
        highQualityCount: result.highQualityCount,
        averageConfidence: Math.round(result.averageConfidence * 10) / 10
      },
      message: `Manual automation completed: ${result.saved} companies processed`
    });

  } catch (error) {
    console.error('❌ Manual Sales Automation Failed:', error);

    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        type: error instanceof Error ? error.constructor.name : 'Unknown'
      },
      message: 'Manual automation failed'
    }, { status: 500 });
  }
}