/**
 * Brave Search API integration for company verification
 * Provides search capabilities for enterprise information validation
 */

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  published?: string;
  language?: string;
}

export interface SearchResponse {
  query: string;
  results: BraveSearchResult[];
  hasMoreResults?: boolean;
}

export class BraveSearchTool {
  private readonly baseUrl = 'https://api.search.brave.com/res/v1';
  private readonly apiKey = process.env.BRAVE_API_KEY;

  constructor() {
    if (!this.apiKey) {
      throw new Error('BRAVE_API_KEY environment variable is required');
    }
  }

  /**
   * General web search function
   */
  async braveSearch(
    query: string, 
    options: {
      count?: number;
      country?: string;
      search_lang?: string;
      result_filter?: 'web' | 'videos' | 'discussions' | 'faq' | 'infobox' | 'locations' | 'summarizer';
      freshness?: string;
      offset?: number;
    } = {}
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(options.count || 10, 20)),
      country: options.country || 'JP',
      search_lang: options.search_lang || 'ja',
      ...(options.result_filter && { result_filter: options.result_filter }),
      ...(options.freshness && { freshness: options.freshness }),
      ...(options.offset !== undefined && { offset: String(Math.min(options.offset, 9)) })
    });

    try {
      const response = await fetch(`${this.baseUrl}/web/search?${params}`, {
        headers: {
          'X-Subscription-Token': this.apiKey!,
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'User-Agent': 'Mozilla/5.0 (compatible; sales-automation-bot/1.0)'
        }
      });

      if (!response.ok) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        
        if (response.status === 429) {
          console.warn('Rate limit exceeded. Remaining:', rateLimitRemaining, 'Reset:', rateLimitReset);
        }
        
        throw new Error(`Brave API Error: ${response.status} ${response.statusText}`);
      }

      this.updateRateLimitInfo(response.headers);

      const data = await response.json();
      
      return {
        query: data.query?.original || query,
        results: data.web?.results?.map((result: any) => ({
          title: result.title || '',
          url: result.url || '',
          description: result.description || '',
          published: this.extractPublishedDate(result),
          language: result.language || undefined
        })) || [],
        hasMoreResults: data.query?.more_results_available || false
      };

    } catch (error) {
      console.error('Brave Search Error:', error);
      return {
        query,
        results: [],
        hasMoreResults: false
      };
    }
  }

  /**
   * Company existence verification
   */
  async verifyCompanyExists(company: string, location?: string): Promise<{
    exists: boolean;
    officialSiteFound: boolean;
    companyInfoFound: boolean;
    confidence: number;
    sources: string[];
  }> {
    const queries = [
      `"${company}" ${location || ''} 会社概要`,
      `"${company}" 公式サイト`,
      `"${company}" 特定商取引法`,
      `"${company}" プライバシーポリシー`,
      company
    ];

    let totalResults = 0;
    let officialSiteFound = false;
    let companyInfoFound = false;
    const sources: string[] = [];

    for (const query of queries) {
      try {
        await this.rateLimitDelay();
        
        const result = await this.braveSearch(query.trim(), { 
          count: 10,
          country: 'JP',
          search_lang: 'ja'
        });

        totalResults += result.results.length;

        // 公式サイト判定
        const hasOfficialSite = result.results.some(r => {
          const isOfficial = r.url.includes(company.toLowerCase()) || 
                           r.title.includes('公式') ||
                           r.title.includes(company) ||
                           r.url.includes('company') ||
                           r.url.includes('about');
          
          if (isOfficial) sources.push(r.url);
          return isOfficial;
        });
        
        if (hasOfficialSite) officialSiteFound = true;

        // 企業情報判定
        const hasCompanyInfo = result.results.some(r =>
          r.description.includes(company) ||
          r.title.includes(company)
        );
        
        if (hasCompanyInfo) companyInfoFound = true;

      } catch (error) {
        console.error(`Brave検索エラー [${query}]:`, error);
      }
    }

    return {
      exists: totalResults > 5,
      officialSiteFound,
      companyInfoFound,
      confidence: Math.min(100, totalResults * 5),
      sources: [...new Set(sources)].slice(0, 5)
    };
  }

  /**
   * Phone number verification
   */
  async verifyPhoneNumber(phone: string, company: string): Promise<{
    phoneFound: boolean;
    companyLinked: boolean;
    confidence: number;
    sources: string[];
    businessListingFound: boolean;
  }> {
    const cleanPhone = phone.replace(/[-\s()]/g, '');
    const sources: string[] = [];
    
    // 基本検索クエリ
    const basicQueries = [
      `"${phone}" "${company}"`,
      `"${cleanPhone}" "${company}"`,
      `${phone} ${company} 連絡先`,
      `${company} 電話番号 ${phone}`,
      `${company} TEL ${phone}`,
      `${company} お問い合わせ ${phone}`
    ];

    let phoneMatches = 0;
    let companyMatches = 0;

    // 基本検索
    for (const query of basicQueries) {
      try {
        await this.rateLimitDelay();
        
        const result = await this.braveSearch(query, {
          count: 5,
          country: 'JP',
          search_lang: 'ja'
        });

        phoneMatches += result.results.filter(r => {
          const hasPhone = r.description.includes(phone) || 
                          r.description.includes(cleanPhone);
          if (hasPhone) sources.push(r.url);
          return hasPhone;
        }).length;

        companyMatches += result.results.filter(r =>
          r.description.includes(company) ||
          r.title.includes(company)
        ).length;

      } catch (error) {
        console.error(`電話番号検証エラー [${query}]:`, error);
      }
    }

    // ビジネスリスティング検索
    const businessListingFound = await this.checkBusinessListings(phone, company);

    return {
      phoneFound: phoneMatches > 0,
      companyLinked: phoneMatches > 0 && companyMatches > 0,
      confidence: Math.min(100, (phoneMatches + companyMatches) * 20),
      sources: [...new Set(sources)],
      businessListingFound
    };
  }

  /**
   * Business listing verification
   */
  private async checkBusinessListings(phone: string, company: string): Promise<boolean> {
    const businessQueries = [
      `site:itp.ne.jp "${company}" "${phone}"`,
      `site:mapion.co.jp "${company}" "${phone}"`,
      `site:google.com/maps "${company}" "${phone}"`,
      `"${company}" "${phone}" 営業時間`,
      `"${company}" "${phone}" 住所`
    ];

    for (const query of businessQueries) {
      try {
        await this.rateLimitDelay();
        
        const result = await this.braveSearch(query, {
          count: 3,
          country: 'JP',
          search_lang: 'ja'
        });

        const hasBusinessListing = result.results.some(r => 
          this.isBusinessListingSite(r.url)
        );

        if (hasBusinessListing) return true;
        
      } catch (error) {
        console.error(`ビジネスリスティング検索エラー [${query}]:`, error);
      }
    }

    return false;
  }

  /**
   * Check if URL is from a business listing site
   */
  private isBusinessListingSite(url: string): boolean {
    const businessSites = [
      'itp.ne.jp',
      'mapion.co.jp', 
      'google.com/maps',
      'yelp.com',
      'foursquare.com',
      'facebook.com',
      'navi.co.jp',
      'hotpepper.jp',
      'ekiten.jp'
    ];
    
    return businessSites.some(site => url.includes(site));
  }

  private rateLimitInfo: { rps: number; monthly: number; lastUpdate: number } = {
    rps: 1,
    monthly: 10000,
    lastUpdate: 0
  };

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limitHeader = headers.get('X-RateLimit-Limit');
    if (limitHeader) {
      const [rps, monthly] = limitHeader.split(', ').map(v => parseInt(v.trim()));
      if (rps && monthly) {
        this.rateLimitInfo = { rps, monthly, lastUpdate: Date.now() };
      }
    }
  }

  /**
   * Dynamic rate limiting
   */
  async rateLimitDelay(): Promise<void> {
    const delayMs = Math.ceil(1000 / this.rateLimitInfo.rps);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Extract published date with fallback logic
   */
  private extractPublishedDate(result: any): string | undefined {
    if (result.page_fetched) return result.page_fetched;
    if (result.page_age) return result.page_age;
    if (result.age) return result.age;
    if (result.published) return result.published;
    return undefined;
  }
}

// Export function declarations for Gemini Function Calling
export const braveSearchFunctions = {
  braveSearch: {
    name: 'braveSearch',
    description: 'Search the web using Brave Search API for company verification',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string'
        },
        options: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of results (max 20)' },
            country: { type: 'string', description: 'Country code', default: 'JP' },
            search_lang: { type: 'string', description: 'Search language', default: 'ja' }
          }
        }
      },
      required: ['query']
    }
  },

  verifyCompanyExists: {
    name: 'verifyCompanyExists',
    description: 'Verify if a company exists using multiple search queries',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        company: {
          type: 'string',
          description: 'Company name to verify'
        },
        location: {
          type: 'string',
          description: 'Company location (optional)'
        }
      },
      required: ['company']
    }
  },

  verifyPhoneNumber: {
    name: 'verifyPhoneNumber',
    description: 'Verify if a phone number is associated with a company',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number to verify'
        },
        company: {
          type: 'string',
          description: 'Company name to check association'
        }
      },
      required: ['phone', 'company']
    }
  }
};