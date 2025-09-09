import { google } from 'googleapis';

export interface SalesListItem {
  企業名: string;
  住所: string;
  電話番号: string;
  ウェブサイト: string;
  メール: string;
  評価: string;
  レビュー数: string;
  カテゴリ: string;
  検索条件: string;
  地域: string;
  取得日時: string;
}

// CSV処理結果用の新しいインターフェース
export interface CSVProcessingResult {
  処理番号: number;
  法人番号: string;
  企業名: string;
  市区町村: string;
  都道府県: string;
  電話番号: string;
  メール: string;
  ウェブサイト: string;
  信頼度: number;
  処理成功: boolean;
  処理時間: number;
  取得日時: string;
  エラー: string;
}

export class GoogleSheetsService {
  private sheets;

  constructor() {
    const credentials = {
      type: 'service_account',
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    };

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async getSalesData(): Promise<SalesListItem[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: '営業リスト!A:K', // A列からK列まで（11列）
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return [];
      }

      // ヘッダー行をスキップして、データを変換
      const [header, ...dataRows] = rows;
      
      return dataRows.map((row) => ({
        企業名: row[0] || '',
        住所: row[1] || '',
        電話番号: row[2] || '',
        ウェブサイト: row[3] || '',
        メール: row[4] || '',
        評価: row[5] || '',
        レビュー数: row[6] || '',
        カテゴリ: row[7] || '',
        検索条件: row[8] || '',
        地域: row[9] || '',
        取得日時: row[10] || '',
      }));
    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error);
      throw new Error('Failed to fetch sales data');
    }
  }

  /**
   * CSV処理結果をスプレッドシートに追加
   */
  async appendCSVResult(result: CSVProcessingResult, sheetName: string = '営業リストV2'): Promise<void> {
    try {
      const values = [[
        result.処理番号,
        result.法人番号,
        result.企業名,
        result.市区町村,
        result.都道府県,
        result.電話番号,
        result.メール,
        result.ウェブサイト,
        result.信頼度,
        result.処理成功 ? '成功' : '失敗',
        result.処理時間,
        result.取得日時,
        result.エラー
      ]];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: `${sheetName}!A:M`, // A列からM列まで（13列）
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values
        }
      });

      console.log(`✅ スプレッドシート保存完了: ${result.企業名}`);
    } catch (error) {
      console.error('❌ スプレッドシート保存エラー:', error);
      throw new Error('Failed to save to Google Sheets');
    }
  }

  /**
   * スプレッドシートの初期化（ヘッダー行作成）
   */
  async initializeCSVSheet(sheetName: string = '営業リストV2'): Promise<void> {
    try {
      const headers = [
        '処理番号', '法人番号', '企業名', '市区町村', '都道府県',
        '電話番号', 'メール', 'ウェブサイト', '信頼度', '処理成功',
        '処理時間(ms)', '取得日時', 'エラー'
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: `${sheetName}!A1:M1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });

      console.log(`📋 スプレッドシート初期化完了: ${sheetName}`);
    } catch (error) {
      console.error('❌ スプレッドシート初期化エラー:', error);
      throw new Error('Failed to initialize Google Sheets');
    }
  }

  /**
   * 一括処理結果の保存
   */
  async appendMultipleCSVResults(results: CSVProcessingResult[], sheetName: string = '営業リストV2'): Promise<void> {
    try {
      const values = results.map(result => [
        result.処理番号,
        result.法人番号,
        result.企業名,
        result.市区町村,
        result.都道府県,
        result.電話番号,
        result.メール,
        result.ウェブサイト,
        result.信頼度,
        result.処理成功 ? '成功' : '失敗',
        result.処理時間,
        result.取得日時,
        result.エラー
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: `${sheetName}!A:M`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values
        }
      });

      console.log(`✅ 一括スプレッドシート保存完了: ${results.length}件`);
    } catch (error) {
      console.error('❌ 一括スプレッドシート保存エラー:', error);
      throw new Error('Failed to save multiple results to Google Sheets');
    }
  }

  /**
   * 営業リストV2の行数を取得（自動index計算用）
   */
  async getProcessedCount(sheetName: string = '営業リストV2'): Promise<number> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: `${sheetName}!A:A`, // A列のみ取得（処理番号）
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return 0; // データなし = 0件処理済み
      }

      // ヘッダー行を除いた行数 = 処理済み件数
      const processedCount = rows.length - 1;
      console.log(`📊 ${sheetName}の処理済み件数: ${processedCount}件`);
      
      return Math.max(0, processedCount); // 負の値を防ぐ
      
    } catch (error) {
      console.error('❌ 行数取得エラー:', error);
      // エラー時は0を返して最初から開始
      return 0;
    }
  }

  /**
   * 次に処理すべきindexを自動計算
   */
  async getNextProcessingIndex(sheetName: string = '営業リストV2'): Promise<number> {
    const processedCount = await this.getProcessedCount(sheetName);
    
    // 処理済み件数 = 次のindex（0ベース）
    const nextIndex = processedCount;
    
    console.log(`🎯 次の処理対象: ${nextIndex + 1}件目 (index: ${nextIndex})`);
    return nextIndex;
  }
}