import { describe, it, expect, vi, afterEach } from 'vitest';
import * as protocol from '../src/protocol/index.js';
import { MessageApi } from '../src/protocol/api/messages.js';
import { ApiClient } from '../src/protocol/api/api-client.js';
import { TokenManager } from '../src/protocol/api/token.js';
import { WebhookTransport } from '../src/protocol/transport/webhook.js';
import { ed25519Sign } from '../src/protocol/transport/webhook-verify.js';
import type { WebhookRequestHandler } from '../src/protocol/transport/types.js';
afterEach(() => vi.unstubAllGlobals());
const creds = { appId: 'synthetic-app', clientSecret: 'synthetic-secret' };
describe('fork protocol contracts', () => {
  it('forwards signed unknown Webhook dispatch without waiting for the consumer', async () => {
    let handler!: WebhookRequestHandler;
    const raw = vi.fn(() => new Promise<void>(() => {}));
    const transport = new WebhookTransport({appId:'fixture', appSecret:'fixture-secret', server:{async listen(_p,_path,h){handler=h;},close(){}}}, {onMessage(){},onRawEvent:raw});
    const running = transport.start();
    const body=Buffer.from(JSON.stringify({op:0,t:'FUTURE_EVENT',id:'fixture-event',s:42,d:{checked:1,nested:{ok:true}}}));
    const timestamp='123456';
    const signature=ed25519Sign('fixture-secret',Buffer.concat([Buffer.from(timestamp),body]));
    const response=await handler({body,headers:{'x-signature-timestamp':timestamp,'x-signature-ed25519':signature}});
    expect(response.status).toBe(200);
    expect(raw).toHaveBeenCalledWith('FUTURE_EVENT',{checked:1,nested:{ok:true}});
    transport.stop(); await running;
  });
  it('classifies ACK only by current outer 11/12, preserves mixed JSON and legacy types', () => {
    expect(protocol.requiresInteractionAck(11)).toBe(true);
    expect(protocol.requiresInteractionAck(12)).toBe(true);
    for(const type of [1,2,13,14,15,16,18,19,20,999]) expect(protocol.requiresInteractionAck(type)).toBe(false);
    const event=protocol.dispatchEvent('INTERACTION_CREATE',{id:'fixture',type:18,data:{type:2,resolved:{checked:1,authorize_data:{ok:true},future:[1,'x']}}},'fixture');
    expect(event.action).toBe('interaction');
    if(event.action==='interaction') expect(event.event.data.resolved.authorize_data).toEqual({ok:true});
    expect(protocol.InteractionEventType.FEEDBACK).toBe(13);
  });
  it('encodes text chains and rejects scope/length misuse', () => {
    expect(protocol.commandInput('a"<& %中',{show:'继续',reference:true})).toBe('<qqbot-cmd-input text="a%22%3C%26%20%25%E4%B8%AD" show="%E7%BB%A7%E7%BB%AD" reference="true" />');
    expect(protocol.commandEnter('/status','c2c')).toBe('<qqbot-cmd-enter text="%2Fstatus" />');
    expect(()=>protocol.commandEnter('/status','group')).toThrow();
    expect(()=>protocol.commandInput('x'.repeat(101))).toThrow();
  });
  it('constructs explicit proactive raw/rich bodies without mutating caller or resending failures', async () => {
    const bodies:unknown[]=[];
    vi.stubGlobal('fetch',async (_url:unknown,init:RequestInit)=>{bodies.push(JSON.parse(init.body as string));return new Response('{"id":"sent"}',{status:200});});
    const tokens=new TokenManager(); vi.spyOn(tokens,'getAccessToken').mockResolvedValue('synthetic-token');
    const api=new MessageApi(new ApiClient(),tokens,{markdownSupport:true});
    const raw={content:'hi',msg_id:'stale',event_id:'stale',msg_seq:9};
    await api.sendProactiveRaw('c2c','fixture',creds,raw);
    await api.sendProactiveRich('group','fixture',creds,{markdown:{content:protocol.commandInput('/new')},action_button:{stop_generate:true},stream:{state:1,index:0,id:'stream',reset:true},subscribe_id:'subscription',prompt_keyboard:{keyboard:{id:'template'}}});
    expect(bodies[0]).toEqual({content:'hi',msg_type:0});
    for(const body of bodies) for(const key of ['msg_id','event_id','msg_seq']) expect(body).not.toHaveProperty(key);
    expect(raw.msg_id).toBe('stale');
    expect(bodies[1]).toMatchObject({msg_type:2,stream:{reset:true},action_button:{stop_generate:true}});
    const failed=vi.fn(async()=>{throw new Error('delivery unknown');});vi.stubGlobal('fetch',failed);
    await expect(api.sendProactiveRaw('c2c','fixture',creds,{content:'once'})).rejects.toThrow();
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('observes full JSON envelopes with recursive credentials redacted and isolates observer failures', async () => {
    const events:unknown[]=[];
    const observe=(event:unknown)=>{events.push(event); throw new Error('observer failure');};
    vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({id:'reply',extra:{accessToken:'synthetic-token',content:'kept'}}),{status:200,headers:{'x-tps-trace-id':'fixture-trace'}}));
    const api=new ApiClient({wireObserver:observe});
    const result=await api.request('synthetic-token','POST','/test?signature=secret',{unknown:{clientSecret:'synthetic-secret'},content:'kept'});
    expect(result).toHaveProperty('id','reply');
    const serialized=JSON.stringify(events);
    expect(events).toHaveLength(2);
    expect(serialized).toContain('kept');
    expect(serialized).not.toContain('synthetic-token');
    expect(serialized).not.toContain('synthetic-secret');
    expect(serialized).not.toContain('signature=secret');
    expect(serialized).toContain('fixture-trace');
  });
});

