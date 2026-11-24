// Deterministic realistic PSL ball-by-ball dataset generator
// Used as the instant built-in workbench dataset until the user drops their own CSV.

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface TeamSpec {
  name: string;
  strength: number;
  batters: string[];
  bowlers: string[];
}

const PSL_TEAMS: TeamSpec[] = [
  {
    name: 'Lahore Qalandars',
    strength: 1.04,
    batters: ['Fakhar Zaman', 'Sahibzada Farhan', 'Abdullah Shafique', 'Rassie van der Dussen', 'Sikandar Raza', 'David Wiese'],
    bowlers: ['Shaheen Shah Afridi', 'Haris Rauf', 'Zaman Khan', 'Rashid Khan', 'Jahandad Khan'],
  },
  {
    name: 'Multan Sultans',
    strength: 1.07,
    batters: ['Mohammad Rizwan', 'Usman Khan', 'Reeza Hendricks', 'Tayyab Tahir', 'Iftikhar Ahmed', 'Khushdil Shah'],
    bowlers: ['Abbas Afridi', 'Mohammad Ali', 'Usama Mir', 'David Willey', 'Ihsanullah'],
  },
  {
    name: 'Islamabad United',
    strength: 1.05,
    batters: ['Alex Hales', 'Colin Munro', 'Agha Salman', 'Shadab Khan', 'Azam Khan', 'Imad Wasim'],
    bowlers: ['Naseem Shah', 'Shadab Khan', 'Imad Wasim', 'Hunain Shah', 'Tymal Mills'],
  },
  {
    name: 'Peshawar Zalmi',
    strength: 1.01,
    batters: ['Babar Azam', 'Saim Ayub', 'Mohammad Haris', 'Tom Kohler-Cadmore', 'Rovman Powell', 'Asif Ali'],
    bowlers: ['Luke Wood', 'Salman Irshad', 'Arif Yaqoob', 'Naveen-ul-Haq', 'Aamer Jamal'],
  },
  {
    name: 'Karachi Kings',
    strength: 0.96,
    batters: ['Shan Masood', 'Tim Seifert', 'James Vince', 'Shoaib Malik', 'Kieron Pollard', 'Irfan Khan'],
    bowlers: ['Hasan Ali', 'Mir Hamza', 'Zahid Mahmood', 'Daniel Sams', 'Tabraiz Shamsi'],
  },
  {
    name: 'Quetta Gladiators',
    strength: 0.97,
    batters: ['Jason Roy', 'Saud Shakeel', 'Rilee Rossouw', 'Khawaja Nafay', 'Sarfaraz Ahmed', 'Sherfane Rutherford'],
    bowlers: ['Mohammad Amir', 'Abrar Ahmed', 'Mohammad Wasim Jr', 'Akeal Hosein', 'Umaid Asif'],
  },
];

const VENUES = [
  { name: 'Gaddafi Stadium, Lahore', chaseBoost: 0.04, scoringFactor: 1.06 },
  { name: 'National Stadium, Karachi', chaseBoost: 0.09, scoringFactor: 1.02 },
  { name: 'Rawalpindi Cricket Stadium', chaseBoost: 0.14, scoringFactor: 1.12 },
  { name: 'Multan Cricket Stadium', chaseBoost: -0.05, scoringFactor: 0.98 },
];

const WICKET_TYPES = ['caught', 'bowled', 'lbw', 'caught', 'caught', 'run out', 'stumped'];

