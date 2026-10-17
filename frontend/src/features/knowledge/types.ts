export interface Policy {
  id: string;
  title: string;
  category: string;
  version: string;
  summary: string;
  sections: string[];
}

export interface PolicyMatch {
  reference: string;
  documentId: string;
  version: string;
  title: string;
  category: string;
  section: string;
  text: string;
  sha256: string;
  score: number;
  matchedTerms: string[];
}

export interface PolicySearch {
  query: string;
  method: string;
  results: PolicyMatch[];
  modelCalls: number;
}
