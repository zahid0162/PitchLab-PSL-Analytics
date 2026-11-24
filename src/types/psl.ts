export type InferredColumnType = 'numeric' | 'categorical' | 'date' | 'boolean';

export interface TopValue {
  value: string;
  count: number;
  pct: number;
}

export interface ColumnStat {
  name: string;
  inferredType: InferredColumnType;
  nonNullCount: number;
  nullCount: number;
  missingPct: number;
  uniqueCount: number;
  isCardinalityCapped: boolean;
  // Numeric stats
  mean?: number;
  std?: number;
  min?: number;
  q25?: number;
  median?: number;
  q75?: number;
  max?: number;
  skewness?: number;
  kurtosis?: number;
  iqrOutliers?: number;
  zOutliers?: number;
  zeroPct?: number;
  // Categorical / general
  topValues: TopValue[];
}

export interface DetectedSchema {
  matchId: string;
  season: string;
  date: string;
  venue: string;
  battingTeam: string;
  bowlingTeam: string;
  tossWinner: string;
  tossDecision: string;
  innings: string;
  over: string;
  ball: string;
  batter: string;
  bowler: string;
  runsOffBat: string;
  extras: string;
  wicketType: string;
  winner: string;
}

export interface ChiSquareResult {
  chi2: number;
  pValue: number;
  dof: number;
  cramersV: number;
  sampleSize: number;
  batFirstWins: number;
  batFirstLosses: number;
  fieldFirstWins: number;
  fieldFirstLosses: number;
  tossWinnerMatchWinRate: number;
}

export interface WelchTTestResult {
  innings1Mean: number;
  innings1Std: number;
  innings1N: number;
  innings2Mean: number;
  innings2Std: number;
  innings2N: number;
  tStat: number;
  pValue: number;
  cohensD: number;
}

export interface EloSeries {
  team: string;
  finalElo: number;
  peakElo: number;
  matches: number;
  history: { matchIndex: number; elo: number }[];
}

export interface PhaseStat {
  phase: 'Powerplay (1-6)' | 'Middle (7-15)' | 'Death (16-20)';
  balls: number;
  runRate: number;
  dotBallPct: number;
  boundaryPct: number;
  wicketsPer100Balls: number;
}

export interface PslStatsSummary {
  chiSquare: ChiSquareResult | null;
  welchTest: WelchTTestResult | null;
  eloRatings: EloSeries[];
  phaseStats: PhaseStat[];
  venueBias: {
    venue: string;
    matches: number;
    avgFirstInningsScore: number;
    chaseWinPct: number;
  }[];
  hasCricketColumns: boolean;
}

export interface CsvProfile {
  fileName: string;
  fileSizeBytes: number;
  isSampleDataset: boolean;
  rowCount: number;
  columnCount: number;
  estimatedPandasMemoryMb: number;
  optimizedMemoryMb: number;
  parseDurationMs: number;
  columns: ColumnStat[];
  sampleRows: Record<string, string>[];
  detectedSchema: DetectedSchema;
  pslStats: PslStatsSummary;
}

export type ScriptCategory =
  | 'All'
  | 'Scale & Memory'
  | 'Statistics & Bayes'
  | 'Feature Engineering'
  | 'Unsupervised & Calibration';

export interface ScriptConfig {
  fileName: string;
  schema: DetectedSchema;
}

export interface PythonScriptModule {
  id: string;
  index: string;
  title: string;
  subtitle: string;
  category: Exclude<ScriptCategory, 'All'>;
  libraries: string[];
  complexity: 'Intermediate' | 'Advanced' | 'Principal ML';
  conceptSummary: string;
  statisticalIntuition: string;
  preMlTrapAvoided: string;
  expectedOutputPreview: string;
  generateCode: (config: ScriptConfig) => string;
}
