import { beforeEach, afterEach, it, expect } from 'vitest';
import { setupTestDb, type TestDb } from './support/db';
import { buildScenario, type Scenario } from './support/fixtures';
let t:TestDb; let s:Scenario; let pm:string;
beforeEach(async()=>{
 t=await setupTestDb();s=await buildScenario(t);
 pm=(await t.db.query<{id:string}>(`insert into routes(vehicle_id,kind,name,departure_time,school_name,school_lat,school_lng)
 values($1,'PM','Regreso','15:00','Colegio',-33,-70) returning id`,[s.vehicleAId])).rows[0].id;
});
afterEach(async()=>t.close());
async function save(id:string|null=null,am:string|null=s.routeAId,ret:string|null=pm,user=s.carrierA.userId) {
 return t.as(user,db=>db.query<{id:string}>(`select carrier_save_student_profile($1,'Alumno prueba','Casa prueba',-33.5,-70.5,'Contacto prueba','+56911111111',$2,$3) as id`,[id,am,ret]));
}
it('stores one address for both legs and contact without granting guardian access',async()=>{
 const id=(await save()).rows[0].id;
 const stops=(await t.db.query<any>('select address,lat,lng from route_stops where student_id=$1',[id])).rows;
 expect(stops).toHaveLength(2);expect(stops[0]).toEqual(stops[1]);
 expect((await t.db.query<any>('select guardian_name from student_profiles where student_id=$1',[id])).rows[0].guardian_name).toBe('Contacto prueba');
 expect((await t.db.query('select * from student_guardians where student_id=$1',[id])).rows).toHaveLength(0);
 await save(id,null,pm);
 expect((await t.db.query<any>('select route_id from route_stops where student_id=$1',[id])).rows).toEqual([{route_id:pm}]);
 await save(id,null,null);
 expect((await t.db.query('select * from student_profiles where student_id=$1',[id])).rows).toHaveLength(1);
});
it('isolates contact data and rejects foreign students/routes and wrong direction',async()=>{
 const id=(await save()).rows[0].id;
 await t.db.query('insert into student_guardians(student_id,guardian_id) values($1,$2)',[id,s.martinaMom.guardianId]);
 for(const user of [s.carrierB.userId,s.martinaMom.userId]) {
 expect((await t.as(user,db=>db.query('select * from student_profiles'))).rows).toHaveLength(0);
 await expect(save(id,s.routeAId,pm,user)).rejects.toThrow();
 await expect(t.as(user,db=>db.query('update student_profiles set guardian_phone=$1 where student_id=$2',['bad',id]))).resolves.toMatchObject({affectedRows:0});
 }
 await expect(save(null,s.routeBId,pm)).rejects.toThrow('not_your_route');
 await expect(save(null,pm,null)).rejects.toThrow('not_your_route');
});
it('rolls back new student and first leg if the second leg is active',async()=>{
 const before=(await t.db.query('select * from students')).rows.length;
 await t.db.query("insert into trips(route_id,trip_date,status) values($1,current_date,'in_progress')",[pm]);
 await expect(save()).rejects.toThrow('route_has_active_trip');
 expect((await t.db.query('select * from students')).rows).toHaveLength(before);
 expect((await t.db.query('select * from student_profiles')).rows).toHaveLength(0);
});
