import { createFinanceView } from '../src/ui/views/FinanceView.js';

describe('FinanceView', () => {
  it('renders ticket, attendance, and sponsor data', () => {
    const state = {
      season: 2,
      curr_day: 130,
      seasonInfo: {
        stageBounds: {
          AS: { start: 90 }
        }
      },
      results: [
        { day: 85, home_id: 1, away_id: 2 },
        { day: 95, home_id: 1, away_id: 2 },
        { day: 110, home_id: 1, away_id: 3 }
      ],
      teamFinances: {
        1: {
          revenue: { ticket: 180000000 },
          attendance: {
            average: 28000,
            lastGame: 30000,
            homeGames: 60,
            capacity: 42000
          },
          ticketPrice: 3200
        }
      },
      teamFans: {
        1: {
          size: 41000,
          happiness: 72,
          loyalty: 65,
          lastAttendance: 29500,
          ticketPrice: 3200
        }
      },
      teamSponsors: {
        1: {
          deals: [
            {
              id: 'megacorp',
              name: 'MegaCorp',
              base: { amount: 500000, summary: 'Guaranteed payout' },
              bonusTriggers: [
                { id: 'wins-50', type: 'wins', threshold: 50, payout: 400000, description: '50勝ボーナス' }
              ],
              progress: {
                baseAwarded: true,
                triggered: { 'wins-50': false },
                metrics: { wins: 42 }
              }
            }
          ]
        }
      },
      teams: [
        { team_id: 1, name: 'Tokyo Swallows', power: 65, league: 'CL' },
        { team_id: 2, name: 'Osaka', power: 58, league: 'CL' },
        { team_id: 3, name: 'Nagoya', power: 55, league: 'CL' }
      ]
    };

    function stubCreateElement(tag, attrs = {}, ...children) {
      const node = {
        tag,
        attrs: { ...attrs },
        children: [],
        append(...appendChildren) {
          appendChildren.forEach(child => this.children.push(child));
        }
      };
      if (attrs.class) node.className = attrs.class;
      children.forEach(child => node.append(child));
      return node;
    }

    const container = {
      children: [],
      append(...appendChildren) {
        appendChildren.forEach(child => this.children.push(child));
      }
    };

    const sparklinePayloads = [];
    const view = createFinanceView({
      createElement: stubCreateElement,
      getState: () => state,
      ensureTeamFinances: () => {},
      ensureTeamFans: () => {},
      ensureSponsorDeals: () => {},
      millionFormatter: value => `¥${Math.round(value / 1000000)}M`,
      yenFormatter: new Intl.NumberFormat('ja-JP'),
      createSparklineWithTooltip: (series, labels) => {
        sparklinePayloads.push({ series, labels });
        return { tag: 'sparkline', series, labels };
      },
      computeAttendanceForGame: (_, result) => result.day * 100
    });

    view.render({ container, teamId: 1 });

    expect(container.children.length).toBe(3);

    const ticketCard = container.children[0];
    const ticketText = JSON.stringify(ticketCard);
    expect(ticketText).toMatch(/平均入場者/);
    expect(ticketText).toMatch(/ファン規模/);

    expect(sparklinePayloads.length).toBe(1);
    expect(sparklinePayloads[0].series).toEqual([9500, 11000]);
    expect(sparklinePayloads[0].labels).toEqual(['Day 95', 'Day 110']);

    const sponsorCard = container.children[2];
    const sponsorText = JSON.stringify(sponsorCard);
    expect(sponsorText).toMatch(/MegaCorp/);
    expect(sponsorText).toMatch(/基本保証受領済み/);
    expect(sponsorText).toMatch(/あと8勝/);
  });
});
