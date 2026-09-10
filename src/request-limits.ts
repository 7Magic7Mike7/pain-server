/*
 * File attribution
 * created by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
 */
import type { RequestHandler } from 'express';

/** Bound anonymous write work. Network addresses exist only in this short-lived memory map.
 * Do not trust arbitrary forwarded IP headers; configure the actual reverse proxy separately.
 */
export function requestLimits(perMinute: number, now = Date.now): RequestHandler {
  const visitors = new Map<string, { until: number; count: number }>();
  let active = 0;
  let pruneAt = 0;
  return (req, res, next) => {
    const time = now();
    if (time >= pruneAt) {
      for (const [key, value] of visitors) if (value.until <= time) visitors.delete(key);
      pruneAt = time + 60000;
    }
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    let bucket = visitors.get(key);
    if (active >= 256 || (!bucket && visitors.size >= 4096)) {
      res.set('Retry-After', '1').status(503).json({message:'Service busy. Please retry.'}); return;
    }
    if (!bucket || bucket.until <= time) {
      bucket = {until:time + 60000, count:0}; visitors.set(key, bucket);
    }
    if (bucket.count >= perMinute) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - time) / 1000))))
        .status(429).json({message:'Too many requests. Please retry shortly.'}); return;
    }
    bucket.count++;
    active++;
    let released = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once('finish', release); res.once('close', release);
    next();
  };
}
