export type SessionKeys = { tavily: string; gemini: string; groq: string };
export type Source = { id: number; title: string; url: string; excerpt: string; publishedAt: string | null };
export type Claim = { text: string; citations: number[] };
export type SearchResult = { query: string; mode: "short" | "long"; status: "answered" | "partial" | "insufficient"; claims: Claim[]; uncertainties: string[]; sources: Source[]; searchedAt: string };

