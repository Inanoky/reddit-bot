export interface Config {
  redditClientId: string;
  redditClientSecret: string;
  redditUserAgent: string;
  redditUsername: string;
  redditPassword: string;
  openAiApiKey: string;
  openAiModel: string;
  businessName: string;
  businessUrl: string;
  businessDescription: string;
  allowSubreddits: string[];
  searchKeywords: string[];
  maxPostAgeHours: number;
  minScore: number;
}

export interface Candidate {
  postId: string;
  subreddit: string;
  title: string;
  selfText: string;
  url: string;
  score: number;
}

export interface PostedRecord {
  postId: string;
  subreddit: string;
  postTitle: string;
  postUrl: string;
  commentId: string;
  commentBody: string;
  postedAt: string;
}
