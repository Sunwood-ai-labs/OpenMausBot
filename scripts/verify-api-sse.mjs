import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { handleToolCall } from './mcp-server.ts';
const out = new URL('../docs/verification/evidence/api-mcp-20260913/live/', import.meta.url);
const {url, room} = JSON.parse(readFileSync(new URL('targets.json', out)));
const instances = await (await fetch(url+'/api/instances')).json();
assert.ok(instances.instances.some(i=>i.displayName==='Live Codex verification'));
const events=[];
const controller=new AbortController();
const response=await fetch(url+'/api/events?screens=off',{signal:controller.signal});
assert.equal(response.status,200);
assert.match(response.headers.get('content-type'),/text\/event-stream/);
const reading=(async()=>{
  let buffer='';
  const decoder=new TextDecoder();
  try { for await(const chunk of response.body){
    buffer+=decoder.decode(chunk,{stream:true});
    let boundary;
    while((boundary=buffer.indexOf('\n\n'))>=0){
      const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
      for(const line of frame.split('\n'))if(line.startsWith('data: '))events.push(JSON.parse(line.slice(6)));
    }
  }} catch(error){if(!controller.signal.aborted)throw error;}
})();
try {
  const body={threadId:room.threadId,text:'[API-SSE-03] 方針を変更します。最初に確認する項目を「認証」に絞って、一文で答えてください。'};
  const sent=await fetch(url+`/api/groups/${room.id}/messages`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.ok(sent.ok);
  const fetcher=async(path,init)=>{const r=await fetch(url+path,init);if(!r.ok)throw new Error(await r.text());return r.json();};
  const result=await handleToolCall('wait_for_conversation',{target_type:'channel',target_id:room.id,timeout_seconds:30},fetcher);
  assert.equal(result.status,'settled');
  controller.abort(); await reading;
  const messages=events.filter(e=>e.threadId===room.threadId&&e.kind==='message');
  assert.ok(messages.some(e=>e.message.role==='user'&&e.message.text?.includes('[API-SSE-03]')));
  assert.ok(messages.some(e=>e.message.role==='bot'&&e.message.kind==='text'));
  writeFileSync(new URL('sse.json',out),JSON.stringify({passed:true,body,status:sent.status,result,events},null,2));
  console.log(JSON.stringify({passed:true,eventCount:events.length,messageCount:messages.length}));
} finally {controller.abort();await reading;}
