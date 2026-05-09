import getDb from '@/lib/db';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';

const DAY_MS = 24 * 60 * 60 * 1000;
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function safeJsonParse(s, fallback = {}) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const userId = session.user.id;
    const now = Date.now();

    const starterRow = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'starter_pack');
    const starterMeta = safeJsonParse(starterRow?.meta);
    const starterAmount = Math.max(0, parseInt(starterMeta?.amount || process.env.STARTER_PACK_TOKENS || '500', 10) || 0);
    const starterClaimable = !!starterRow && starterAmount > 0 && starterMeta?.claimed !== true && Number(starterRow?.claimCount || 0) === 0;

    const dailyRow = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'daily_reward');
    const dailyAmount = Math.max(0, parseInt(process.env.DAILY_REWARD_TOKENS || '100', 10) || 0);
    const dailyLast = dailyRow?.lastClaimAt ? Number(dailyRow.lastClaimAt) : 0;
    const dailyNextAt = dailyLast ? dailyLast + DAY_MS : 0;
    const dailyEligible = dailyAmount > 0 && (!dailyLast || now >= dailyNextAt);

    const voteRow = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'topgg_vote');
    const voteAmount = Math.max(0, parseInt(process.env.TOPGG_VOTE_REWARD_TOKENS || '150', 10) || 0);
    const voteLast = voteRow?.lastClaimAt ? Number(voteRow.lastClaimAt) : 0;
    const voteNextAt = voteLast ? voteLast + VOTE_COOLDOWN_MS : 0;
    const voteEligible = voteAmount > 0 && (!voteLast || now >= voteNextAt);
    const voteUrl = (process.env.TOPGG_VOTE_URL || process.env.NEXT_PUBLIC_TOPGG_VOTE_URL || '').trim();

    const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;

    return res.status(200).json({
      success: true,
      balance,
      starterPack: {
        claimable: starterClaimable,
        amount: starterAmount,
      },
      daily: {
        eligible: dailyEligible,
        amount: dailyAmount,
        nextClaimAt: dailyEligible ? now : dailyNextAt,
        remainingMs: dailyEligible ? 0 : Math.max(0, dailyNextAt - now),
      },
      vote: {
        eligible: voteEligible,
        amount: voteAmount,
        nextClaimAt: voteEligible ? now : voteNextAt,
        remainingMs: voteEligible ? 0 : Math.max(0, voteNextAt - now),
        url: voteUrl,
      },
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}

