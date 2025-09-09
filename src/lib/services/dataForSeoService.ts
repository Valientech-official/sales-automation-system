/**
 * DataForSEO API Service
 * Handles SERP search, OnPage analysis, and Jobs API
 */

export interface JobResult {
  title: string;
  employer_name: string;
  location: string;
  salary: string;
  contract_type: string;
  source_url: string;
  timestamp: string;
}

export interface SerpResult {
  title: string;
  url: string;
  description: string;
  domain: string;
}

export interface PageContent {
  url: string;
  content: string;
  headings: any[];
  table_content: any[];
  links: any[];
  meta: any;
}

export interface ContactInfo {
  company: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

export class DataForSeoService {
  private baseUrl = 'https://api.dataforseo.com/v3';
  private auth: string;

  constructor() {
    const username = process.env.DATAFORSEO_USERNAME;
    const password = process.env.DATAFORSEO_PASSWORD;
    
    if (!username || !password) {
      throw new Error('DataForSEO credentials are required');
    }
    
    this.auth = Buffer.from(`${username}:${password}`).toString('base64');
  }

  // Jobs API - ランダム求人データ取得
  async getJobsData(): Promise<JobResult[]> {
    try {
      // 1. タスク作成
      const taskResponse = await this.createJobsTask();
      const taskId = taskResponse.tasks[0]?.id;
      
      if (!taskId) {
        throw new Error('Failed to create jobs task');
      }

      // 2. タスク完了待機
      await this.waitForTaskReady(taskId);

      // 3. 結果取得
      const results = await this.getJobsTaskResult(taskId);
      
      return this.parseJobsResults(results);
      
    } catch (error) {
      console.error('Jobs API エラー:', error);
      return [];
    }
  }

