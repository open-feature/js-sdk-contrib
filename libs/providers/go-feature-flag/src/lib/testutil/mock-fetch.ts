// Mock Response class
export class MockResponse {
  public status: number;
  public headers: Headers;
  public body: string;
  public ok: boolean;

  constructor(status: number, body = '', headers: Record<string, string> = {}) {
    this.status = status;
    this.body = body;
    this.headers = new Headers(headers);
    this.ok = status >= 200 && status < 300;
  }

  async text(): Promise<string> {
    return this.body;
  }

  async json(): Promise<any> {
    return JSON.parse(this.body);
  }
}

// Mock fetch implementation
export class MockFetch {
  private responses: Map<string, MockResponse> = new Map();
  private lastRequest?: {
    url: string;
    options: RequestInit;
  };

  setResponse(url: string, response: MockResponse): void {
    this.responses.set(url, response);
  }

  setResponseByStatus(status: string, response: MockResponse): void {
    this.responses.set(status, response);
  }

  getLastRequest() {
    return this.lastRequest;
  }

  reset(): void {
    this.responses.clear();
    this.lastRequest = undefined;
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    this.lastRequest = { url, options };

    // Handle AbortSignal for timeout tests
    if (options.signal) {
      const signal = options.signal as AbortSignal;
      if (signal.aborted) {
        throw new Error('Request aborted');
      }

      // For timeout tests, we'll simulate a delay and then check if aborted
      if (url.includes('timeout')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (signal.aborted) {
          throw new Error('Request aborted');
        }
      }
    }

    // Check if we have a specific response for this URL
    if (this.responses.has(url)) {
      const response = this.responses.get(url);
      if (typeof response === 'function') {
        // Allow for dynamic response functions (for advanced mocking)
        return (response as any)(url, options) as Response;
      }
      return response as unknown as Response;
    }

    // Check if we have a response by status code
    const statusMatch = url.match(/(\d{3})/);
    if (statusMatch && this.responses.has(statusMatch[1])) {
      const response = this.responses.get(statusMatch[1]);
      if (typeof response === 'function') {
        // Allow for dynamic response functions (for advanced mocking)
        return (response as any)(url, options) as Response;
      }
      return response as unknown as Response;
    }

    // Check if we have a response by status code in the responses map
    for (const [key, response] of this.responses.entries()) {
      if (key.match(/^\d{3}$/) && response.status === parseInt(key)) {
        return response as unknown as Response;
      }
    }

    // Default response
    return new MockResponse(200, '{}') as unknown as Response;
  }
}
