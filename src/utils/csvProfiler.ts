import Papa from 'papaparse';
import type {
  ChiSquareResult,
  ColumnStat,
  CsvProfile,
  DetectedSchema,
  EloSeries,
  InferredColumnType,
  PhaseStat,
  PslStatsSummary,
  WelchTTestResult,
} from '../types/psl';

const RESERVOIR_LIMIT = 4000;
const CARDINALITY_CAP = 3000;
const PREVIEW_ROW_LIMIT = 60;

interface ColumnAccumulator {
  name: string;
  nonNullCount: number;
  nullCount: number;
  numericCount: number;
  booleanCount: number;
  dateCount: number;
  zeroCount: number;
  // Online moments (Pébay 2008 for mean, M2, M3, M4)
  n: number;
  mean: number;
  m2: number;
  m3: number;
  m4: number;
  min: number;
  max: number;
  reservoir: number[];
  freq: Map<string, number>;
  cardinalityCapped: boolean;
}

const DATE_REGEX = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s|T|$)/;

function isMissing(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const s = String(val).trim();
  return s === '' || s === 'NA' || s === 'N/A' || s === 'null' || s === 'None' || s === 'NaN';
}

function parseNumeric(raw: string): number | null {
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function isBooleanToken(raw: string): boolean {
  const lower = raw.toLowerCase();
  return lower === 'true' || lower === 'false' || lower === 'yes' || lower === 'no';
}

function erfc(x: number): number {
  // Abramowitz and Stegun 7.1.26 approximation (max error ~1.5e-7)
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2 - ans;
}

function normalTwoTailedP(z: number): number {
  return Math.min(1, Math.max(0, erfc(Math.abs(z) / Math.SQRT2)));
}

function chiSquareDf1P(chi2: number): number {
  if (chi2 <= 0) return 1;
  return Math.min(1, Math.max(0, erfc(Math.sqrt(chi2 / 2))));
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function detectPslSchema(headers: string[]): DetectedSchema {
  const lowerMap = new Map<string, string>();
  headers.forEach((h) => lowerMap.set(h.trim().toLowerCase(), h));

  const pick = (candidates: string[], fallback = ''): string => {
    for (const c of candidates) {
      const exact = lowerMap.get(c);
      if (exact) return exact;
    }
    for (const c of candidates) {
      for (const [k, orig] of lowerMap.entries()) {
        if (k.includes(c)) return orig;
      }
    }
    return fallback;
  };

  return {
    matchId: pick(['match_id', 'id', 'matchid', 'game_id']),
    season: pick(['season', 'year', 'edition']),
    date: pick(['date', 'start_date', 'match_date']),
    venue: pick(['venue', 'stadium', 'ground', 'city']),
    battingTeam: pick(['batting_team', 'team1', 'bat_team', 'team_bat']),
    bowlingTeam: pick(['bowling_team', 'team2', 'bowl_team', 'team_bowl']),
    tossWinner: pick(['toss_winner', 'tosswinner']),
    tossDecision: pick(['toss_decision', 'toss_choice', 'decision']),
    innings: pick(['innings', 'inning', 'inn']),
    over: pick(['over', 'overs', 'over_num']),
    ball: pick(['ball', 'ball_num', 'delivery']),
    batter: pick(['batter', 'striker', 'batsman']),
    bowler: pick(['bowler']),
    runsOffBat: pick(['runs_off_bat', 'batsman_runs', 'runs', 'total_runs']),
    extras: pick(['extras', 'extra_runs']),
    wicketType: pick(['wicket_type', 'dismissal_kind', 'player_dismissed', 'is_wicket']),
    winner: pick(['winner', 'match_winner', 'winning_team']),
  };
}

interface MatchAgg {
  matchId: string;
  date: string;
  venue: string;
  tossWinner: string;
  tossDecision: string;
  winner: string;
  team1: string;
  team2: string;
  inn1Runs: number;
  inn1Balls: number;
  inn2Runs: number;
  inn2Balls: number;
  inn1Team: string;
  inn2Team: string;
}

function computePslStatistics(
  matchMap: Map<string, MatchAgg>,
  phaseAccum: Record<1 | 2 | 3, { balls: number; runs: number; dots: number; boundaries: number; wickets: number }>,
  hasCricketColumns: boolean
): PslStatsSummary {
  const matches = Array.from(matchMap.values()).sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    return a.matchId.localeCompare(b.matchId, undefined, { numeric: true });
  });

  // 1. Chi-Square Test: Toss Decision (bat vs field) vs Whether Toss Winner Won Match
  let batWins = 0;
  let batLosses = 0;
  let fieldWins = 0;
  let fieldLosses = 0;
  let tossTotal = 0;
  let tossWinnerWins = 0;

  for (const m of matches) {
    if (!m.tossWinner || !m.winner || !m.tossDecision) continue;
    const dec = m.tossDecision.toLowerCase();
    const won = m.tossWinner === m.winner;
    if (dec.includes('bat')) {
      tossTotal++;
      if (won) {
        batWins++;
        tossWinnerWins++;
      } else {
        batLosses++;
      }
    } else if (dec.includes('field') || dec.includes('bowl')) {
      tossTotal++;
      if (won) {
        fieldWins++;
        tossWinnerWins++;
      } else {
        fieldLosses++;
      }
    }
  }

  let chiSquare: ChiSquareResult | null = null;
  if (tossTotal >= 4 && batWins + batLosses > 0 && fieldWins + fieldLosses > 0) {
    const r1 = batWins + batLosses;
    const r2 = fieldWins + fieldLosses;
    const c1 = batWins + fieldWins;
    const c2 = batLosses + fieldLosses;
    const n = tossTotal;
    const expected = [
      (r1 * c1) / n,
      (r1 * c2) / n,
      (r2 * c1) / n,
      (r2 * c2) / n,
    ];
    const observed = [batWins, batLosses, fieldWins, fieldLosses];
    let chi2 = 0;
    for (let i = 0; i < 4; i++) {
      if (expected[i] > 0) {
        chi2 += Math.pow(observed[i] - expected[i], 2) / expected[i];
      }
    }
    const cramersV = Math.sqrt(chi2 / n);
    chiSquare = {
      chi2,
      pValue: chiSquareDf1P(chi2),
      dof: 1,
      cramersV,
      sampleSize: n,
      batFirstWins: batWins,
      batFirstLosses: batLosses,
      fieldFirstWins: fieldWins,
      fieldFirstLosses: fieldLosses,
      tossWinnerMatchWinRate: (tossWinnerWins / n) * 100,
    };
  }

  // 2. Welch's t-test: 1st Innings Run Rate vs 2nd Innings Run Rate
  const inn1Rates: number[] = [];
  const inn2Rates: number[] = [];
  for (const m of matches) {
    if (m.inn1Balls >= 18) inn1Rates.push((m.inn1Runs / m.inn1Balls) * 6);
    if (m.inn2Balls >= 18) inn2Rates.push((m.inn2Runs / m.inn2Balls) * 6);
  }

  let welchTest: WelchTTestResult | null = null;
  if (inn1Rates.length >= 3 && inn2Rates.length >= 3) {
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = (arr: number[], mu: number) =>
      arr.reduce((acc, v) => acc + Math.pow(v - mu, 2), 0) / Math.max(1, arr.length - 1);

    const m1 = mean(inn1Rates);
    const m2 = mean(inn2Rates);
    const v1 = variance(inn1Rates, m1);
    const v2 = variance(inn2Rates, m2);
    const se = Math.sqrt(v1 / inn1Rates.length + v2 / inn2Rates.length);
    const tStat = se > 0 ? (m1 - m2) / se : 0;
    const pooledStd = Math.sqrt(
      ((inn1Rates.length - 1) * v1 + (inn2Rates.length - 1) * v2) /
        Math.max(1, inn1Rates.length + inn2Rates.length - 2)
    );
    const cohensD = pooledStd > 0 ? (m1 - m2) / pooledStd : 0;

    welchTest = {
      innings1Mean: m1,
      innings1Std: Math.sqrt(v1),
      innings1N: inn1Rates.length,
      innings2Mean: m2,
      innings2Std: Math.sqrt(v2),
      innings2N: inn2Rates.length,
      tStat,
      pValue: normalTwoTailedP(tStat),
      cohensD,
    };
  }

  // 3. Dynamic Elo Ratings across chronological matches
  const eloMap = new Map<string, { elo: number; peak: number; matches: number; history: { matchIndex: number; elo: number }[] }>();
  const ensureTeam = (team: string) => {
    if (!eloMap.has(team)) {
      eloMap.set(team, { elo: 1500, peak: 1500, matches: 0, history: [{ matchIndex: 0, elo: 1500 }] });
    }
    return eloMap.get(team)!;
  };

  let idx = 0;
  for (const m of matches) {
    if (!m.team1 || !m.team2 || !m.winner || m.team1 === m.team2) continue;
    idx++;
    const a = ensureTeam(m.team1);
    const b = ensureTeam(m.team2);
    const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
    const scoreA = m.winner === m.team1 ? 1 : m.winner === m.team2 ? 0 : 0.5;
    const kFactor = 28;
    a.elo = a.elo + kFactor * (scoreA - expectedA);
    b.elo = b.elo + kFactor * (1 - scoreA - (1 - expectedA));
    a.peak = Math.max(a.peak, a.elo);
    b.peak = Math.max(b.peak, b.elo);
    a.matches++;
    b.matches++;
    a.history.push({ matchIndex: idx, elo: Math.round(a.elo) });
    b.history.push({ matchIndex: idx, elo: Math.round(b.elo) });
  }

  const eloRatings: EloSeries[] = Array.from(eloMap.entries())
    .map(([team, data]) => ({
      team,
      finalElo: Math.round(data.elo),
      peakElo: Math.round(data.peak),
      matches: data.matches,
      history: data.history,
    }))
    .sort((a, b) => b.finalElo - a.finalElo);

  // 4. Phase Stats
  const phaseLabels: Record<1 | 2 | 3, PhaseStat['phase']> = {
    1: 'Powerplay (1-6)',
    2: 'Middle (7-15)',
    3: 'Death (16-20)',
  };

  const phaseStats: PhaseStat[] = ([1, 2, 3] as const)
    .filter((p) => phaseAccum[p].balls > 0)
    .map((p) => {
      const d = phaseAccum[p];
      return {
        phase: phaseLabels[p],
        balls: d.balls,
        runRate: (d.runs / d.balls) * 6,
        dotBallPct: (d.dots / d.balls) * 100,
        boundaryPct: (d.boundaries / d.balls) * 100,
        wicketsPer100Balls: (d.wickets / d.balls) * 100,
      };
    });

  // 5. Venue Bias
  const venueAcc = new Map<string, { matches: number; inn1Sum: number; inn1Count: number; chaseWins: number }>();
  for (const m of matches) {
    if (!m.venue) continue;
    if (!venueAcc.has(m.venue)) {
      venueAcc.set(m.venue, { matches: 0, inn1Sum: 0, inn1Count: 0, chaseWins: 0 });
    }
    const v = venueAcc.get(m.venue)!;
    v.matches++;
    if (m.inn1Balls > 0) {
      v.inn1Sum += m.inn1Runs;
      v.inn1Count++;
    }
    if (m.inn2Team && m.winner && m.inn2Team === m.winner) {
      v.chaseWins++;
    }
  }

  const venueBias = Array.from(venueAcc.entries())
    .map(([venue, v]) => ({
      venue,
      matches: v.matches,
      avgFirstInningsScore: v.inn1Count > 0 ? Math.round(v.inn1Sum / v.inn1Count) : 0,
      chaseWinPct: v.matches > 0 ? (v.chaseWins / v.matches) * 100 : 0,
    }))
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 8);

  return {
    chiSquare,
    welchTest,
    eloRatings,
    phaseStats,
    venueBias,
    hasCricketColumns,
  };
}