it('redacts session handles, signature headers and nested signed upload URLs', () => {
  const safe=protocol.sanitizeWire({session_id:'private-session','x-signature-ed25519':'private-signature',nested:{url:'https://example.invalid/upload?q=1&X-Amz-Signature=private-signature&x-cos-security-token=private-token'},access_token:'private-token'});
  expect(JSON.stringify(safe)).not.toContain('private-');
});

it('exposes explicit proactive high-level helpers and ignores stale ReplyTarget anchors', async () => {
  const {QQBot}=await import('../src/QQBot.js');
  const bodies:unknown[]=[];
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{
    if(url.includes('getAppAccessToken')) return new Response('{"access_token":"fixture-token","expires_in":7200}');
    bodies.push(JSON.parse(init.body as string));return new Response('{"id":"fixture-sent"}');
  });
  const bot=new QQBot({appId:'fixture',appSecret:'fixture'});
  const target={scope:'c2c' as const,targetId:'fixture-user',msgId:'stale-id'};
  await bot.sendProactiveText(target,'hi');
  await bot.sendProactiveRich(target,{markdown:{content:'rich'},action_button:{tts:true}});
  await bot.sendProactiveTextChain(target,'/status',{mode:'enter'});
  expect(bodies).toHaveLength(3);
  for(const body of bodies) for(const key of ['msg_id','event_id','msg_seq']) expect(body).not.toHaveProperty(key);
});

it('captures Webhook error responses and marks malformed input incomplete without retaining bytes', async () => {
  let handler!:WebhookRequestHandler;
  const events:protocol.WireEvent[]=[];
  const transport=new WebhookTransport({appId:'fixture',appSecret:'fixture-secret',wireObserver:event=>{events.push(event);},server:{async listen(_p,_path,h){handler=h;},close(){}}},{onMessage(){}});
  const running=transport.start();
  const response=await handler({body:Buffer.from('{"token":"must-not-escape"'),headers:{}});
  expect(response.status).toBe(400);
  expect(events).toHaveLength(2);
  expect(events[0].capture).toBe('incomplete');
  expect(JSON.stringify(events)).not.toContain('must-not-escape');
  expect(events[1]).toMatchObject({transport:'webhook',direction:'out',status:400});
  transport.stop();await running;
});

it('observes local WebSocket HELLO/IDENTIFY/READY, heartbeat and unknown full envelopes', async () => {
  const {startFakeGateway}=await import('./helpers/fake-gateway.js');
  const {GatewayConnection}=await import('../src/protocol/gateway/gateway-connection.js');
  const gateway=await startFakeGateway();
  const controller=new AbortController();
  const events:protocol.WireEvent[]=[];
  const ready=vi.fn();const raw=vi.fn();
  const connection=new GatewayConnection({account:{accountId:'fixture',appId:'fixture',clientSecret:'fixture-secret'},abortSignal:controller.signal,getAccessToken:async()=>'fixture-token',getGatewayUrl:async()=>gateway.url,onMessage(){},onReady:ready,onRawEvent:raw,wireObserver:event=>{events.push(event);}});
  const running=connection.start();
  try {
    await vi.waitFor(()=>expect(ready).toHaveBeenCalled());
    gateway.sockets[0].send(JSON.stringify({op:0,t:'FUTURE_EVENT',s:4,id:'full-envelope',unknown:{retained:true},d:{content:'kept'}}));
    gateway.sockets[0].send(JSON.stringify({op:10,d:{heartbeat_interval:10}}));
    await vi.waitFor(()=>expect(raw).toHaveBeenCalledWith('FUTURE_EVENT',{content:'kept'}));
    await vi.waitFor(()=>expect(events.some(e=>e.direction==='out'&&(e.payload as {op:number})?.op===1)).toBe(true));
    expect(events.some(e=>(e.payload as {id:string})?.id==='full-envelope')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('fixture-token');
    expect(JSON.stringify(events)).not.toContain('test-session');
  } finally {controller.abort();await running;await gateway.close();}
});

it('observes token fetch safely while preserving token return value', async () => {
  const events:protocol.WireEvent[]=[];
  vi.stubGlobal('fetch',async()=>new Response('{"access_token":"private-token","expires_in":7200}'));
  const manager=new TokenManager({wireObserver:event=>{events.push(event);}});
  expect(await manager.getAccessToken('fixture','private-secret')).toBe('private-token');
  expect(events).toHaveLength(2);
  expect(JSON.stringify(events)).not.toContain('private-token');
  expect(JSON.stringify(events)).not.toContain('private-secret');
});
