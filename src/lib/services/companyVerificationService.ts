/**
 * Company Verification Service
 * Integrates DataForSEO and Brave Search for comprehensive company information extraction and verification
 */

import { GoogleGenerativeAI, FunctionDeclaration, FunctionCallingConfigMode } from '@google/generative-ai';
import { DataForSeoService, ContactInfo } from './dataForSeoService';
import { BraveSearchTool, braveSearchFunctions } from './braveSearchTool';

export interface CompanyInfo {
  company: string;
  location: string;
  phone?: string;
  email?: string;
  website?: string;
  verified: boolean;
  verification: {
    phoneVerified: boolean;
    companyExists: boolean;
    websiteMatches: boolean;
    confidence: number;
    sources: string[];
  };
}

export class CompanyVerificationService {
  private dataForSeo: DataForSeoService;
  private braveSearch: BraveSearchTool;
  private ai: GoogleGenerativeAI;

  constructor() {
    this.dataForSeo = new DataForSeoService();
    this.braveSearch = new BraveSearchTool();
    this.ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  // Gemini Function Calling用ツール定義
  private functionDeclarations: FunctionDeclaration[] = [
    {
      name: 'dataforseo_serp_search',
      description: 'DataForSEO SERP検索で企業の公式情報を取得',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '検索キーワード' },
          depth: { type: 'number', description: '検索結果数', default: 10 }
        },
        required: ['keyword']
      }
    },
    {
      name: 'dataforseo_content_parse',
      description: 'DataForSEO ページ解析で企業詳細情報を抽出',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          target_url: { type: 'string', description: '解析対象URL' }
        },
        required: ['target_url']
      }
    },
    ...Object.values(braveSearchFunctions)
  ];

  /**
   * Main method: Extract and verify company information
   */
  async extractAndVerifyCompany(company: string, location: string): Promise<CompanyInfo> {
    const model = this.ai.getGenerativeModel({ 
      model: 'gemini-2.0-flash-001' 
    });

    const systemPrompt = `あなたは企業情報収集・検証AIエージェントです。

【目的】
企業「${company}」（所在地：${location}）の正確な連絡先情報を収集し、信頼性を検証する

【処理手順】
1. dataforseo_serp_search: "${company} ${location} 公式サイト 会社概要 お問い合わせ" で検索
2. 上位3サイトに対してdataforseo_content_parse: ページ解析実行
3. 連絡先情報を抽出（会社名、住所、電話、メール、URL）
4. braveSearch: 企業存在の確認
5. 電話番号が取得できた場合: verifyPhoneNumber: 電話番号検証
6. 信頼性スコア算出（0-100）

【検証基準】
- 企業存在確認: 複数ソースで企業名が確認できるか
- 電話番号検証: 企業名と電話番号の組み合わせが検索で確認できるか
- ウェブサイト一致: 取得した情報と公式サイトの整合性
- 信頼性スコア: 上記要素の総合評価

【重要】
- 推測で値を作らない。必ずツール呼び出しで取得する
- 連絡先情報は正規表現で正確に抽出する
- メール: [A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}
- 電話: 0\\d{1,4}-\\d{1,4}-\\d{3,4}

【出力形式】JSON
{
  "company": "正式企業名",
  "location": "正式住所", 
  "phone": "電話番号",
  "email": "メールアドレス",
  "website": "公式サイトURL",
  "verified": true/false,
  "verification": {
    "phoneVerified": true/false,
    "companyExists": true/false, 
    "websiteMatches": true/false,
    "confidence": 85,
    "sources": ["url1", "url2"]
  }
}

実行してください。`;

    try {
      const response = await model.generateContent({
        contents: systemPrompt,
        config: {
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [
                'dataforseo_serp_search',
                'dataforseo_content_parse', 
                'braveSearch',
                'verifyPhoneNumber'
              ]
            }
          },
          tools: [{ functionDeclarations: this.functionDeclarations }]
        }
      });

      // Function Call処理
      if (response.response.functionCalls()) {
        const results = await this.executeFunctionCalls(response.response.functionCalls());
        
        // 最終結果をAIに統合させる
        const finalResponse = await model.generateContent({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: response.response.candidates?.[0]?.content?.parts || [] },
            { role: 'user', parts: results }
          ]
        });

        return this.parseCompanyInfo(finalResponse.response.text() || '', company, location);
      }

      return this.createFallbackCompanyInfo(company, location);
      
    } catch (error) {
      console.error('企業情報検証エラー:', error);
      return this.createFallbackCompanyInfo(company, location);
    }
  }

  /**
   * Execute function calls
   */
  private async executeFunctionCalls(calls: any[]): Promise<any[]> {
    const results = [];

    for (const call of calls) {
      try {
        let result;
        
        console.log(`🔧 実行中: ${call.name} - ${JSON.stringify(call.args)}`);
        
        switch (call.name) {
          case 'dataforseo_serp_search':
            result = await this.dataForSeo.searchGoogle(call.args.keyword, call.args.depth);
            break;
            
          case 'dataforseo_content_parse':
            result = await this.dataForSeo.parseContent(call.args.target_url);
            break;
            
          case 'braveSearch':
            result = await this.braveSearch.braveSearch(call.args.query, call.args.options);
            break;
            
          case 'verifyCompanyExists':
            result = await this.braveSearch.verifyCompanyExists(call.args.company, call.args.location);
            break;
            
          case 'verifyPhoneNumber':
            result = await this.braveSearch.verifyPhoneNumber(call.args.phone, call.args.company);
            break;
            
          default:
            throw new Error(`Unknown function: ${call.name}`);
        }

        results.push({
          functionResponse: {
            name: call.name,
            response: result
          }
        });

        console.log(`✅ 完了: ${call.name}`);

        // レート制限対応
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Function ${call.name} 実行エラー:`, error);
        results.push({
          functionResponse: {
            name: call.name,
            response: { error: error instanceof Error ? error.message : String(error) }
          }
        });
      }
    }

    return results;
  }

  /**
   * Comprehensive company search using multiple methods
   */
  async comprehensiveCompanySearch(company: string, location: string): Promise<CompanyInfo> {
    try {
      // 1. DataForSEO SERP検索
      const serpResults = await this.dataForSeo.searchCompanyWebsite(company, location);
      
      let contactInfo: ContactInfo = {
        company: '',
        address: '',
        phone: '',
        email: '',
        website: ''
      };

      // 2. ページ解析（上位3サイト）
      for (const url of serpResults.slice(0, 3)) {
        try {
          const pageContent = await this.dataForSeo.parseContent(url);
          const extractedInfo = this.dataForSeo.extractContactInfo(pageContent);
          
          // より詳細な情報があれば更新
          if (extractedInfo.company && !contactInfo.company) contactInfo.company = extractedInfo.company;
          if (extractedInfo.address && !contactInfo.address) contactInfo.address = extractedInfo.address;
          if (extractedInfo.phone && !contactInfo.phone) contactInfo.phone = extractedInfo.phone;
          if (extractedInfo.email && !contactInfo.email) contactInfo.email = extractedInfo.email;
          if (extractedInfo.website && !contactInfo.website) contactInfo.website = extractedInfo.website;
          
        } catch (error) {
          console.error(`ページ解析エラー [${url}]:`, error);
        }
      }

      // 3. Brave Search検証
      const companyVerification = await this.braveSearch.verifyCompanyExists(company, location);
      
      let phoneVerification = null;
      if (contactInfo.phone) {
        phoneVerification = await this.braveSearch.verifyPhoneNumber(contactInfo.phone, company);
      }

      // 4. 信頼性スコア算出
      const confidence = this.calculateConfidence({
        companyExists: companyVerification.exists,
        officialSiteFound: companyVerification.officialSiteFound,
        phoneVerified: phoneVerification?.phoneFound || false,
        contactInfoExtracted: !!(contactInfo.phone || contactInfo.email),
        multipleSourcesFound: serpResults.length > 1
      });

      return {
        company: contactInfo.company || company,
        location: contactInfo.address || location,
        phone: contactInfo.phone,
        email: contactInfo.email,
        website: contactInfo.website || serpResults[0],
        verified: confidence >= 60,
        verification: {
          phoneVerified: phoneVerification?.phoneFound || false,
          companyExists: companyVerification.exists,
          websiteMatches: serpResults.length > 0,
          confidence,
          sources: [...companyVerification.sources, ...serpResults].slice(0, 5)
        }
      };

    } catch (error) {
      console.error('総合企業検索エラー:', error);
      return this.createFallbackCompanyInfo(company, location);
    }
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(factors: {
    companyExists: boolean;
    officialSiteFound: boolean;
    phoneVerified: boolean;
    contactInfoExtracted: boolean;
    multipleSourcesFound: boolean;
  }): number {
    let score = 0;

    // 企業存在確認 (40点)
    if (factors.companyExists) score += 40;
    
    // 公式サイト発見 (20点)
    if (factors.officialSiteFound) score += 20;
    
    // 電話番号検証 (25点)
    if (factors.phoneVerified) score += 25;
    
    // 連絡先情報抽出 (10点)
    if (factors.contactInfoExtracted) score += 10;
    
    // 複数ソース確認 (5点)
    if (factors.multipleSourcesFound) score += 5;

    return Math.min(100, score);
  }

  /**
   * Parse AI response to CompanyInfo
   */
  private parseCompanyInfo(text: string, fallbackCompany: string, fallbackLocation: string): CompanyInfo {
    try {
      // JSON抽出の試行
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 必須フィールドの検証
        if (parsed.company && parsed.location) {
          return {
            ...parsed,
            verified: parsed.verification?.confidence >= 60
          };
        }
      }
    } catch (error) {
      console.error('JSON解析エラー:', error);
    }

    // フォールバック: テキスト解析
    return this.parseTextToCompanyInfo(text, fallbackCompany, fallbackLocation);
  }

  /**
   * Parse text response to CompanyInfo
   */
  private parseTextToCompanyInfo(text: string, fallbackCompany: string, fallbackLocation: string): CompanyInfo {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const phonePattern = /0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g;
    
    return {
      company: this.extractValue(text, ['会社名', 'company']) || fallbackCompany,
      location: this.extractValue(text, ['住所', 'location', 'address']) || fallbackLocation,
      phone: text.match(phonePattern)?.[0] || '',
      email: text.match(emailPattern)?.[0] || '',
      website: this.extractValue(text, ['website', 'url']) || '',
      verified: false,
      verification: {
        phoneVerified: false,
        companyExists: text.includes('exists: true') || text.includes('企業存在'),
        websiteMatches: text.includes('website') || text.includes('公式サイト'),
        confidence: this.extractConfidenceFromText(text),
        sources: []
      }
    };
  }

  /**
   * Extract value from text using multiple key patterns
   */
  private extractValue(text: string, keys: string[]): string {
    for (const key of keys) {
      const patterns = [
        new RegExp(`"${key}"[:\\s]*"([^"]+)"`, 'i'),
        new RegExp(`${key}[：:]?\\s*([^\\n\\r,}]+)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1].trim();
      }
    }
    return '';
  }

  /**
   * Extract confidence score from text
   */
  private extractConfidenceFromText(text: string): number {
    const confidencePatterns = [
      /"confidence"[:\s]*(\d+)/i,
      /信頼度[：:]?\s*(\d+)/i,
      /confidence[：:]?\s*(\d+)/i
    ];

    for (const pattern of confidencePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return parseInt(match[1]);
      }
    }

    return 0;
  }

  /**
   * Create fallback CompanyInfo
   */
  private createFallbackCompanyInfo(company: string, location: string): CompanyInfo {
    return {
      company,
      location,
      verified: false,
      verification: {
        phoneVerified: false,
        companyExists: false,
        websiteMatches: false,
        confidence: 0,
        sources: []
      }
    };
  }
}