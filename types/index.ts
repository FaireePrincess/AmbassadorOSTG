export type Platform = 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'telegram';
export type SubmissionStatus = 'pending' | 'approved' | 'needs_edits' | 'rejected';
export type TaskStatus = 'active' | 'upcoming' | 'completed';
export type EventType = 'irl' | 'online';
export type AssetType = 'image' | 'video' | 'document' | 'template';
export type UserRole = 'ambassador' | 'regional_lead' | 'admin';
export type SeasonStatus = 'active' | 'closed';

export type UserStatus = 'pending' | 'active' | 'suspended';

export interface User {
  id: string;
  name: string;
  avatar: string;
  email: string;
  username?: string;
  password?: string;
  role: UserRole;
  region: string;
  points: number;
  rank: number;
  season_points?: number;
  season_rank?: number | null;
  season_submission_count?: number;
  season_approved_count?: number;
  status: UserStatus;
  inviteCode?: string;
  handles: {
    twitter?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    facebook?: string;
    telegram?: string;
    discord?: string;
  };
  fslEmail?: string;
  stats: {
    totalPosts: number;
    totalImpressions: number;
    totalLikes: number;
    totalRetweets: number;
    xFollowers?: number;
    completedTasks: number;
  };
  joinedAt: string;
  activatedAt?: string;
  sessionVersion?: number;
}

export interface Campaign {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  platforms: Platform[];
  totalTasks: number;
  completedTasks: number;
}

export interface Task {
  id: string;
  seasonId?: string;
  campaignId: string;
  campaignTitle: string;
  title: string;
  brief: string;
  thumbnail?: string;
  platforms: Platform[];
  hashtags: string[];
  mentions: string[];
  dos: string[];
  donts: string[];
  deadline: string;
  points: number;
  status: TaskStatus;
  submissions: number;
  maxSubmissions?: number;
  assetIds?: string[];
  requiredReferenceTweetUrl?: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  folderId?: string;
  url: string;
  thumbnail: string;
  campaignId?: string;
  campaignTitle?: string;
  platforms: Platform[];
  format: string;
  size: string;
  downloadCount: number;
  createdAt: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  type: EventType;
  thumbnail: string;
  date: string;
  time: string;
  location: string;
  timezone: string;
  attendees: number;
  maxAttendees?: number;
  isRsvped: boolean;
  link?: string;
}

export interface SubmissionRating {
  relevanceToTask: number; // 0-25: Followed brief, correct hashtags/tags/platform/message
  creativity: number; // 0-15: Angle, storytelling, originality of presentation
  originality: number; // 0-15: Own content, not copy-paste/duplicate/lazy
  effortFormat: number; // 0-15: Effort level (text < image < edited video/IRL/voice)
  enthusiasmTone: number; // 0-10: Genuine support, positive energy, not forced
  engagementScore: number; // 0-20 (MAX): Based on impressions/likes/replies/RTs relative to account size
  totalScore: number; // Calculated total score (0-100)
  notes?: string; // Admin notes on the rating
}

export interface Submission {
  id: string;
  seasonId?: string;
  userId: string; // Ties submission to the user who created it
  taskId: string;
  taskTitle: string;
  campaignTitle: string;
  platform: Platform;
  platforms?: Platform[];
  postUrl: string;
  links?: Array<{ platform: Platform; url: string }>;
  screenshotUrl?: string;
  notes?: string;
  status: SubmissionStatus;
  feedback?: string;
  submittedAt: string;
  reviewedAt?: string;
  rating?: SubmissionRating; // Admin rating
  metrics?: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  };
  xImpressions?: number;
  xLikes?: number;
  xReplies?: number;
  xReposts?: number;
  xLastFetchedAt?: string;
  xTrackingExpiresAt?: string;
  flaggedForReview?: boolean;
  flaggedReason?: string;
}

export interface AmbassadorPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userRegion: string;
  platform: Platform;
  campaignTitle: string;
  content: string;
  postUrl: string;
  thumbnail?: string;
  metrics: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  };
  postedAt: string;
}

export interface Season {
  id: string;
  number: number;
  name: string;
  status: SeasonStatus;
  startedAt: string;
  endedAt?: string;
  closedByUserId?: string;
  closedByName?: string;
  resetUserCount?: number;
}

export interface SeasonResetLog {
  id: string;
  createdByAdmin: string;
  previousSeasonId: string;
  newSeasonId: string;
  createdAt: string;
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  region?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface PollOption {
  id: string;
  pollId: string;
  label: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: string;
}
