import { expect, it, vi } from 'vitest';
import { allowedEndpoint, deliverBatch, pushPayload, type Delivery } from '../functions/send-push/delivery';
const row: Delivery = { delivery_id:'d',lease:'lease',endpoint:'https://web.push.apple.com/Q123',p256dh:'key',auth:'key',student_id:'student',event_id:'event',kind:'PM' };
it('produces an anonymous AM/PM message and student-specific link',()=>{
  expect(JSON.parse(pushPayload(row))).toMatchObject({url:'/?student=student',tag:'approaching:event'});
  expect(JSON.parse(pushPayload(row)).body).toBe('El furgón está llegando a tu casa.');
  expect(JSON.parse(pushPayload({...row,kind:'AM'})).body).toBe('El furgón está cerca de tu casa.');
});
it.each(['http://localhost','https://web.push.apple.com.evil.org/x','https://u:p@web.push.apple.com/x','https://web.push.apple.com:8080/x'])('rejects SSRF endpoint %s',url=>expect(allowedEndpoint(url)).toBe(false));
it('records success, transient errors and invalid endpoints without sending to arbitrary hosts',async()=>{
  const send=vi.fn().mockResolvedValueOnce(201).mockRejectedValueOnce(new Error('network'));
  const complete=vi.fn().mockResolvedValue(undefined);
  const rows=[row,{...row,delivery_id:'d2'},{...row,delivery_id:'d3',endpoint:'https://localhost/x'}];
  expect(await deliverBatch(rows,send,complete,async()=>true)).toBe(1);
  expect(send).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenCalledWith(rows[0],201);
  expect(complete).toHaveBeenCalledWith(rows[1],0);
  expect(complete).toHaveBeenCalledWith(rows[2],400);
});

it('does not send when destination changed after claim or authorization fails',async()=>{
 const send=vi.fn(); const complete=vi.fn();
 const authorize=vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline'));
 expect(await deliverBatch([row,{...row,delivery_id:'second'}],send,complete,authorize)).toBe(0);
 expect(send).not.toHaveBeenCalled();
 expect(complete).toHaveBeenCalledWith(row,409);
 expect(complete).toHaveBeenCalledWith(expect.objectContaining({delivery_id:'second'}),0);
});
