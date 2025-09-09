import { NextResponse } from 'next/server';
import { GoogleSheetsService } from '@/lib/googleSheets';

export async function GET() {
  try {
    const googleSheetsService = new GoogleSheetsService();
    const salesData = await googleSheetsService.getSalesData();
    
    return NextResponse.json({ 
      success: true, 
      data: salesData,
      total: salesData.length 
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch sales data' 
      },
      { status: 500 }
    );
  }
}