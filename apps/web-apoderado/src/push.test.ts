import { afterEach, expect, it, vi } from 'vitest';
import { enablePush, disablePush, pushSupportMessage } from './push';
const key = 'B' + 'A'.repeat(86);
function browser(permission='granted') {
  const subscription={ endpoint:'https://fcm.googleapis.com/fcm/send/x',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/x',keys:{p256dh:key,auth:'A'.repeat(22)}}) };
  const registration={pushManager:{getSubscription:vi.fn().mockResolvedValue(subscription),subscribe:vi.fn()}};
  const serviceWorker={register:vi.fn().mockResolvedValue(registration),ready:Promise.resolve(registration),getRegistration:vi.fn().mockResolvedValue(registration)};
  vi.stubGlobal('window',{isSecureContext:true,PushManager:{},Notification:{},matchMedia:()=>({matches:true})});
  vi.stubGlobal('navigator',{userAgent:'Chrome',platform:'Linux',maxTouchPoints:0,serviceWorker});
  vi.stubGlobal('Notification',{requestPermission:vi.fn().mockResolvedValue(permission)});
  return {registration,serviceWorker,subscription};
}
afterEach(()=>vi.unstubAllGlobals());
it('registers the correct student and existing device only after consent',async()=>{
  const {registration}=browser(); const rpc=vi.fn().mockResolvedValue({error:null});
  await enablePush({rpc} as any,'student-2',key);
  expect(rpc).toHaveBeenCalledWith('register_push_subscription',expect.objectContaining({p_student_id:'student-2'}));
  expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
});
it('does not register on denial or missing config',async()=>{
  const {serviceWorker}=browser('denied'); const rpc=vi.fn();
  await expect(enablePush({rpc} as any,'student',key)).rejects.toThrow('bloqueados');
  await expect(enablePush({rpc} as any,'student')).rejects.toThrow('configuración');
  expect(rpc).not.toHaveBeenCalled(); expect(serviceWorker.register).not.toHaveBeenCalled();
});
it('does not report success on server refusal',async()=>{
  browser(); const rpc=vi.fn().mockResolvedValue({error:{message:'not_your_student'}});
  await expect(enablePush({rpc} as any,'other',key)).rejects.toThrow('guardar');
});
it('unsubscribes only the selected student without canceling the device',async()=>{
  browser(); const rpc=vi.fn().mockResolvedValue({error:null});
  await disablePush({rpc} as any,'student-2');
  expect(rpc).toHaveBeenCalledWith('unregister_push_subscription',{p_student_id:'student-2',p_endpoint:'https://fcm.googleapis.com/fcm/send/x'});
});
it('explains iPhone installation before requesting permissions',()=>{
  browser(); vi.stubGlobal('navigator',{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5});
  vi.stubGlobal('window',{matchMedia:()=>({matches:false})});
  expect(pushSupportMessage()).toContain('pantalla de inicio');
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});