export function buildSamplePslCsv(): { csvText: string; fileName: string } {
  const rng = createRng(202604);
  const headers = [
    'match_id',
    'season',
    'date',
    'venue',
    'innings',
    'over',
    'ball',
    'batting_team',
    'bowling_team',
    'batter',
    'bowler',
    'runs_off_bat',
    'extras',
    'wicket_type',
    'toss_winner',
    'toss_decision',
    'winner',
  ];

  const lines: string[] = [headers.join(',')];
  const seasons = [2021, 2022, 2023, 2024, 2025];
  let matchCounter = 1001;

  // Generate 30 matches across 5 seasons (6 matches per season)
  for (let sIdx = 0; sIdx < seasons.length; sIdx++) {
    const season = seasons[sIdx];
    for (let m = 0; m < 6; m++) {
      const matchId = matchCounter++;
      const t1Idx = (m + sIdx) % PSL_TEAMS.length;
      const t2Idx = (m + sIdx + 1 + (m % 2)) % PSL_TEAMS.length;
      const teamA = PSL_TEAMS[t1Idx];
      const teamB = PSL_TEAMS[t2Idx === t1Idx ? (t2Idx + 1) % PSL_TEAMS.length : t2Idx];
      const venue = VENUES[(matchId + sIdx) % VENUES.length];

      const month = season <= 2023 ? '02' : '03';
      const day = String(5 + m * 4).padStart(2, '0');
      const dateStr = `${season}-${month}-${day}`;

      const tossWinner = rng() < 0.5 ? teamA : teamB;
      // Realistic PSL dew bias: teams elect to field ~72% of the time
      const tossDecision = rng() < 0.72 ? 'field' : 'bat';
      const firstBatTeam =
        tossDecision === 'bat'
          ? tossWinner
          : tossWinner.name === teamA.name
            ? teamB
            : teamA;
      const secondBatTeam = firstBatTeam.name === teamA.name ? teamB : teamA;

      const simulateInnings = (
        inningsNum: 1 | 2,
        batTeam: TeamSpec,
        bowlTeam: TeamSpec,
        targetRuns: number | null
      ) => {
        const rows: string[] = [];
        let totalScore = 0;
        let wickets = 0;
        let strikerIdx = 0;
        let nonStrikerIdx = 1;

        const dewFactor = inningsNum === 2 ? 1 + venue.chaseBoost * 0.5 : 1.0;
        const rateMultiplier = (batTeam.strength / bowlTeam.strength) * venue.scoringFactor * dewFactor;

        for (let over = 1; over <= 20; over++) {
          if (wickets >= 10) break;
          if (targetRuns !== null && totalScore >= targetRuns) break;

          const bowler = bowlTeam.bowlers[(over + inningsNum) % bowlTeam.bowlers.length];
          const phaseAggression = over <= 6 ? 1.06 : over <= 15 ? 0.94 : 1.24;

          for (let ball = 1; ball <= 6; ball++) {
            if (wickets >= 10) break;
            if (targetRuns !== null && totalScore >= targetRuns) break;

            const batter = batTeam.batters[Math.min(strikerIdx, batTeam.batters.length - 1)];
            const p = rng();

            // Realistic ball outcome probabilities tuned by phase and team strength
            const wicketProb = over <= 6 ? 0.042 : over <= 15 ? 0.045 : 0.072;
            const sixProb = Math.min(0.14, 0.055 * phaseAggression * rateMultiplier);
            const fourProb = Math.min(0.2, 0.115 * phaseAggression * rateMultiplier);
            const extraProb = 0.038;

            let runsOffBat = 0;
            let extras = 0;
            let wicketType = '';

            if (p < wicketProb) {
              wicketType = WICKET_TYPES[Math.floor(rng() * WICKET_TYPES.length)];
              wickets++;
              strikerIdx = Math.max(strikerIdx, nonStrikerIdx) + 1;
            } else if (p < wicketProb + extraProb) {
              extras = rng() < 0.82 ? 1 : 2;
            } else if (p < wicketProb + extraProb + sixProb) {
              runsOffBat = 6;
            } else if (p < wicketProb + extraProb + sixProb + fourProb) {
              runsOffBat = 4;
            } else if (p < 0.62) {
              runsOffBat = 1;
              const tmp = strikerIdx;
              strikerIdx = nonStrikerIdx;
              nonStrikerIdx = tmp;
            } else if (p < 0.71) {
              runsOffBat = 2;
            } else if (p < 0.72) {
              runsOffBat = 3;
              const tmp = strikerIdx;
              strikerIdx = nonStrikerIdx;
              nonStrikerIdx = tmp;
            } else {
              runsOffBat = 0;
            }

            totalScore += runsOffBat + extras;
            // Introduce occasional realistic missingness (~1.5%) on non-critical fields for pre-ML diagnostics
            const extrasCell = rng() < 0.008 ? '' : String(extras);

            rows.push(
              [
                matchId,
                season,
                dateStr,
                `"${venue.name}"`,
                inningsNum,
                over,
                ball,
                `"${batTeam.name}"`,
                `"${bowlTeam.name}"`,
                `"${batter}"`,
                `"${bowler}"`,
                runsOffBat,
                extrasCell,
                wicketType,
                `"${tossWinner.name}"`,
                tossDecision,
                '__WINNER__',
              ].join(',')
            );
          }

          // Rotate strike at end of over
          const tmp = strikerIdx;
          strikerIdx = nonStrikerIdx;
          nonStrikerIdx = tmp;
        }
        return { rows, totalScore };
      };

      const inn1 = simulateInnings(1, firstBatTeam, secondBatTeam, null);
      const inn2 = simulateInnings(2, secondBatTeam, firstBatTeam, inn1.totalScore + 1);

      const winner =
        inn2.totalScore > inn1.totalScore
          ? secondBatTeam.name
          : inn1.totalScore > inn2.totalScore
            ? firstBatTeam.name
            : secondBatTeam.name; // super over tie-breaker

      for (const r of inn1.rows) {
        lines.push(r.replace('__WINNER__', `"${winner}"`));
      }
      for (const r of inn2.rows) {
        lines.push(r.replace('__WINNER__', `"${winner}"`));
      }
    }
  }

  return {
    csvText: lines.join('\n'),
    fileName: 'psl_ball_by_ball_sample_2021_2025.csv',
  };
}
