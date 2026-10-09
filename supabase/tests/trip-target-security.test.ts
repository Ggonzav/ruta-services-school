import {test,expect} from 'vitest';
import {setupTestDb} from './support/db';
import {buildScenario} from './support/fixtures';

test('destination stays private, settled students cannot be selected, stale generations cannot notify',async()=>{
 const t=await setupTestDb(); try { const s=await buildScenario(t);
 const trip=await t.as(s.carrierA.userId,db=>db.query<{id:string}>(`select public.driver_start_trip($1, '2026-10-09')->>'tripId' as id`,[s.routeAId])); const id=trip.rows[0].id;
 const choose=(student:string)=>t.as(s.carrierA.userId,db=>db.query('select public.driver_set_target($1,$2)',[id,student]));
 const get=()=>t.as(s.carrierA.userId,db=>db.query<{v:{studentId:string,revision:number}}>('select driver_get_target($1) as v',[id]));
 const save=(student:string,revision:number)=>t.db.query<{v:boolean}>('select persist_target_eta($1,$2,$3,30,100) as v',[id,student,revision]);
 await choose(s.martinaId);
 const old=(await get()).rows[0].v;
 expect(old.studentId).toBe(s.martinaId);
 const publicTrip=await t.as(s.benjaminDad.userId,db=>db.query('select * from public.trips where id=$1',[id]));
 expect(publicTrip.rows[0]).not.toHaveProperty('target_student_id');
 await expect(t.as(s.benjaminDad.userId,db=>db.query('select * from trip_targets'))).rejects.toThrow(/permission denied/);
 await expect(t.as(s.benjaminDad.userId,db=>db.query('select driver_get_target($1)',[id]))).rejects.toThrow(/not_your_trip/);
 await expect(t.as(s.carrierB.userId,db=>db.query('select driver_get_target($1)',[id]))).rejects.toThrow(/not_your_trip/);
 await expect(t.as(s.carrierA.userId,db=>db.query('select persist_target_eta($1,$2,1,30,100)',[id,s.martinaId]))).rejects.toThrow(/permission denied/);
 await choose(s.benjaminId);
 expect((await save(s.martinaId,old.revision)).rows[0].v).toBe(false);
 // Even A -> B -> A must invalidate the first Mapbox response.
 await choose(s.martinaId);
 expect((await save(s.martinaId,old.revision)).rows[0].v).toBe(false);
 expect((await t.db.query('select * from trip_events where kind=\'approaching\'')).rows).toHaveLength(0);
 const current=(await get()).rows[0].v;
 expect((await save(s.martinaId,current.revision)).rows[0].v).toBe(true);
 expect((await save(s.martinaId,current.revision)).rows[0].v).toBe(true);
 expect((await t.db.query('select * from trip_events where kind=\'approaching\'')).rows).toHaveLength(1);
 await t.as(s.carrierA.userId,db=>db.query("select public.driver_mark_stop($1,$2,'completed')",[id,s.martinaId]));
 expect((await get()).rows[0].v.studentId).toBe(null);
 await expect(choose(s.martinaId)).rejects.toThrow(/student_already_settled/);
 expect((await save(s.martinaId,current.revision)).rows[0].v).toBe(false);
 expect((await t.db.query('select * from trip_stop_eta')).rows).toHaveLength(0);
 await choose(s.benjaminId);
 const final=(await get()).rows[0].v;
 await t.db.query("update trips set status='finished' where id=$1",[id]);
 expect((await save(s.benjaminId,final.revision)).rows[0].v).toBe(false);
 } finally {await t.close();}
},20000);
