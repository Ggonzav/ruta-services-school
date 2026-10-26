import { beforeAll, afterAll, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from './support/db';
import { buildScenario, type Scenario } from './support/fixtures';
let t: TestDb; let s: Scenario;
const p256dh = 'B' + 'A'.repeat(86), auth = 'A'.repeat(22);
beforeAll(async () => { t = await setupTestDb(); s = await buildScenario(t); }, 30000);
afterAll(async () => { await t?.close(); });
async function register(user: string, student: string, endpoint: string) {
  return t.as(user, db => db.query<{ id: string }>('select public.register_push_subscription($1,$2,$3,$4) as id', [student,endpoint,p256dh,auth]));
}
async function event(student: string, date: string) {
  const trip = await t.db.query<{id:string}>("insert into trips(route_id,trip_date,status) values($1,$2,'in_progress') returning id",[s.routeAId,date]);
  await t.as(s.carrierA.userId,db=>db.query('select driver_set_target($1,$2)',[trip.rows[0].id,student]));
  const ev = await t.db.query<{id:string}>("insert into trip_events(trip_id,student_id,kind) values($1,$2,'approaching') returning id",[trip.rows[0].id,student]);
  return {trip:trip.rows[0].id,event:ev.rows[0].id};
}
const endpoint = 'https://fcm.googleapis.com/fcm/send/device-a';
it('only a linked guardian registers; no direct reads, writes or queue claims', async () => {
  await expect(register(s.martinaMom.userId,s.benjaminId,endpoint)).rejects.toThrow('not_your_student');
  await expect(register(s.carrierA.userId,s.martinaId,endpoint)).rejects.toThrow('not_your_student');
  await register(s.martinaMom.userId,s.martinaId,endpoint);
  await expect(t.as(s.martinaMom.userId,db=>db.query('select * from push_subscriptions'))).rejects.toThrow();
  await expect(t.as(s.carrierA.userId,db=>db.query('select * from claim_push_deliveries()'))).rejects.toThrow();
  await expect(register(s.benjaminDad.userId,s.benjaminId,endpoint)).rejects.toThrow('subscription_owned_by_another_user');
});
it.each(['http://127.0.0.1/x','https://example.com/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com@localhost/x'])('rejects arbitrary push endpoints %s',async url=>{
  await expect(register(s.martinaMom.userId,s.martinaId,url)).rejects.toThrow('unsupported_push_endpoint');
});
it('queues only subscribed students; leases cannot be claimed twice or completed by another lease',async()=>{
  const ev = await event(s.martinaId,'2026-11-01');
  await event(s.benjaminId,'2026-11-02');
  const claimed = await t.db.query<any>('select * from claim_push_deliveries()');
  expect(claimed.rows).toHaveLength(1);
  const row=claimed.rows[0];
  expect(row.student_id).toBe(s.martinaId);
  expect(row.event_id).toBe(ev.event);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await t.db.query('select complete_push_delivery($1,$2,201)',[row.delivery_id,crypto.randomUUID()]);
  expect((await t.db.query<any>('select sent_at from push_deliveries where id=$1',[row.delivery_id])).rows[0].sent_at).toBeNull();
  await t.db.query('select complete_push_delivery($1,$2,201)',[row.delivery_id,row.lease]);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
});
it('retries 429 then removes expired subscriptions on 410',async()=>{
  await event(s.martinaId,'2026-11-03');
  let row=(await t.db.query<any>('select * from claim_push_deliveries()')).rows[0];
  await t.db.query('select complete_push_delivery($1,$2,429)',[row.delivery_id,row.lease]);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await t.db.query("update push_deliveries set available_at=now()-interval '1 second' where id=$1",[row.delivery_id]);
  row=(await t.db.query<any>('select * from claim_push_deliveries()')).rows[0];
  await t.db.query('select complete_push_delivery($1,$2,410)',[row.delivery_id,row.lease]);
  expect((await t.db.query('select * from push_subscriptions')).rows).toHaveLength(0);
});
it('discards old, finished and revoked deliveries before sending',async()=>{
  await register(s.martinaMom.userId,s.martinaId,endpoint);
  const old=await event(s.martinaId,'2026-11-04');
  await t.db.query("update push_deliveries set created_at=now()-interval '6 minutes' where event_id=$1",[old.event]);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  const finished=await event(s.martinaId,'2026-11-05');
  await t.db.query("update trips set status='finished' where id=$1",[finished.trip]);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await event(s.martinaId,'2026-11-06');
  await t.db.query('delete from student_guardians where guardian_id=$1 and student_id=$2',[s.martinaMom.guardianId,s.martinaId]);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await t.db.query('insert into student_guardians values($1,$2)',[s.martinaId,s.martinaMom.guardianId]);
});
it('unregistering one sibling preserves another and cannot remove someone else',async()=>{
  await t.db.query('insert into student_guardians values($1,$2)',[s.benjaminId,s.martinaMom.guardianId]);
  await register(s.martinaMom.userId,s.benjaminId,endpoint);
  await t.as(s.benjaminDad.userId,db=>db.query('select unregister_push_subscription($1,$2)',[s.benjaminId,endpoint]));
  expect((await t.db.query('select * from push_subscription_students')).rows).toHaveLength(2);
  await t.as(s.martinaMom.userId,db=>db.query('select unregister_push_subscription($1,$2)',[s.martinaId,endpoint]));
  expect((await t.db.query<any>('select * from push_subscription_students')).rows[0].student_id).toBe(s.benjaminId);
});
it('does not discard the fifth attempt while its lease is still active',async()=>{
  const ev=await event(s.benjaminId,'2026-11-07');
  await t.db.query('update push_deliveries set attempts=4 where event_id=$1',[ev.event]);
  const row=(await t.db.query<any>('select * from claim_push_deliveries()')).rows[0];
  expect(row).toBeDefined();
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await t.db.query('select complete_push_delivery($1,$2,201)',[row.delivery_id,row.lease]);
  const result=(await t.db.query<any>('select sent_at,discarded_at from push_deliveries where id=$1',[row.delivery_id])).rows[0];
  expect(result.sent_at).not.toBeNull();
  expect(result.discarded_at).toBeNull();
});
it('rejects changed targets before claim, including A to B to A',async()=>{
  await register(s.martinaMom.userId,s.martinaId,endpoint);
  const ev=await event(s.martinaId,'2026-11-08');
  for (const student of [s.benjaminId,s.martinaId]) {
    await t.as(s.carrierA.userId,db=>db.query('select driver_set_target($1,$2)',[ev.trip,student]));
  }
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  expect((await t.db.query<any>('select discarded_at from push_deliveries where event_id=$1',[ev.event])).rows[0].discarded_at).not.toBeNull();
});
it('revalidates the lease, destination and guardian access after claim',async()=>{
  const ev=await event(s.martinaId,'2026-11-09');
  const row=(await t.db.query<any>('select * from claim_push_deliveries()')).rows[0];
  const check=async(lease=row.lease)=>(await t.db.query<{allowed:boolean}>('select authorize_push_delivery($1,$2) as allowed',[row.delivery_id,lease])).rows[0].allowed;
  expect(await check()).toBe(true);
  expect(await check(crypto.randomUUID())).toBe(false);
  for (const user of [s.martinaMom.userId,s.carrierA.userId]) {
    await expect(t.as(user,db=>db.query('select authorize_push_delivery($1,$2)',[row.delivery_id,row.lease]))).rejects.toThrow();
  }
  await t.db.query('delete from student_guardians where guardian_id=$1 and student_id=$2',[s.martinaMom.guardianId,s.martinaId]);
  expect(await check()).toBe(false);
  await t.db.query('insert into student_guardians values($1,$2)',[s.martinaId,s.martinaMom.guardianId]);
  expect(await check()).toBe(true);
  await t.as(s.carrierA.userId,db=>db.query('select driver_set_target($1,$2)',[ev.trip,s.benjaminId]));
  expect(await check()).toBe(false);
  await t.as(s.carrierA.userId,db=>db.query('select driver_set_target($1,$2)',[ev.trip,s.martinaId]));
  expect(await check()).toBe(false);
});

it('requires a fresh near ETA to enqueue again after A to B to A',async()=>{
  const ev=await event(s.martinaId,'2026-11-10');
  for (const student of [s.benjaminId,s.martinaId]) {
    await t.as(s.carrierA.userId,db=>db.query('select driver_set_target($1,$2)',[ev.trip,student]));
  }
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  const rev=(await t.db.query<any>('select revision from trip_targets where trip_id=$1',[ev.trip])).rows[0].revision;
  const eta=(revision:number,distance:number)=>t.db.query('select persist_target_eta($1,$2,$3,60,$4)',[ev.trip,s.martinaId,revision,distance]);
  await eta(Number(rev)-2,100);
  await eta(Number(rev),1000);
  expect((await t.db.query('select * from claim_push_deliveries()')).rows).toHaveLength(0);
  await eta(Number(rev),100);
  await eta(Number(rev),90);
  const rows=(await t.db.query<any>('select * from claim_push_deliveries()')).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].event_id).toBe(ev.event);
  expect((await t.db.query<any>('select authorize_push_delivery($1,$2) as allowed',[rows[0].delivery_id,rows[0].lease])).rows[0].allowed).toBe(true);
  expect((await t.db.query('select * from push_deliveries where event_id=$1',[ev.event])).rows).toHaveLength(2);
});
