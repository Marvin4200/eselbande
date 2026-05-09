export class TokenError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TokenError';
    this.statusCode = statusCode;
  }
}

export function debitTokens(db, userId, amount) {
  const result = db.prepare(
    'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?'
  ).run(amount, userId, amount);

  if (result.changes !== 1) {
    throw new TokenError('Not enough tokens', 400);
  }
}

export function creditTokens(db, userId, amount) {
  const result = db.prepare(
    'UPDATE users SET balance = balance + ? WHERE id = ?'
  ).run(amount, userId);

  if (result.changes !== 1) {
    throw new TokenError('User not found', 404);
  }
}

export function recordTransaction(db, { fromUserId, toUserId = null, type, amount }) {
  db.prepare(
    'INSERT INTO transactions (fromUserId, toUserId, type, amount) VALUES (?, ?, ?, ?)'
  ).run(fromUserId, toUserId, type, amount);
}

export function transferTokens(db, { fromUserId, toUserId, amount, type = 'give' }) {
  const transfer = db.transaction(() => {
    debitTokens(db, fromUserId, amount);
    creditTokens(db, toUserId, amount);
    recordTransaction(db, { fromUserId, toUserId, type, amount });
  });

  transfer();
}
