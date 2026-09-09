/** created by: Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach */
import { expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { requestLimits } from '../src/request-limits';
import type { Request, Response } from 'express';

function response() {
  return Object.assign(new EventEmitter(), {code:200,
    set() { return this; }, status(code:number) { this.code=code; return this; }, json() { return this; }});
}
const req = {ip:'127.0.0.1'} as Request;
it('bounds burst rate and resumes after the window without persisting addresses', () => {
  let time=0, accepted=0;
  const limit=requestLimits(2,()=>time);
  for(let i=0;i<3;i++) { const res=response(); limit(req,res as unknown as Response,()=>accepted++); res.emit('finish');
    expect(res.code).toBe(i<2?200:429); }
  expect(accepted).toBe(2);
  time=60001;
  const res=response(); limit(req,res as unknown as Response,()=>accepted++);
  expect(accepted).toBe(3);
});
it('caps concurrent work and releases a slot only once on finish plus close', () => {
  const limit=requestLimits(2000), responses=Array.from({length:130},response);
  let accepted=0;
  for(const res of responses.slice(0,129)) limit(req,res as unknown as Response,()=>accepted++);
  expect(accepted).toBe(128); expect(responses[128]!.code).toBe(503);
  responses[0]!.emit('finish'); responses[0]!.emit('close');
  limit(req,responses[129] as unknown as Response,()=>accepted++);
  expect(accepted).toBe(129);
  const extra=response(); limit(req,extra as unknown as Response,()=>accepted++);
  expect(extra.code).toBe(503);
});
