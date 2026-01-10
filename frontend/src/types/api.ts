export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  best_ranking?: {
    points: number;
    subject: string;
  };
}

export interface Subject {
  id: number;
  name: string;
  color: string;
  icon_name: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  subject: number;
  toc_pdf_url: string;
}

export interface Question {
  id: number;
  book: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer?: string; // Tylko po zakończeniu pytania!
}

export interface Match {
  id: number;
  player1: User;
  player2: User | null;
  book: Book;
  subject: Subject;
  status: 'waiting' | 'ready' | 'active' | 'finished';
  current_question_index: number;
  player1_score: number;
  player2_score: number;
  winner: User | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface UserRanking {
  id: number;
  user: User;
  subject: Subject;
  points: number;
  wins: number;
  losses: number;
  updated_at: string;
}

export interface RankingEntry {
  position: number;
  user: User;
  points: number;
  wins: number;
  losses: number;
  subject_id?: number;
}

export interface Benefit {
  id: number;
  user: number;
  benefit_type: 'parking';
  usage_count: number;
  max_usage: number;
  remaining_usage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MatchQuestion {
  id: number;
  match: number;
  question: Question;
  question_order: number;
  player1_answer: string | null;
  player2_answer: string | null;
  player1_correct: boolean | null;
  player2_correct: boolean | null;
  answered_at: string | null;
}

export interface MatchResult {
  question: Question;
  your_answer: string;
  your_correct: boolean;
  opponent_answer: string;
  opponent_correct: boolean;
}

export interface MatchEndData {
  match_id: number;
  player1_score: number;
  player2_score: number;
  winner_id: number | null;
  questions: MatchResult[];
}
