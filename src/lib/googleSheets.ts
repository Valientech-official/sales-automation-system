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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async getSalesData(): Promise<SalesListItem[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_SHEET_ID!,
        range: 'A:K', // A列からK列まで（11列）
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
}