  // Jobs タスク作成
  private async createJobsTask() {
    const searchParams = this.generateRandomSearchParams();
    
    const response = await fetch(`${this.baseUrl}/serp/google/jobs/task_post`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        keyword: searchParams.keyword,
        location_code: 2392, // 日本
        language_code: 'ja',
        depth: 30
      }])
    });

    if (!response.ok) {
      throw new Error(`Jobs task creation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // タスク完了待機
  private async waitForTaskReady(taskId: string): Promise<void> {
    for (let i = 0; i < 10; i++) { // 最大10回試行
      const response = await fetch(`${this.baseUrl}/serp/google/jobs/tasks_ready`, {
        headers: { 'Authorization': `Basic ${this.auth}` }
      });

      const data = await response.json();
      const readyTasks = data.tasks?.[0]?.result || [];
      
      if (readyTasks.some((task: any) => task.id === taskId)) {
        return; // タスク完了
      }

      await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
    }
    
    throw new Error('Task did not complete in time');
  }

  // Jobs結果取得
  private async getJobsTaskResult(taskId: string) {
    const response = await fetch(`${this.baseUrl}/serp/google/jobs/task_get/advanced/${taskId}`, {
      headers: { 'Authorization': `Basic ${this.auth}` }
    });

    if (!response.ok) {
      throw new Error(`Jobs result fetch failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // SERP検索
  async searchGoogle(keyword: string, depth: number = 10): Promise<SerpResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/serp/google/organic/live/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          keyword,
          location_code: 2392,
          language_code: 'ja',
          device: 'desktop',
          os: 'windows',
          depth
        }])
      });

      if (!response.ok) {
        throw new Error(`SERP search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const items = data.tasks[0]?.result[0]?.items || [];
      
      return items.map((item: any) => ({
        title: item.title || '',
        url: item.url || '',
        description: item.description || '',
        domain: item.domain || ''
      }));

    } catch (error) {
      console.error(`SERP検索エラー [${keyword}]:`, error);
      return [];
    }
  }

  // ページ内容解析
  async parseContent(url: string): Promise<PageContent> {
    try {
      const response = await fetch(`${this.baseUrl}/on_page/content_parsing/live`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          url,
          enable_javascript: false
        }])
      });

      if (!response.ok) {
        throw new Error(`Content parsing failed: ${response.statusText}`);
      }

      const data = await response.json();
      const result = data.tasks[0]?.result[0];
      
      return {
        url,
        content: result?.content || '',
        headings: result?.headings || [],
        table_content: result?.table_content || [],
        links: result?.links || [],
        meta: result?.meta || {}
      };

    } catch (error) {
      console.error(`ページ解析エラー [${url}]:`, error);
      return {
        url,
        content: '',
        headings: [],
        table_content: [],
        links: [],
        meta: {}
      };
    }
  }

  // 連絡先情報抽出
  extractContactInfo(pageContent: PageContent): ContactInfo {
    const { content, table_content } = pageContent;
    const fullText = content + ' ' + JSON.stringify(table_content);

    return {
      company: this.extractCompany(fullText),
      address: this.extractAddress(fullText),
      phone: this.extractPhone(fullText),
      email: this.extractEmail(fullText),
      website: pageContent.url
    };
  }

  // 企業公式サイト候補検索
  async searchCompanyWebsite(company: string, location: string): Promise<string[]> {
    const searchQueries = [
      `"${company}" ${location} 公式サイト`,
      `"${company}" ${location} 会社概要`,
      `"${company}" ${location} お問い合わせ`,
      `"${company}" 特定商取引法`,
      `"${company}" プライバシーポリシー`
    ];

    const candidateUrls: string[] = [];

    for (const query of searchQueries) {
      try {
        const results = await this.searchGoogle(query, 10);
        const urls = this.extractOfficialUrls(results, company);
        candidateUrls.push(...urls);
        
        if (candidateUrls.length >= 5) break;
        
      } catch (error) {
        console.error(`検索エラー [${query}]:`, error);
        continue;
      }
    }

    return this.prioritizeUrls([...new Set(candidateUrls)], company);
  }

  // 公式サイトURL抽出
  private extractOfficialUrls(serpResults: SerpResult[], company: string): string[] {
    const companyKeywords = company.toLowerCase()
      .replace(/株式会社|有限会社|合同会社|合資会社|合名会社/g, '')
      .trim();

    return serpResults
      .filter(item => {
        const url = item.url?.toLowerCase() || '';
        const title = item.title?.toLowerCase() || '';
        
        // 除外条件
        const excludePatterns = [
          'indeed.com', 'rikunabi.com', 'mynavi.com', 'doda.com',
          'recruit.co.jp', 'jobfind.jp', 'workport.co.jp',
          'kakaku.com', 'tabelog.com', 'yelp.com'
        ];
        
        if (excludePatterns.some(pattern => url.includes(pattern))) {
          return false;
        }

        // 公式サイト判定
        return (
          url.includes(companyKeywords) ||
          title.includes('公式') ||
          title.includes('会社概要') ||
          title.includes('お問い合わせ') ||
          url.includes('company') ||
          url.includes('about') ||
          url.includes('contact')
        );
      })
      .map(item => item.url)
      .slice(0, 3);
  }

  // URL優先順位付け
  private prioritizeUrls(urls: string[], company: string): string[] {
    const companyDomain = this.extractDomain(company);
    
    return urls.sort((a, b) => {
      let scoreA = 0, scoreB = 0;
      
      if (a.includes(companyDomain)) scoreA += 10;
      if (b.includes(companyDomain)) scoreB += 10;
      
      if (a.includes('/company') || a.includes('/about')) scoreA += 5;
      if (b.includes('/company') || b.includes('/about')) scoreB += 5;
      
      if (a.includes('/contact') || a.includes('/inquiry')) scoreA += 3;
      if (b.includes('/contact') || b.includes('/inquiry')) scoreB += 3;
      
      return scoreB - scoreA;
    });
  }

  // ランダム検索パラメータ生成
  private generateRandomSearchParams() {
    const prefectures = [
      '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
      '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
      '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
      '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
      '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
      '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
      '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const industries = [
      'IT・通信', '製造業', '金融', '医療・福祉', '教育',
      '建設・不動産', '小売・卸売', 'サービス業', '公務員'
    ];

    const jobTypes = [
      'エンジニア', '営業', 'マーケティング', '企画', '人事',
      '経理・財務', 'デザイナー', 'コンサルタント', '管理職'
    ];

    const randomPrefecture = prefectures[Math.floor(Math.random() * prefectures.length)];
    const randomIndustry = industries[Math.floor(Math.random() * industries.length)];
    const randomJobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];

    return {
      keyword: `${randomIndustry} ${randomJobType}`,
      prefecture: randomPrefecture,
      industry: randomIndustry,
      jobType: randomJobType
    };
  }

  // Jobs結果解析
  private parseJobsResults(data: any): JobResult[] {
    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    
    return items.map((item: any) => ({
      title: item.title || '',
      employer_name: item.employer_name || '',
      location: item.location || '',
      salary: item.salary || '',
      contract_type: item.contract_type || '',
      source_url: item.source_url || '',
      timestamp: item.timestamp || new Date().toISOString()
    }));
  }

  // 正規表現抽出メソッド
  private extractEmail(text: string): string {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const matches = text.match(emailPattern);
    return matches?.[0] || '';
  }

  private extractPhone(text: string): string {
    const phonePattern = /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
    const matches = text.match(phonePattern);
    return matches?.[0]?.replace(/[-\s]/g, '-') || '';
  }

  private extractAddress(text: string): string {
    const addressPattern = /〒?\d{3}-?\d{4}\s*[^\s]+[都道府県][^\s]*[市区町村][^\s]*/g;
    const matches = text.match(addressPattern);
    return matches?.[0] || '';
  }

  private extractCompany(text: string): string {
    const companyPatterns = [
      /販売業者[：:]\s*([^\n\r]+)/g,
      /会社名[：:]\s*([^\n\r]+)/g,
      /事業者名[：:]\s*([^\n\r]+)/g,
      /運営会社[：:]\s*([^\n\r]+)/g
    ];
    
    for (const pattern of companyPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    
    return '';
  }

  private extractDomain(company: string): string {
    return company.toLowerCase()
      .replace(/株式会社|有限会社|合同会社/g, '')
      .replace(/\s+/g, '')
      .substring(0, 10);
  }
}