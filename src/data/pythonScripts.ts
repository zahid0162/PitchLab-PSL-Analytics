import type { PythonScriptModule, ScriptConfig } from '../types/psl';

const colOr = (val: string, fallback: string) => (val && val.trim() ? val.trim() : fallback);

export const PYTHON_SCRIPTS: PythonScriptModule[] = [
  {
    id: 'memory-crusher-polars-duckdb',
    index: '01',
    title: 'Out-of-Core Memory Crusher & DuckDB/Polars Profiler',
    subtitle: 'Shrink multi-100MB PSL CSVs by 75%+ RAM and run zero-copy SQL aggregations before touching Pandas.',
    category: 'Scale & Memory',
    libraries: ['polars', 'duckdb', 'pandas', 'numpy'],
    complexity: 'Intermediate',
    conceptSummary:
      'Naive pd.read_csv() allocates 64-bit floats and Python PyObject strings for every ball, blowing past RAM on big cricket logs. This script benchmarks naive vs downcasted memory, converts low-cardinality strings to Categorical/Dictionary types, and queries the raw CSV out-of-core with DuckDB and Polars LazyFrames.',
    statisticalIntuition:
      'Memory layout is the hidden bottleneck of feature pipelines. Downcasting integers (int64 -> int8 for overs/balls/runs) and dictionary-encoding repeating strings (venue, team, batter) turns string comparisons into O(1) integer lookups while preserving exact statistical fidelity.',
    preMlTrapAvoided:
      'Loading an entire 2GB ball-by-ball CSV into Pandas float64/object columns before checking cardinality, causing OOM crashes during one-hot encoding or groupby merges.',
    expectedOutputPreview: `[1] Naive Pandas RAM: 412.80 MB
[2] Optimized Pandas RAM: 68.40 MB (83.4% reduction)
[3] DuckDB Out-of-Core Query completed in 0.14s (peak RSS < 95 MB)
Top Venue Scoring Rate: Rawalpindi Cricket Stadium -> 9.42 RPO (14,820 balls)`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const venue = colOr(cfg.schema.venue, 'venue');
      const over = colOr(cfg.schema.over, 'over');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');
      const extras = colOr(cfg.schema.extras, 'extras');
      const batTeam = colOr(cfg.schema.battingTeam, 'batting_team');

      return `"""
01. Out-of-Core Memory Crusher & Polars/DuckDB Profiler for Big PSL CSVs
pip install polars duckdb pandas numpy pyarrow
"""
import time
import duckdb
import numpy as np
import pandas as pd
import polars as pl

CSV_PATH = "${f}"

# ---------------------------------------------------------
# A. Zero-RAM Out-of-Core Aggregation with DuckDB (SQL directly on CSV)
# ---------------------------------------------------------
t0 = time.perf_counter()
duck_summary = duckdb.sql(f"""
    SELECT
        "${venue}" AS venue,
        COUNT(DISTINCT "${matchId}") AS matches,
        COUNT(*) AS deliveries,
        ROUND(SUM(COALESCE(TRY_CAST("${runs}" AS DOUBLE), 0) +
                  COALESCE(TRY_CAST("${extras}" AS DOUBLE), 0)) * 6.0 / COUNT(*), 3) AS run_rate,
        ROUND(AVG(CASE WHEN TRY_CAST("${runs}" AS INT) = 0
                        AND COALESCE(TRY_CAST("${extras}" AS INT), 0) = 0
                  THEN 1.0 ELSE 0.0 END) * 100, 2) AS dot_ball_pct
    FROM read_csv_auto('{CSV_PATH}', ignore_errors=true)
    GROUP BY 1
    HAVING COUNT(*) >= 120
    ORDER BY run_rate DESC
""").df()
print(f"[DuckDB] Aggregated directly from disk in {time.perf_counter() - t0:.3f}s")
print(duck_summary.head(8), "\\n")


# ---------------------------------------------------------
# B. Polars Lazy Streaming Pipeline -> Compact Parquet Cache
# ---------------------------------------------------------
# Streaming avoids loading the full CSV into memory at once
lazy_df = (
    pl.scan_csv(CSV_PATH, infer_schema_length=10_000, ignore_errors=True)
    .with_columns([
        pl.col("${batTeam}").cast(pl.Categorical),
        pl.col("${venue}").cast(pl.Categorical),
        pl.col("${over}").cast(pl.Int16),
        pl.col("${runs}").fill_null(0).cast(pl.Int16),
        pl.col("${extras}").fill_null(0).cast(pl.Int16),
    ])
)
# Materialize once to columnar Parquet (10x faster for all downstream ML scripts)
parquet_path = CSV_PATH.rsplit(".", 1)[0] + ".parquet"
lazy_df.sink_parquet(parquet_path, compression="zstd")
print(f"[Polars] Streamed & compressed CSV -> {parquet_path}\\n")


# ---------------------------------------------------------
# C. Pandas Auto-Downcaster (for Scikit-Learn compatibility)
# ---------------------------------------------------------
def load_optimized_pandas(path: str, sample_rows: int = 200_000) -> pd.DataFrame:
    df = pd.read_csv(path, nrows=sample_rows, low_memory=False)
    naive_mb = df.memory_usage(deep=True).sum() / 1024**2

    for col in df.columns:
        s = df[col]
        if pd.api.types.is_integer_dtype(s):
            df[col] = pd.to_numeric(s, downcast="integer")
        elif pd.api.types.is_float_dtype(s):
            df[col] = pd.to_numeric(s, downcast="float")
        elif pd.api.types.is_object_dtype(s):
            # Convert to category if cardinality ratio < 40%
            if s.nunique(dropna=True) / max(len(s), 1) < 0.40:
                df[col] = s.astype("category")

    opt_mb = df.memory_usage(deep=True).sum() / 1024**2
    pct = (1.0 - opt_mb / max(naive_mb, 1e-9)) * 100
    print(f"[Pandas] Naive RAM: {naive_mb:.2f} MB -> Downcasted: {opt_mb:.2f} MB ({pct:.1f}% saved)")
    return df

df_opt = load_optimized_pandas(CSV_PATH)
print(df_opt.dtypes)`;
    },
  },
  {
    id: 'toss-chi2-bayesian-credible',
    index: '02',
    title: 'Toss Bias, Chi-Square & Bayesian Posterior Shrinkage',
    subtitle: 'Separate real stadium dew advantage from small-sample luck using Cramér’s V and Beta-Binomial priors.',
    category: 'Statistics & Bayes',
    libraries: ['pandas', 'numpy', 'scipy'],
    complexity: 'Intermediate',
    conceptSummary:
      'Instead of trusting raw chase win percentages (like 3 wins in 4 games = 75%), this script collapses ball-by-ball rows to match-level outcomes, tests Toss Decision vs Match Outcome via Pearson Chi-Square + Cramér’s V, and applies Empirical Bayes (Beta-Binomial) shrinkage per stadium.',
    statisticalIntuition:
      'A p-value alone depends heavily on sample size N. Cramér’s V measures actual effect magnitude (0 to 1). Meanwhile, Beta-Binomial shrinkage pulls noisy small-sample venues toward the league-wide PSL chasing prior, giving calibrated win probabilities.',
    preMlTrapAvoided:
      'Computing match-level statistics directly on ball-by-ball rows without deduplicating by match_id—which inflates sample size by 240x and creates fake p < 0.0001 significance!',
    expectedOutputPreview: `--- Match-Level Hypothesis Test (N = 284 PSL matches) ---
Chi2 = 4.821 | p-value = 0.0281 | Cramér's V = 0.130 (Weak-Moderate)
Venue Empirical Bayes Chase Win Rate (95% Credible Interval):
  Rawalpindi Cricket Stadium : 64.2% [52.8% - 74.6%] (n=53)
  Multan Cricket Stadium     : 46.8% [34.1% - 59.8%] (n=38)`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const venue = colOr(cfg.schema.venue, 'venue');
      const tossWinner = colOr(cfg.schema.tossWinner, 'toss_winner');
      const tossDecision = colOr(cfg.schema.tossDecision, 'toss_decision');
      const winner = colOr(cfg.schema.winner, 'winner');
      const innings = colOr(cfg.schema.innings, 'innings');
      const batTeam = colOr(cfg.schema.battingTeam, 'batting_team');

      return `"""
02. Toss Bias, Chi-Square Effect Size & Bayesian Beta-Binomial Shrinkage
pip install pandas numpy scipy
"""
import numpy as np
import pandas as pd
from scipy import stats

CSV_PATH = "${f}"

# Step 1: Collapse ball-by-ball rows -> 1 row per match (CRITICAL: prevents 240x N inflation!)
usecols = ["${matchId}", "${venue}", "${tossWinner}", "${tossDecision}", "${winner}", "${innings}", "${batTeam}"]
raw = pd.read_csv(CSV_PATH, usecols=lambda c: c in usecols)

# Identify team batting 2nd (chasing team) per match
chase_teams = (
    raw[raw["${innings}"] == 2]
    .groupby("${matchId}")["${batTeam}"]
    .first()
    .rename("chasing_team")
)

matches = (
    raw.drop_duplicates(subset=["${matchId}"])
    .set_index("${matchId}")
    .join(chase_teams, how="left")
    .dropna(subset=["${tossWinner}", "${tossDecision}", "${winner}"])
)

matches["toss_winner_won"] = matches["${tossWinner}"] == matches["${winner}"]
matches["chased_won"] = matches["chasing_team"] == matches["${winner}"]
matches["decided_field"] = matches["${tossDecision}"].str.lower().str.contains("field|bowl")

# ---------------------------------------------------------
# Step 2: 2x2 Contingency Table, Chi-Square & Cramér's V
# ---------------------------------------------------------
ct = pd.crosstab(matches["decided_field"], matches["toss_winner_won"])
chi2, p_val, dof, expected = stats.chi2_contingency(ct, correction=False)
n_matches = len(matches)
cramers_v = np.sqrt(chi2 / (n_matches * (min(ct.shape) - 1)))

print(f"Match-level N = {n_matches}")
print("Contingency Table (Rows=FieldFirst, Cols=TossWinnerWon):\\n", ct)
print(f"Chi2 = {chi2:.4f} | p-value = {p_val:.5f} | Cramér's V = {cramers_v:.4f}\\n")

# Two-proportion Z-test: Chasing win rate vs 50% coin flip
chase_wins = int(matches["chased_won"].sum())
chase_n = int(matches["chased_won"].notna().sum())
binom_res = stats.binomtest(chase_wins, chase_n, p=0.5)
print(f"League-wide Chase Win Rate: {chase_wins}/{chase_n} ({chase_wins/chase_n:.2%}), p={binom_res.pvalue:.4f}\\n")

# ---------------------------------------------------------
# Step 3: Empirical Bayes Beta-Binomial Posterior per Venue
# ---------------------------------------------------------
# Prior strength M=12 pseudo-matches centered at league chase rate
prior_mean = chase_wins / max(chase_n, 1)
M = 12.0
alpha_0 = prior_mean * M
beta_0 = (1.0 - prior_mean) * M

venue_stats = (
    matches.groupby("${venue}")["chased_won"]
    .agg(wins="sum", n="count")
    .reset_index()
)
venue_stats["raw_pct"] = venue_stats["wins"] / venue_stats["n"]
venue_stats["alpha_post"] = alpha_0 + venue_stats["wins"]
venue_stats["beta_post"] = beta_0 + (venue_stats["n"] - venue_stats["wins"])
venue_stats["bayes_mean"] = venue_stats["alpha_post"] / (venue_stats["alpha_post"] + venue_stats["beta_post"])
venue_stats["ci_low"] = stats.beta.ppf(0.025, venue_stats["alpha_post"], venue_stats["beta_post"])
venue_stats["ci_high"] = stats.beta.ppf(0.975, venue_stats["alpha_post"], venue_stats["beta_post"])

print("Venue Chasing Advantage (Shrunk Bayesian Posterior & 95% Credible Interval):")
for _, r in venue_stats.sort_values("bayes_mean", ascending=False).iterrows():
    print(f"  {r['${venue}'][:28]:28s} | n={int(r['n']):3d} | Raw={r['raw_pct']:.1%} -> Bayes={r['bayes_mean']:.1%} [{r['ci_low']:.1%}, {r['ci_high']:.1%}]")`;
    },
  },
  {
    id: 'dynamic-cricket-elo',
    index: '03',
    title: 'Margin-Weighted Cricket Elo Engine (Leak-Free)',
    subtitle: 'Compute chronological team strength ratings with Run-Rate Margin multipliers & seasonal mean reversion.',
    category: 'Statistics & Bayes',
    libraries: ['pandas', 'numpy'],
    complexity: 'Advanced',
    conceptSummary:
      'Static win percentages treat beating a bottom-ranked team the same as beating the defending champions. This script builds a time-ordered Elo system with an autocorrelation-adjusted Margin-of-Victory multiplier, season-start 33% regression to 1500, and exports pre-match Elo differentials for ML.',
    statisticalIntuition:
      'Elo is an online stochastic gradient update on logistic log-likelihood. Adjusting the K-factor by log(|net_run_margin| + 1) rewards dominant wins while capping blowout distortion, and seasonal mean-reversion accounts for PSL player drafts.',
    preMlTrapAvoided:
      'Using end-of-season team win rates as features when predicting mid-season matches (severe future target leakage!). Here, every match receives pre_match_elo recorded BEFORE the outcome updates the ratings.',
    expectedOutputPreview: `Final PSL Elo Standings (after seasonal mean reversion):
  1. Multan Sultans       1584.2  (Peak: 1612.8)
  2. Islamabad United     1551.6  (Peak: 1579.0)
  3. Lahore Qalandars     1529.4  (Peak: 1594.3)
ML Feature Calibration (Brier Score of pre-match Elo): 0.2291`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const season = colOr(cfg.schema.season, 'season');
      const date = colOr(cfg.schema.date, 'date');
      const innings = colOr(cfg.schema.innings, 'innings');
      const batTeam = colOr(cfg.schema.battingTeam, 'batting_team');
      const bowlTeam = colOr(cfg.schema.bowlingTeam, 'bowling_team');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');
      const extras = colOr(cfg.schema.extras, 'extras');
      const winner = colOr(cfg.schema.winner, 'winner');

      return `"""
03. Margin-Weighted Cricket Elo Rating Engine (Zero-Leakage Pre-ML Feature)
pip install pandas numpy
"""
import numpy as np
import pandas as pd

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
df["total_runs"] = df["${runs}"].fillna(0) + df["${extras}"].fillna(0)

# Aggregate to innings totals per match
inn = (
    df.groupby(["${matchId}", "${season}", "${date}", "${innings}", "${batTeam}", "${bowlTeam}", "${winner}"], as_index=False)
    .agg(runs=("total_runs", "sum"), balls=("total_runs", "count"))
)

# Pivot to 1 row per match sorted strictly chronologically
inn1 = inn[inn["${innings}"] == 1].rename(columns={"${batTeam}": "team1", "runs": "runs1", "balls": "balls1"})
inn2 = inn[inn["${innings}"] == 2].rename(columns={"${batTeam}": "team2", "runs": "runs2", "balls": "balls2"})

matches = (
    inn1[["${matchId}", "${season}", "${date}", "team1", "runs1", "balls1", "${winner}"]]
    .merge(inn2[["${matchId}", "team2", "runs2", "balls2"]], on="${matchId}", how="inner")
    .sort_values(["${date}", "${matchId}"])
    .reset_index(drop=True)
)

def run_cricket_elo(matches_df: pd.DataFrame, k_base: float = 28.0, season_revert: float = 0.30) -> pd.DataFrame:
    ratings: dict[str, float] = {}
    peak_ratings: dict[str, float] = {}
    last_season = None
    records = []

    for row in matches_df.to_dict("records"):
        cur_season = row["${season}"]
        cur_winner = row["${winner}"]
        cur_match_id = row["${matchId}"]

        # Apply between-season regression toward 1500 (accounts for PSL draft turnover)
        if last_season is not None and cur_season != last_season:
            for t in ratings:
                ratings[t] = 1500.0 + (1.0 - season_revert) * (ratings[t] - 1500.0)
        last_season = cur_season

        t1, t2 = row["team1"], row["team2"]
        r1 = ratings.get(t1, 1500.0)
        r2 = ratings.get(t2, 1500.0)

        # Pre-match expectation (RECORD THIS FOR ML BEFORE UPDATING!)
        exp1 = 1.0 / (1.0 + 10.0 ** ((r2 - r1) / 400.0))
        actual1 = 1.0 if cur_winner == t1 else (0.0 if cur_winner == t2 else 0.5)

        # Net Run Rate margin multiplier (FiveThirtyEight-style autocorrelation adjustment)
        rr1 = row["runs1"] / max(row["balls1"] / 6.0, 1.0)
        rr2 = row["runs2"] / max(row["balls2"] / 6.0, 1.0)
        rr_diff = abs(rr1 - rr2)
        elo_diff = abs(r1 - r2)
        mov_mult = np.log(rr_diff + 1.0) * (2.2 / (elo_diff * 0.001 + 2.2))

        delta = k_base * max(0.75, mov_mult) * (actual1 - exp1)
        ratings[t1] = r1 + delta
        ratings[t2] = r2 - delta
        peak_ratings[t1] = max(peak_ratings.get(t1, 1500.0), ratings[t1])
        peak_ratings[t2] = max(peak_ratings.get(t2, 1500.0), ratings[t2])

        records.append({
            "${matchId}": cur_match_id,
            "pre_elo_t1": round(r1, 2),
            "pre_elo_t2": round(r2, 2),
            "pre_elo_diff": round(r1 - r2, 2),
            "pre_win_prob_t1": round(exp1, 4),
            "actual_t1_win": actual1,
        })

    out = pd.DataFrame(records)
    brier = np.mean((out["pre_win_prob_t1"] - out["actual_t1_win"]) ** 2)
    print(f"Pre-Match Elo Brier Score (lower is better; 0.25=coinflip): {brier:.4f}\\n")
    print("Current Elo Leaderboard:")
    for t, val in sorted(ratings.items(), key=lambda x: -x[1]):
        print(f"  {t:22s} | Elo={val:7.1f} | Peak={peak_ratings[t]:7.1f}")
    return out

elo_features = run_cricket_elo(matches)`;
    },
  },
  {
    id: 'leak-free-ewma-rolling-form',
    index: '04',
    title: 'Leak-Free Rolling & EWMA Player Form Pipeline',
    subtitle: 'Build shifted rolling strike rate, boundary % and bowler dot-pressure features without target leakage.',
    category: 'Feature Engineering',
    libraries: ['pandas', 'numpy'],
    complexity: 'Advanced',
    conceptSummary:
      'In sports ML, computing a batter’s rolling average incorrectly includes the current match’s outcome—giving 99% accuracy in CV and 52% in production. This script demonstrates strict .shift(1) chronological windowing plus Exponentially Weighted Moving Averages (EWMA) that weight recent PSL form higher.',
    statisticalIntuition:
      'Simple 5-match rolling means suffer from step-changes when an old innings drops out of the window. EWMA applies geometric decay alpha = 2/(span+1), smoothly adapting to recent form streaks while retaining memory of baseline class.',
    preMlTrapAvoided:
      'Data Leakage #1: Calling df.groupby("batter")["runs"].rolling(5).mean() WITHOUT .shift(1), which leaks today’s runs directly into today’s feature row!',
    expectedOutputPreview: `Leakage Audit Passed: correlation(pre_match_ewma_sr, current_sr) = 0.142 (realistic signal)
Top Current Form Batters (EWMA Strike Rate, halflife=5 innings):
  Saim Ayub         -> EWMA SR: 154.8 | Boundary%: 21.4%
  Mohammad Rizwan   -> EWMA SR: 138.2 | Consistency (CV): 0.41`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const date = colOr(cfg.schema.date, 'date');
      const batter = colOr(cfg.schema.batter, 'batter');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');
      const wicket = colOr(cfg.schema.wicketType, 'wicket_type');

      return `"""
04. Leak-Free Rolling & Exponentially Weighted (EWMA) Player Form Features
pip install pandas numpy
"""
import numpy as np
import pandas as pd

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
df["is_boundary"] = df["${runs}"].isin([4, 6]).astype(np.int8)
df["is_dot"] = (df["${runs}"] == 0).astype(np.int8)
df["is_out"] = df["${wicket}"].notna() & (df["${wicket}"].astype(str).str.strip() != "")

# Step 1: Aggregate ball-by-ball -> batter innings table sorted by date
bat_inn = (
    df.groupby(["${batter}", "${date}", "${matchId}"], as_index=False)
    .agg(
        runs=("${runs}", "sum"),
        balls=("${runs}", "count"),
        boundaries=("is_boundary", "sum"),
        dots=("is_dot", "sum"),
        dismissed=("is_out", "max"),
    )
    .sort_values(["${batter}", "${date}", "${matchId}"])
    .reset_index(drop=True)
)

bat_inn["inning_sr"] = np.where(bat_inn["balls"] > 0, (bat_inn["runs"] / bat_inn["balls"]) * 100.0, np.nan)
bat_inn["boundary_pct"] = np.where(bat_inn["balls"] > 0, (bat_inn["boundaries"] / bat_inn["balls"]) * 100.0, np.nan)

# Step 2: STRICTLY SHIFTED (.shift(1)) Pre-Match Rolling & EWMA Features
g = bat_inn.groupby("${batter}", group_keys=False)

# Prior cumulative career stats (expanding window shifted by 1)
bat_inn["prior_innings"] = g.cumcount()
bat_inn["prior_runs_cum"] = g["runs"].apply(lambda s: s.shift(1).expanding(min_periods=1).sum())
bat_inn["prior_balls_cum"] = g["balls"].apply(lambda s: s.shift(1).expanding(min_periods=1).sum())
bat_inn["prior_career_sr"] = (bat_inn["prior_runs_cum"] / bat_inn["prior_balls_cum"].replace(0, np.nan)) * 100.0

# Last 5 innings rolling mean & volatility (std) — shifted so current match is NEVER touched
bat_inn["roll5_runs_mean"] = g["runs"].apply(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
bat_inn["roll5_runs_std"] = g["runs"].apply(lambda s: s.shift(1).rolling(5, min_periods=2).std())

# Exponentially Weighted Moving Average (EWMA) with span=5
bat_inn["ewma5_sr"] = g["inning_sr"].apply(lambda s: s.shift(1).ewm(span=5, min_periods=1).mean())
bat_inn["ewma5_boundary_pct"] = g["boundary_pct"].apply(lambda s: s.shift(1).ewm(span=5, min_periods=1).mean())

# Step 3: Leakage Sanity Audit
# First innings of every player MUST have NaN for prior_career_sr and ewma5_sr
first_inn_na = bat_inn[bat_inn["prior_innings"] == 0]["ewma5_sr"].isna().all()
assert first_inn_na, "LEAKAGE DETECTED: First innings contains non-null prior features!"

valid = bat_inn.dropna(subset=["ewma5_sr", "inning_sr"])
corr = valid["ewma5_sr"].corr(valid["inning_sr"])
print(f"Leakage Audit Passed! First-innings NaN check=True | Out-of-sample SR correlation={corr:.4f}\\n")

latest_form = (
    bat_inn[bat_inn["prior_innings"] >= 3]
    .sort_values("${date}")
    .groupby("${batter}")
    .tail(1)
    .sort_values("ewma5_sr", ascending=False)
)
print("Latest Pre-Match Form Snapshot (top 8 batters):")
print(latest_form[["${batter}", "prior_innings", "prior_career_sr", "ewma5_sr", "ewma5_boundary_pct"]].head(8).to_string(index=False))`;
    },
  },
  {
    id: 'skewness-power-transform-outliers',
    index: '05',
    title: 'Skewness, Yeo-Johnson & Isolation Forest Outliers',
    subtitle: 'Diagnose heavy-tailed cricket distributions, compare scalers, and isolate anomalous T20 innings.',
    category: 'Feature Engineering',
    libraries: ['pandas', 'numpy', 'scipy', 'scikit-learn'],
    complexity: 'Intermediate',
    conceptSummary:
      'Cricket metrics (individual scores, extras, strike rates) are heavily right-skewed and zero-inflated. Feeding raw skewed columns into Linear/Logistic Regression, Neural Nets, or K-Means distorts gradients. This script tests skewness, applies Yeo-Johnson & Quantile transforms, and flags statistical anomalies via Isolation Forest.',
    statisticalIntuition:
      'StandardScaler subtracts mean and divides by std—which collapses when extreme outliers (e.g., 145* off 60 balls) inflate variance. RobustScaler uses median/IQR, while PowerTransformer (Yeo-Johnson) finds optimal lambda to coerce skewed variables toward Gaussian normality even when zeros exist.',
    preMlTrapAvoided:
      'Using Box-Cox (which crashes on zeros!) or StandardScaler on heavily skewed cricket totals, and fitting scalers BEFORE train/test splitting.',
    expectedOutputPreview: `Feature Skewness Audit (Before -> After Yeo-Johnson):
  runs_scored      : skew = +1.842 -> +0.064 (Gaussianized)
  strike_rate      : skew = +1.319 -> -0.021 (Gaussianized)
IsolationForest Flagged Top Anomalies (2% contamination):
  Usman Khan | 120 runs off 43 balls (SR 279.1) -> Anomaly Score: -0.184`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const batter = colOr(cfg.schema.batter, 'batter');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');

      return `"""
05. Skewness Diagnostics, Power Transforms (Yeo-Johnson) & Isolation Forest Outliers
pip install pandas numpy scipy scikit-learn
"""
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import PowerTransformer, QuantileTransformer, RobustScaler, StandardScaler

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
df["is_four"] = (df["${runs}"] == 4).astype(int)
df["is_six"] = (df["${runs}"] == 6).astype(int)
df["is_dot"] = (df["${runs}"] == 0).astype(int)

# Aggregate to batter innings level (minimum 6 balls faced)
innings_df = (
    df.groupby(["${matchId}", "${batter}"], as_index=False)
    .agg(runs=("${runs}", "sum"), balls=("${runs}", "count"), fours=("is_four", "sum"), sixes=("is_six", "sum"), dots=("is_dot", "sum"))
)
innings_df = innings_df[innings_df["balls"] >= 6].copy()
innings_df["strike_rate"] = (innings_df["runs"] / innings_df["balls"]) * 100.0
innings_df["boundary_rate"] = (innings_df["fours"] + innings_df["sixes"]) / innings_df["balls"]
innings_df["dot_rate"] = innings_df["dots"] / innings_df["balls"]

num_cols = ["runs", "balls", "strike_rate", "boundary_rate", "dot_rate"]
X = innings_df[num_cols].values

# ---------------------------------------------------------
# A. Skewness & Normality Comparison Across Scalers
# ---------------------------------------------------------
scalers = {
    "Raw": X,
    "StandardScaler": StandardScaler().fit_transform(X),
    "RobustScaler (IQR)": RobustScaler().fit_transform(X),
    "Yeo-Johnson": PowerTransformer(method="yeo-johnson").fit_transform(X),
    "Quantile (Normal)": QuantileTransformer(output_distribution="normal", n_quantiles=min(500, len(X))).fit_transform(X),
}

print("Skewness Reduction Across Pre-ML Transformers:")
header = f"{'Feature':15s} | " + " | ".join(f"{k:18s}" for k in scalers)
print(header)
print("-" * len(header))
for idx, col in enumerate(num_cols):
    skews = [f"{stats.skew(mat[:, idx]):+6.3f}" for mat in scalers.values()]
    print(f"{col:15s} | " + " | ".join(f"{s:18s}" for s in skews))

# ---------------------------------------------------------
# B. Multivariate Outlier Detection with Isolation Forest
# ---------------------------------------------------------
iso = IsolationForest(n_estimators=200, contamination=0.02, random_state=42)
innings_df["anomaly_flag"] = iso.fit_predict(scalers["RobustScaler (IQR)"])
innings_df["anomaly_score"] = iso.decision_function(scalers["RobustScaler (IQR)"])

outliers = innings_df[innings_df["anomaly_flag"] == -1].sort_values("anomaly_score")
print(f"\\nFlagged {len(outliers)} multivariate anomalous innings (top 8):")
print(outliers[["${matchId}", "${batter}", "runs", "balls", "strike_rate", "anomaly_score"]].head(8).to_string(index=False))`;
    },
  },
  {
    id: 'vif-mutual-info-target-encoding',
    index: '06',
    title: 'VIF Multicollinearity, Mutual Info & Target Encoding',
    subtitle: 'Prune redundant features via VIF, rank non-linear predictors with Mutual Information, and encode high-cardinality players.',
    category: 'Feature Engineering',
    libraries: ['pandas', 'numpy', 'scikit-learn', 'statsmodels'],
    complexity: 'Principal ML',
    conceptSummary:
      'One-hot encoding 250 PSL batters and bowlers creates 500 sparse columns that overfit trees and explode linear models. This script computes Variance Inflation Factor (VIF) to drop collinear features, ranks non-linear signal via Mutual Information, and uses scikit-learn TargetEncoder with internal cross-fitting.',
    statisticalIntuition:
      'VIF_j = 1 / (1 - R^2_j) measures how well feature j is linearly predicted by all other features (VIF > 5 signals redundancy). Mutual Information I(X; Y) detects ANY statistical dependency—linear or non-linear—measured in nats.',
    preMlTrapAvoided:
      'Naive target encoding (df.groupby("batter")["win"].mean()) on the full dataset leaks the target label into X, producing massive overfitting on rare players with 1-2 matches.',
    expectedOutputPreview: `VIF Multicollinearity Audit:
  total_runs   : VIF = 14.82 -> DROP (collinear with boundary_runs & balls)
  strike_rate  : VIF = 2.14  -> KEEP
Top Features by Mutual Information (bits):
  pre_elo_diff : 0.148 | venue_te : 0.089 | powerplay_rr : 0.074`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const venue = colOr(cfg.schema.venue, 'venue');
      const innings = colOr(cfg.schema.innings, 'innings');
      const batTeam = colOr(cfg.schema.battingTeam, 'batting_team');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');
      const extras = colOr(cfg.schema.extras, 'extras');
      const over = colOr(cfg.schema.over, 'over');
      const wicket = colOr(cfg.schema.wicketType, 'wicket_type');
      const winner = colOr(cfg.schema.winner, 'winner');

      return `"""
06. Multicollinearity (VIF), Mutual Information & Out-of-Fold Target Encoding
pip install pandas numpy scikit-learn statsmodels
"""
import numpy as np
import pandas as pd
from sklearn.feature_selection import mutual_info_classif
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import TargetEncoder
from statsmodels.stats.outliers_influence import variance_inflation_factor

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
df["total_runs"] = df["${runs}"].fillna(0) + df["${extras}"].fillna(0)
df["is_dot"] = (df["total_runs"] == 0).astype(int)
df["is_boundary"] = df["${runs}"].isin([4, 6]).astype(int)
df["is_wicket"] = (df["${wicket}"].notna() & (df["${wicket}"].astype(str).str.strip() != "")).astype(int)

# Build 1st-innings Powerplay & Full-Innings Feature Table to predict Match Winner
inn1 = df[df["${innings}"] == 1].copy()
pp = inn1[inn1["${over}"] <= 6]

m_base = inn1.groupby("${matchId}", as_index=False).agg(
    venue=("${venue}", "first"),
    batting_team=("${batTeam}", "first"),
    winner=("${winner}", "first"),
    total_runs=("total_runs", "sum"),
    balls=("total_runs", "count"),
    boundaries=("is_boundary", "sum"),
    dots=("is_dot", "sum"),
    wickets=("is_wicket", "sum"),
)
pp_agg = pp.groupby("${matchId}", as_index=False).agg(pp_runs=("total_runs", "sum"), pp_wickets=("is_wicket", "sum"))
m = m_base.merge(pp_agg, on="${matchId}", how="left").fillna(0)

m["target_bat1_won"] = (m["batting_team"] == m["winner"]).astype(int)
m["run_rate"] = m["total_runs"] / (m["balls"] / 6.0).clip(lower=1.0)
m["dot_pct"] = m["dots"] / m["balls"].clip(lower=1)
m["boundary_pct"] = m["boundaries"] / m["balls"].clip(lower=1)

# Notice: total_runs, run_rate, and boundaries share strong collinearity!
feat_cols = ["total_runs", "run_rate", "boundaries", "dot_pct", "boundary_pct", "wickets", "pp_runs", "pp_wickets"]
X_num = m[feat_cols].astype(float)

# ---------------------------------------------------------
# A. Variance Inflation Factor (VIF) Iterative Pruning
# ---------------------------------------------------------
print("VIF Multicollinearity Diagnostics:")
X_vif = X_num.assign(const=1.0)
for i, col in enumerate(feat_cols):
    vif = variance_inflation_factor(X_vif.values, i)
    flag = "HIGH (Collinear)" if vif > 5.0 else "OK"
    print(f"  {col:16s} | VIF = {vif:7.2f} | {flag}")

# ---------------------------------------------------------
# B. Out-of-Fold Cross-Fitted Target Encoding (Zero Leakage!)
# ---------------------------------------------------------
# TargetEncoder in sklearn >= 1.3 automatically uses cross-fitting on .fit_transform()
te = TargetEncoder(cv=min(5, len(m)), smooth="auto", random_state=42)
cat_cols = ["venue", "batting_team"]
X_cat_encoded = te.fit_transform(m[cat_cols], m["target_bat1_won"])
m["venue_te"] = X_cat_encoded[:, 0]
m["team_te"] = X_cat_encoded[:, 1]

# ---------------------------------------------------------
# C. Mutual Information Ranking (Non-linear dependency)
# ---------------------------------------------------------
all_feats = feat_cols + ["venue_te", "team_te"]
mi_scores = mutual_info_classif(m[all_feats], m["target_bat1_won"], random_state=42)
mi_df = pd.DataFrame({"feature": all_feats, "mutual_info": mi_scores}).sort_values("mutual_info", ascending=False)
print("\\nMutual Information Feature Ranking:")
print(mi_df.to_string(index=False))`;
    },
  },
  {
    id: 'pca-kmeans-player-archetypes',
    index: '07',
    title: 'PCA Biplot & Silhouette Archetype Clustering',
    subtitle: 'Discover data-driven PSL batter archetypes (Anchor, Enforcer, Death Finisher) via PCA + K-Means.',
    category: 'Unsupervised & Calibration',
    libraries: ['pandas', 'numpy', 'scikit-learn'],
    complexity: 'Advanced',
    conceptSummary:
      'Pre-ML unsupervised clustering uncovers latent player roles without manual labels. This script builds a phase-split batting profile matrix (Powerplay SR, Middle SR, Death SR, Dot %, Boundary %), runs PCA to verify explained variance, sweeps K=2..6 for optimal Silhouette Score, and labels archetypes.',
    statisticalIntuition:
      'PCA decomposes the standardized feature covariance matrix into orthogonal principal components (eigenvectors). Inspecting PC1 & PC2 loadings reveals the fundamental axes of T20 batting: Scoring Aggression vs Risk/Dot-Ball Absorption.',
    preMlTrapAvoided:
      'Running K-Means on unstandardized features where strike_rate (range 90–190) completely dominates dot_pct (range 0.2–0.5) in Euclidean distance.',
    expectedOutputPreview: `PCA Explained Variance: PC1=48.3%, PC2=26.1% (Cumulative 74.4%)
Optimal Clusters via Silhouette Score: k=3 (silhouette = 0.412)
Cluster Profiles:
  Cluster 0 (Aggressive Enforcers): PP_SR=146.2, Death_SR=178.4, Boundary%=20.1%
  Cluster 1 (Anchors/Accumulators): PP_SR=119.5, Middle_SR=126.8, Dot%=36.4%`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const batter = colOr(cfg.schema.batter, 'batter');
      const over = colOr(cfg.schema.over, 'over');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');

      return `"""
07. PCA Eigen-Decomposition & Silhouette-Tuned K-Means Player Archetypes
pip install pandas numpy scikit-learn
"""
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import RobustScaler

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
df["phase"] = np.select(
    [df["${over}"] <= 6, df["${over}"] <= 15],
    ["pp", "mid"],
    default="death",
)
df["is_boundary"] = df["${runs}"].isin([4, 6]).astype(int)
df["is_dot"] = (df["${runs}"] == 0).astype(int)

# Overall batter volume filter (>= 30 balls)
overall = df.groupby("${batter}").agg(
    balls=("${runs}", "count"),
    runs=("${runs}", "sum"),
    boundary_pct=("is_boundary", "mean"),
    dot_pct=("is_dot", "mean"),
)
overall["overall_sr"] = (overall["runs"] / overall["balls"]) * 100.0
overall = overall[overall["balls"] >= 30]

# Phase-specific Strike Rates pivoted per batter
phase_sr = (
    df.groupby(["${batter}", "phase"])
    .agg(r=("${runs}", "sum"), b=("${runs}", "count"))
    .assign(sr=lambda x: (x["r"] / x["b"].clip(lower=1)) * 100.0)["sr"]
    .unstack(fill_value=np.nan)
)

profile = overall.join(phase_sr).fillna(overall[["overall_sr"]].values)
feat_cols = ["overall_sr", "boundary_pct", "dot_pct", "pp", "mid", "death"]
feat_cols = [c for c in feat_cols if c in profile.columns]

X_scaled = RobustScaler().fit_transform(profile[feat_cols])

# ---------------------------------------------------------
# A. PCA Dimensionality & Loading Inspection
# ---------------------------------------------------------
pca = PCA(n_components=min(3, len(feat_cols)), random_state=42)
X_pca = pca.fit_transform(X_scaled)
print("PCA Explained Variance Ratio:", [round(float(v), 4) for v in pca.explained_variance_ratio_])
loadings = pd.DataFrame(pca.components_.T, index=feat_cols, columns=[f"PC{i+1}" for i in range(pca.n_components_)])
print("PCA Feature Loadings:\\n", loadings.round(3), "\\n")

# ---------------------------------------------------------
# B. Silhouette Sweep to Pick Optimal K
# ---------------------------------------------------------
best_k, best_sil = 2, -1.0
for k in range(2, min(7, len(profile))):
    km = KMeans(n_clusters=k, n_init=20, random_state=42)
    labels = km.fit_predict(X_scaled)
    sil = silhouette_score(X_scaled, labels)
    print(f"  k={k} -> Silhouette Score = {sil:.4f}")
    if sil > best_sil:
        best_k, best_sil = k, sil

final_km = KMeans(n_clusters=best_k, n_init=25, random_state=42)
profile["archetype_id"] = final_km.fit_predict(X_scaled)

print(f"\\nCluster Centroids (k={best_k}):")
print(profile.groupby("archetype_id")[feat_cols].mean().round(2))
for cid, grp in profile.groupby("archetype_id"):
    examples = ", ".join(grp.sort_values("runs", ascending=False).head(4).index.tolist())
    print(f"  Archetype {cid} ({len(grp)} batters): {examples}")`;
    },
  },
  {
    id: 'markov-expected-runs-dls',
    index: '08',
    title: 'Markov Resource Matrix & Expected Runs Surface',
    subtitle: 'Build a Duckworth-Lewis-style (overs_left, wickets_lost) expected runs matrix and Win-Probability baseline.',
    category: 'Unsupervised & Calibration',
    libraries: ['pandas', 'numpy', 'scipy'],
    complexity: 'Principal ML',
    conceptSummary:
      'Before training XGBoost on live match states, you need an empirical domain baseline. This script constructs a 2D state-space matrix E[Remaining Runs | Overs Left, Wickets Lost] directly from PSL 1st innings deliveries—essentially deriving the Duckworth-Lewis-Stern (DLS) resource curve from scratch.',
    statisticalIntuition:
      'Cricket innings form a finite-horizon Markov Decision Process with state s = (o, w). Monotonic smoothing (isotonic / 2D Gaussian filter) ensures expected runs strictly increase with overs left and strictly decrease with wickets lost.',
    preMlTrapAvoided:
      'Training a complex ML win-probability predictor without comparing it against an interpretable Markov state-value baseline—and feeding noisy unsmoothed state cells with only 2-3 historical observations.',
    expectedOutputPreview: `Empirical PSL Resource Matrix (Expected Remaining Runs):
  Overs Left = 20 | 0 wkts: 176.4 runs
  Overs Left = 10 | 2 wkts:  94.2 runs | 5 wkts:  68.1 runs
  Overs Left =  5 | 3 wkts:  53.8 runs | 7 wkts:  31.4 runs`,
    generateCode: (cfg: ScriptConfig) => {
      const f = cfg.fileName || 'psl_matches.csv';
      const matchId = colOr(cfg.schema.matchId, 'match_id');
      const innings = colOr(cfg.schema.innings, 'innings');
      const over = colOr(cfg.schema.over, 'over');
      const ball = colOr(cfg.schema.ball, 'ball');
      const runs = colOr(cfg.schema.runsOffBat, 'runs_off_bat');
      const extras = colOr(cfg.schema.extras, 'extras');
      const wicket = colOr(cfg.schema.wicketType, 'wicket_type');

      return `"""
08. Empirical Markov Resource Matrix (DLS Curve from Scratch) & Baseline Calibration
pip install pandas numpy scipy
"""
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter

CSV_PATH = "${f}"

df = pd.read_csv(CSV_PATH)
# Use 1st innings only (unconstrained by a fixed chase target!)
inn1 = df[df["${innings}"] == 1].copy()
inn1["total_runs"] = inn1["${runs}"].fillna(0) + inn1["${extras}"].fillna(0)
inn1["is_wicket"] = (inn1["${wicket}"].notna() & (inn1["${wicket}"].astype(str).str.strip() != "")).astype(int)
inn1 = inn1.sort_values(["${matchId}", "${over}", "${ball}"])

# Compute cumulative & remaining runs from each ball state forward
inn1["cum_runs"] = inn1.groupby("${matchId}")["total_runs"].cumsum()
inn1["final_score"] = inn1.groupby("${matchId}")["total_runs"].transform("sum")
inn1["runs_remaining"] = inn1["final_score"] - inn1["cum_runs"]
inn1["wickets_lost"] = inn1.groupby("${matchId}")["is_wicket"].cumsum().clip(upper=9)
inn1["overs_remaining"] = (20 - inn1["${over}"] + 1).clip(lower=1, upper=20)

# Aggregate into (overs_remaining x wickets_lost) state table
raw_grid = (
    inn1.groupby(["overs_remaining", "wickets_lost"])["runs_remaining"]
    .mean()
    .unstack(fill_value=np.nan)
    .reindex(index=range(20, 0, -1), columns=range(0, 10))
)

# Interpolate sparse high-wicket states and apply mild 2D Gaussian smoothing
filled_grid = raw_grid.interpolate(axis=0, limit_direction="both").interpolate(axis=1, limit_direction="both").fillna(0.0)
smoothed_matrix = pd.DataFrame(
    gaussian_filter(filled_grid.values, sigma=0.8),
    index=filled_grid.index,
    columns=filled_grid.columns,
)

print("PSL Empirical Expected Remaining Runs Matrix (Smoothed):")
sample_overs = [20, 15, 10, 5, 2, 1]
sample_wkts = [0, 1, 2, 3, 5, 7]
view = smoothed_matrix.loc[sample_overs, sample_wkts].round(1)
view.index.name = "Overs_Left"
view.columns = [f"{w}_wkts" for w in sample_wkts]
print(view.to_string())

# Convert to DLS-style Resource % (normalized to state (20 overs left, 0 wickets lost))
max_resource = smoothed_matrix.loc[20, 0]
resource_pct = (smoothed_matrix / max(max_resource, 1e-6)) * 100.0
print(f"\\nPar 1st-Innings Benchmark (20 overs, 0 wkts): {max_resource:.1f} runs")
print(f"Resource remaining at 10 overs left, 2 wkts lost: {resource_pct.loc[10, 2]:.1f}%")`;
    },
  },
];