export function profileCsvSource(
  source: File | string,
  fileName: string,
  fileSizeBytes: number,
  isSampleDataset: boolean,
  onProgress?: (rowsProcessed: number) => void
): Promise<CsvProfile> {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    let headers: string[] = [];
    let accumulators: ColumnAccumulator[] = [];
    let schema: DetectedSchema | null = null;
    let rowCount = 0;
    const sampleRows: Record<string, string>[] = [];
    const matchMap = new Map<string, MatchAgg>();
    const phaseAccum: Record<1 | 2 | 3, { balls: number; runs: number; dots: number; boundaries: number; wickets: number }> = {
      1: { balls: 0, runs: 0, dots: 0, boundaries: 0, wickets: 0 },
      2: { balls: 0, runs: 0, dots: 0, boundaries: 0, wickets: 0 },
      3: { balls: 0, runs: 0, dots: 0, boundaries: 0, wickets: 0 },
    };

    const processRow = (rowObj: Record<string, string>) => {
      if (headers.length === 0) {
        headers = Object.keys(rowObj).filter((k) => k !== '');
        schema = detectPslSchema(headers);
        accumulators = headers.map((name) => ({
          name,
          nonNullCount: 0,
          nullCount: 0,
          numericCount: 0,
          booleanCount: 0,
          dateCount: 0,
          zeroCount: 0,
          n: 0,
          mean: 0,
          m2: 0,
          m3: 0,
          m4: 0,
          min: Infinity,
          max: -Infinity,
          reservoir: [],
          freq: new Map<string, number>(),
          cardinalityCapped: false,
        }));
      }

      rowCount++;
      if (sampleRows.length < PREVIEW_ROW_LIMIT) {
        sampleRows.push(rowObj);
      }

      for (let i = 0; i < headers.length; i++) {
        const col = accumulators[i];
        const rawVal = rowObj[col.name];
        if (isMissing(rawVal)) {
          col.nullCount++;
          continue;
        }
        const trimmed = String(rawVal).trim();
        col.nonNullCount++;

        if (col.freq.has(trimmed)) {
          col.freq.set(trimmed, col.freq.get(trimmed)! + 1);
        } else if (col.freq.size < CARDINALITY_CAP) {
          col.freq.set(trimmed, 1);
        } else {
          col.cardinalityCapped = true;
        }

        if (isBooleanToken(trimmed)) {
          col.booleanCount++;
        } else if (DATE_REGEX.test(trimmed)) {
          col.dateCount++;
        }

        const num = parseNumeric(trimmed);
        if (num !== null) {
          col.numericCount++;
          if (num === 0) col.zeroCount++;
          if (num < col.min) col.min = num;
          if (num > col.max) col.max = num;

          // Pébay online central moments
          const n1 = col.n;
          col.n++;
          const delta = num - col.mean;
          const deltaN = delta / col.n;
          const deltaN2 = deltaN * deltaN;
          const term1 = delta * deltaN * n1;
          col.mean += deltaN;
          col.m4 +=
            term1 * deltaN2 * (col.n * col.n - 3 * col.n + 3) +
            6 * deltaN2 * col.m2 -
            4 * deltaN * col.m3;
          col.m3 += term1 * deltaN * (col.n - 2) - 3 * deltaN * col.m2;
          col.m2 += term1;

          // Reservoir sampling for quantiles & IQR
          if (col.reservoir.length < RESERVOIR_LIMIT) {
            col.reservoir.push(num);
          } else {
            const j = Math.floor(Math.random() * col.numericCount);
            if (j < RESERVOIR_LIMIT) col.reservoir[j] = num;
          }
        }
      }

      // Cricket-specific live aggregation
      if (schema && schema.matchId) {
        const mId = String(rowObj[schema.matchId] ?? '').trim();
        if (mId) {
          let mAgg = matchMap.get(mId);
          if (!mAgg) {
            mAgg = {
              matchId: mId,
              date: schema.date ? String(rowObj[schema.date] ?? '').trim() : '',
              venue: schema.venue ? String(rowObj[schema.venue] ?? '').trim() : '',
              tossWinner: schema.tossWinner ? String(rowObj[schema.tossWinner] ?? '').trim() : '',
              tossDecision: schema.tossDecision ? String(rowObj[schema.tossDecision] ?? '').trim() : '',
              winner: schema.winner ? String(rowObj[schema.winner] ?? '').trim() : '',
              team1: schema.battingTeam ? String(rowObj[schema.battingTeam] ?? '').trim() : '',
              team2: schema.bowlingTeam ? String(rowObj[schema.bowlingTeam] ?? '').trim() : '',
              inn1Runs: 0,
              inn1Balls: 0,
              inn2Runs: 0,
              inn2Balls: 0,
              inn1Team: '',
              inn2Team: '',
            };
            matchMap.set(mId, mAgg);
          }

          const inn = schema.innings ? Number(rowObj[schema.innings]) : 1;
          const runsBat = schema.runsOffBat ? Number(rowObj[schema.runsOffBat]) || 0 : 0;
          const extras = schema.extras ? Number(rowObj[schema.extras]) || 0 : 0;
          const totalBallRuns = runsBat + extras;
          const batTeam = schema.battingTeam ? String(rowObj[schema.battingTeam] ?? '').trim() : '';

          if (inn === 1) {
            mAgg.inn1Runs += totalBallRuns;
            mAgg.inn1Balls++;
            if (!mAgg.inn1Team && batTeam) mAgg.inn1Team = batTeam;
          } else if (inn === 2) {
            mAgg.inn2Runs += totalBallRuns;
            mAgg.inn2Balls++;
            if (!mAgg.inn2Team && batTeam) mAgg.inn2Team = batTeam;
          }

          if (schema.over) {
            const ov = Number(rowObj[schema.over]);
            if (Number.isFinite(ov)) {
              const phaseKey: 1 | 2 | 3 = ov <= 6 ? 1 : ov <= 15 ? 2 : 3;
              phaseAccum[phaseKey].balls++;
              phaseAccum[phaseKey].runs += totalBallRuns;
              if (totalBallRuns === 0) phaseAccum[phaseKey].dots++;
              if (runsBat === 4 || runsBat === 6) phaseAccum[phaseKey].boundaries++;
              const wVal = schema.wicketType ? String(rowObj[schema.wicketType] ?? '').trim() : '';
              if (wVal && wVal !== '0' && wVal.toLowerCase() !== 'false') {
                phaseAccum[phaseKey].wickets++;
              }
            }
          }
        }
      }
    };

    const finalize = () => {
      const columns: ColumnStat[] = accumulators.map((acc) => {
        const total = acc.nonNullCount + acc.nullCount;
        const missingPct = total > 0 ? (acc.nullCount / total) * 100 : 0;

        let inferredType: InferredColumnType = 'categorical';
        if (acc.nonNullCount > 0) {
          if (acc.numericCount / acc.nonNullCount >= 0.9) inferredType = 'numeric';
          else if (acc.booleanCount / acc.nonNullCount >= 0.9) inferredType = 'boolean';
          else if (acc.dateCount / acc.nonNullCount >= 0.8) inferredType = 'date';
        }

        const topValues = Array.from(acc.freq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([value, count]) => ({
            value,
            count,
            pct: acc.nonNullCount > 0 ? (count / acc.nonNullCount) * 100 : 0,
          }));

        const stat: ColumnStat = {
          name: acc.name,
          inferredType,
          nonNullCount: acc.nonNullCount,
          nullCount: acc.nullCount,
          missingPct,
          uniqueCount: acc.freq.size,
          isCardinalityCapped: acc.cardinalityCapped,
          topValues,
        };

        if (inferredType === 'numeric' && acc.n > 0) {
          const variance = acc.n > 1 ? acc.m2 / (acc.n - 1) : 0;
          const std = Math.sqrt(Math.max(0, variance));
          const sorted = [...acc.reservoir].sort((a, b) => a - b);
          const q25 = quantileSorted(sorted, 0.25);
          const median = quantileSorted(sorted, 0.5);
          const q75 = quantileSorted(sorted, 0.75);
          const iqr = q75 - q25;
          const lowerFence = q25 - 1.5 * iqr;
          const upperFence = q75 + 1.5 * iqr;

          let iqrOut = 0;
          let zOut = 0;
          for (const v of sorted) {
            if (v < lowerFence || v > upperFence) iqrOut++;
            if (std > 0 && Math.abs((v - acc.mean) / std) > 3) zOut++;
          }
          // Scale reservoir outlier counts up to full column count
          const scale = sorted.length > 0 ? acc.n / sorted.length : 1;

          const skewness =
            acc.m2 > 0 && acc.n > 2
              ? (Math.sqrt(acc.n) * acc.m3) / Math.pow(acc.m2, 1.5)
              : 0;
          const kurtosis =
            acc.m2 > 0 && acc.n > 3
              ? (acc.n * acc.m4) / (acc.m2 * acc.m2) - 3
              : 0;

          stat.mean = acc.mean;
          stat.std = std;
          stat.min = acc.min;
          stat.q25 = q25;
          stat.median = median;
          stat.q75 = q75;
          stat.max = acc.max;
          stat.skewness = skewness;
          stat.kurtosis = kurtosis;
          stat.iqrOutliers = Math.round(iqrOut * scale);
          stat.zOutliers = Math.round(zOut * scale);
          stat.zeroPct = (acc.zeroCount / acc.nonNullCount) * 100;
        }

        return stat;
      });

      // Memory estimation: naive Pandas object + float64/int64 vs downcasted/categorical
      let naiveBytes = 0;
      let optBytes = 0;
      for (const c of columns) {
        if (c.inferredType === 'numeric') {
          naiveBytes += rowCount * 8;
          optBytes += rowCount * (c.min !== undefined && c.max !== undefined && c.min >= -32768 && c.max <= 32767 ? 2 : 4);
        } else {
          naiveBytes += rowCount * 58; // Python str PyObject overhead
          optBytes += c.uniqueCount < 5000 ? rowCount * 2 + c.uniqueCount * 64 : rowCount * 24;
        }
      }

      const finalSchema = schema ?? detectPslSchema(headers);
      const hasCricketColumns = Boolean(finalSchema.matchId && (finalSchema.winner || finalSchema.runsOffBat));
      const pslStats = computePslStatistics(matchMap, phaseAccum, hasCricketColumns);

      resolve({
        fileName,
        fileSizeBytes,
        isSampleDataset,
        rowCount,
        columnCount: columns.length,
        estimatedPandasMemoryMb: Math.max(0.01, naiveBytes / (1024 * 1024)),
        optimizedMemoryMb: Math.max(0.01, optBytes / (1024 * 1024)),
        parseDurationMs: Math.round(performance.now() - startTime),
        columns,
        sampleRows,
        detectedSchema: finalSchema,
        pslStats,
      });
    };

    if (typeof source === 'string') {
      Papa.parse<Record<string, string>>(source, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          for (const row of results.data) {
            processRow(row);
          }
          if (onProgress) onProgress(rowCount);
          finalize();
        },
        error: (err: Error) => {
          reject(err);
        },
      });
      return;
    }

    Papa.parse<Record<string, string>>(source, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 1024 * 512,
      chunk: (results) => {
        for (const row of results.data) {
          processRow(row);
        }
        if (onProgress) onProgress(rowCount);
      },
      complete: () => {
        finalize();
      },
      error: (err) => {
        reject(err);
      },
    });
  });
}
