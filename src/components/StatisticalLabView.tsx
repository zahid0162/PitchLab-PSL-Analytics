import React from 'react';
import type { CsvProfile } from '../types/psl';

interface StatisticalLabViewProps {
  profile: CsvProfile;
}

const ELO_COLORS = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#dc2626', '#475569'];

export const StatisticalLabView: React.FC<StatisticalLabViewProps> = ({ profile }) => {
  const { chiSquare, welchTest, eloRatings, phaseStats, venueBias, hasCricketColumns } = profile.pslStats;

  if (!hasCricketColumns) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center max-w-xl mx-auto mt-8">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Cricket Match Columns Not Auto-Detected
        </h2>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Your CSV schema is profiled in the CSV Schema & Memory tab, and you can map your custom column headers inside Python Script Lab to adapt all 8 Python scripts to your file.
        </p>
      </div>
    );
  }

  // SVG chart bounds for Elo progression
  const maxMatches = Math.max(1, ...eloRatings.flatMap((e) => e.history.map((h) => h.matchIndex)));
  const allElos = eloRatings.flatMap((e) => e.history.map((h) => h.elo));
  const minElo = Math.min(1400, ...allElos) - 15;
  const maxElo = Math.max(1600, ...allElos) + 15;
  const svgW = 680;
  const svgH = 240;
  const padX = 42;
  const padY = 20;

  const toX = (idx: number) => padX + (idx / maxMatches) * (svgW - padX * 1.5);
  const toY = (elo: number) => svgH - padY - ((elo - minElo) / Math.max(1, maxElo - minElo)) * (svgH - padY * 2);

  return (
    <div className="space-y-6">
      {/* Hypothesis Testing Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chi-Square Test */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <p className="text-xs text-slate-500">Hypothesis Test 01 · Categorical Independence</p>
            <h2 className="font-display text-base font-semibold text-slate-900 mt-0.5">
              Pearson Chi-Square: Toss Decision vs Match Winner
            </h2>
          </div>

          {chiSquare ? (
            <>
              <div className="grid grid-cols-3 gap-4 py-1">
                <div>
                  <p className="text-xs text-slate-500">Chi-Square (df=1)</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {chiSquare.chi2.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">p-value</p>
                  <p
                    className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
                      chiSquare.pValue < 0.05 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {chiSquare.pValue.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cramér&apos;s V</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {chiSquare.cramersV.toFixed(3)}
                  </p>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border-t border-slate-200">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-medium">Toss Decision</th>
                    <th className="py-2 text-right font-medium">Toss Winner Won</th>
                    <th className="py-2 text-right font-medium">Toss Winner Lost</th>
                    <th className="py-2 text-right font-medium">Win %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-800">Bat First</td>
                    <td className="py-2 text-right text-slate-900">{chiSquare.batFirstWins}</td>
                    <td className="py-2 text-right text-slate-900">{chiSquare.batFirstLosses}</td>
                    <td className="py-2 text-right text-slate-700">
                      {((chiSquare.batFirstWins / Math.max(1, chiSquare.batFirstWins + chiSquare.batFirstLosses)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-800">Field First</td>
                    <td className="py-2 text-right text-slate-900">{chiSquare.fieldFirstWins}</td>
                    <td className="py-2 text-right text-slate-900">{chiSquare.fieldFirstLosses}</td>
                    <td className="py-2 text-right text-slate-700">
                      {((chiSquare.fieldFirstWins / Math.max(1, chiSquare.fieldFirstWins + chiSquare.fieldFirstLosses)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="text-xs text-slate-600 leading-relaxed">
                Evaluated across <span className="font-mono font-medium">{chiSquare.sampleSize}</span> deduplicated matches (overall toss-winner win rate:{' '}
                <span className="font-mono font-medium">{chiSquare.tossWinnerMatchWinRate.toFixed(1)}%</span>).{' '}
                {chiSquare.pValue < 0.05
                  ? 'Statistically significant difference (p < 0.05) between batting vs fielding first.'
                  : 'Insufficient evidence at alpha = 0.05 to reject independence between toss choice and match outcome.'}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Not enough match-level toss observations to compute Chi-Square.</p>
          )}
        </div>

        {/* Welch's t-Test */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <p className="text-xs text-slate-500">Hypothesis Test 02 · Unequal-Variance Means</p>
            <h2 className="font-display text-base font-semibold text-slate-900 mt-0.5">
              Welch&apos;s t-Test: 1st vs 2nd Innings Run Rate
            </h2>
          </div>

          {welchTest ? (
            <>
              <div className="grid grid-cols-3 gap-4 py-1">
                <div>
                  <p className="text-xs text-slate-500">t-statistic</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {welchTest.tStat.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Two-tailed p</p>
                  <p
                    className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
                      welchTest.pValue < 0.05 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {welchTest.pValue.toFixed(4)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cohen&apos;s d</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {welchTest.cohensD.toFixed(3)}
                  </p>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border-t border-slate-200">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-medium">Innings</th>
                    <th className="py-2 text-right font-medium">Sample (N)</th>
                    <th className="py-2 text-right font-medium">Mean RPO</th>
                    <th className="py-2 text-right font-medium">Std Dev</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-800">1st Innings (Setting)</td>
                    <td className="py-2 text-right text-slate-900">{welchTest.innings1N}</td>
                    <td className="py-2 text-right text-slate-900">{welchTest.innings1Mean.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-700">{welchTest.innings1Std.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-sans font-medium text-slate-800">2nd Innings (Chasing)</td>
                    <td className="py-2 text-right text-slate-900">{welchTest.innings2N}</td>
                    <td className="py-2 text-right text-slate-900">{welchTest.innings2Mean.toFixed(2)}</td>
                    <td className="py-2 text-right text-slate-700">{welchTest.innings2Std.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <p className="text-xs text-slate-600 leading-relaxed">
                Welch&apos;s t-test avoids Student&apos;s equal-variance assumption—essential because 2nd-innings run rates have higher variance due to early wickets or rapid chases.
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Not enough innings observations to compute Welch&apos;s t-test.</p>
          )}
        </div>
      </div>

      {/* Elo Trajectory Chart & Standings */}
      {eloRatings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
            <div>
              <p className="text-xs text-slate-500">Sequential Pre-ML Feature Preview</p>
              <h2 className="font-display text-base font-semibold text-slate-900 mt-0.5">
                Chronological PSL Franchise Elo Progression (K = 28)
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {eloRatings.slice(0, 6).map((series, idx) => (
                <div key={series.team} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs inline-block shrink-0"
                    style={{ backgroundColor: ELO_COLORS[idx % ELO_COLORS.length] }}
                  />
                  <span className="text-slate-700">{series.team}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-center">
            <div className="xl:col-span-2 overflow-x-auto">
              <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto min-w-[460px]">
                {/* Baseline 1500 gridline */}
                <line
                  x1={padX}
                  y1={toY(1500)}
                  x2={svgW - 16}
                  y2={toY(1500)}
                  stroke="#cbd5e1"
                  strokeDasharray="4 4"
                />
                <text x={6} y={toY(1500) + 4} className="fill-slate-400 text-[10px] font-mono">
                  1500
                </text>
                <text x={6} y={toY(maxElo - 10) + 4} className="fill-slate-400 text-[10px] font-mono">
                  {Math.round(maxElo - 10)}
                </text>
                <text x={6} y={toY(minElo + 10) + 4} className="fill-slate-400 text-[10px] font-mono">
                  {Math.round(minElo + 10)}
                </text>

                {eloRatings.slice(0, 6).map((series, idx) => {
                  const pts = series.history.map((h) => `${toX(h.matchIndex)},${toY(h.elo)}`).join(' ');
                  return (
                    <polyline
                      key={series.team}
                      fill="none"
                      stroke={ELO_COLORS[idx % ELO_COLORS.length]}
                      strokeWidth="2.2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={pts}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-medium">Franchise</th>
                    <th className="py-2 text-right font-medium">Matches</th>
                    <th className="py-2 text-right font-medium">Final Elo</th>
                    <th className="py-2 text-right font-medium">Peak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {eloRatings.slice(0, 8).map((row) => (
                    <tr key={row.team}>
                      <td className="py-2 font-sans font-medium text-slate-900 truncate max-w-[140px]">
                        {row.team}
                      </td>
                      <td className="py-2 text-right text-slate-600">{row.matches}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">{row.finalElo}</td>
                      <td className="py-2 text-right text-slate-500">{row.peakElo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Phase & Venue Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
            T20 Phase-Wise Scoring & Volatility Breakdown
          </h2>
          {phaseStats.length > 0 ? (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Phase</th>
                  <th className="py-2 text-right font-medium">Run Rate</th>
                  <th className="py-2 text-right font-medium">Dot %</th>
                  <th className="py-2 text-right font-medium">Boundary %</th>
                  <th className="py-2 text-right font-medium">Wkts/100b</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {phaseStats.map((p) => (
                  <tr key={p.phase}>
                    <td className="py-2.5 font-sans font-medium text-slate-900">{p.phase}</td>
                    <td className="py-2.5 text-right text-slate-900">{p.runRate.toFixed(2)}</td>
                    <td className="py-2.5 text-right text-slate-700">{p.dotBallPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-emerald-700 font-medium">{p.boundaryPct.toFixed(1)}%</td>
                    <td className="py-2.5 text-right text-slate-700">{p.wicketsPer100Balls.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 mt-3">No over-level columns detected.</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
            Venue 1st-Innings Par Score & Chase Win Rate
          </h2>
          {venueBias.length > 0 ? (
            <table className="w-full text-xs border-collapse mt-2">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-medium">Venue</th>
                  <th className="py-2 text-right font-medium">Matches</th>
                  <th className="py-2 text-right font-medium">Avg 1st Inn</th>
                  <th className="py-2 text-right font-medium">Chase Win %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {venueBias.map((v) => (
                  <tr key={v.venue}>
                    <td className="py-2.5 font-sans font-medium text-slate-900 truncate max-w-[200px]">
                      {v.venue}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">{v.matches}</td>
                    <td className="py-2.5 text-right text-slate-900">{v.avgFirstInningsScore}</td>
                    <td className="py-2.5 text-right text-slate-900">{v.chaseWinPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-500 mt-3">No venue column detected.</p>
          )}
        </div>
      </div>
    </div>
  );
};
