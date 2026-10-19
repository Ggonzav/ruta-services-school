import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
it('displays push without a page and opens the student URL without invitation credentials',async()=>{
  const listeners:Record<string,Function>={};
  const self={location:{origin:'https://rutasegura.pages.dev'},addEventListener:(name:string,fn:Function)=>listeners[name]=fn,
    registration:{showNotification:vi.fn().mockResolvedValue(undefined)},
    clients:{matchAll:vi.fn().mockResolvedValue([]),openWindow:vi.fn().mockResolvedValue(undefined)}};
  runInNewContext(readFileSync('apps/web-apoderado/public/sw.js','utf8'),{self,URL});
  let work:Promise<unknown>;
  listeners.push({data:{json:()=>({body:'Cerca',tag:'event',url:'/?student=abc'})},waitUntil:(p:Promise<unknown>)=>work=p});
  await work!;
  expect(self.registration.showNotification).toHaveBeenCalledWith('RutaSegura',expect.objectContaining({body:'Cerca',data:{url:'https://rutasegura.pages.dev/?student=abc'}}));
  listeners.notificationclick({notification:{close:vi.fn(),data:{url:'https://evil.test/'}},waitUntil:(p:Promise<unknown>)=>work=p});
  await work!; expect(self.clients.openWindow).not.toHaveBeenCalled();
  listeners.notificationclick({notification:{close:vi.fn(),data:{url:'/?student=abc'}},waitUntil:(p:Promise<unknown>)=>work=p});
  await work!; expect(self.clients.openWindow).toHaveBeenCalledWith('https://rutasegura.pages.dev/?student=abc');
});
