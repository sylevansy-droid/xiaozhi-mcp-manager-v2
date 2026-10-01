const HTML = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Xiaozhi MCP Manager</title>
<style>
body{font-family:system-ui,sans-serif;background:#f4f6f8;margin:0;color:#17202a}.w{max-width:820px;margin:auto;padding:18px}
.b,.c{background:#fff;padding:16px;border-radius:14px;margin:14px 0;box-shadow:0 2px 10px #0001}
input{box-sizing:border-box;width:100%;padding:12px;margin:6px 0;border:1px solid #ccd4da;border-radius:10px;font-size:16px}
button{padding:10px 14px;margin:5px 5px 5px 0;border:0;border-radius:10px;font-weight:650}.p{background:#111;color:#fff}
small,.log{color:#65727e}.log{font-size:12px;max-height:110px;overflow:auto}.on{color:#087a32}.err{color:#b42318}
</style></head><body><div class=w><h1>Xiaozhi MCP Manager</h1><p>Tự quản lý kết nối MCP của bạn</p>
<div class=b><b>Thêm / mở thiết bị</b><input id=n placeholder="Tên thiết bị, ví dụ Robot-1">
<input id=e type=password placeholder="wss://api.xiaozhi.me/mcp/?token=...">
<small>Token chỉ gửi tới Worker của chính bạn. Giao diện không hiển thị token đầy đủ.</small><br>
<button class=p onclick="save()">Lưu thiết bị</button><button onclick="tm()">Thử get_time</button> <span id=t></span></div>
<div class=b><b>Thiết bị hiện tại</b><div id=s>Chưa chọn</div></div></div>
<script>
let current="";
const A=async(u,o)=>{let r=await fetch(u,o),j=await r.json();if(!r.ok)throw Error(j.error||"Có lỗi");return j};
const X=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function save(){try{let name=n.value.trim(),endpoint=e.value.trim();if(!name||!endpoint)return alert("Nhập tên và MCP Endpoint");
current=name;await A("/api/device/"+encodeURIComponent(name),{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint})});e.value="";await stat()}catch(z){alert(z.message)}}
async function stat(){if(!current)return;let x=await A("/api/device/"+encodeURIComponent(current));
s.innerHTML=`<h3>${X(current)}</h3><b class="${x.status==="Online"?"on":x.status==="Lỗi"?"err":""}">${X(x.status)}</b>
<p><small>${X(x.endpointMasked||"")}</small></p><p>Lần kết nối: ${X(x.lastConnected||"—")}</p>
<button class=p onclick="co()">Kết nối</button><button onclick="di()">Ngắt</button>
<p><b>Tools:</b> ${x.tools?.length?x.tools.map(y=>X(y.name)).join(", "):"chưa có"}</p>
<div class=log>${(x.log||[]).slice(0,8).map(X).join("<br>")}</div>`}
async function co(){await A("/api/device/"+encodeURIComponent(current)+"/connect",{method:"POST"});setTimeout(stat,1000)}
async function di(){await A("/api/device/"+encodeURIComponent(current)+"/disconnect",{method:"POST"});stat()}
async function tm(){t.textContent=" "+(await A("/api/time")).value}
setInterval(()=>{if(current)stat()},4000);
</script></body></html>`;

export class McpDevice {
  constructor(ctx, env) {
    this.ctx=ctx; this.env=env; this.outbound=null;
    this.state={endpoint:"",status:"Offline",lastConnected:null,tools:[],log:[]};
    ctx.blockConcurrencyWhile(async()=>{
      const saved=await ctx.storage.get("state");
      if(saved) this.state=saved;
    });
  }
  mask(u){return u ? u.replace(/([?&]token=)[^&]+/i,"$1••••••••") : "";}
  async persist(){await this.ctx.storage.put("state",this.state);}
  async fetch(req){
    const url=new URL(req.url), p=url.pathname;
    if(req.method==="PUT" && p.endsWith("/config")){
      const body=await req.json();
      if(!/^wss?:\/\//i.test(body.endpoint||"")) return Response.json({error:"MCP Endpoint không hợp lệ"},{status:400});
      this.state.endpoint=body.endpoint; this.state.status="Offline"; await this.persist();
      return Response.json({ok:true});
    }
    if(req.method==="POST" && p.endsWith("/connect")){
      if(!this.state.endpoint) return Response.json({error:"Chưa có Endpoint"},{status:400});
      try{
        if(this.outbound) try{this.outbound.close()}catch{}
        this.state.status="Đang kết nối"; await this.persist();
        const r=await fetch(this.state.endpoint,{headers:{Upgrade:"websocket"}});
        const ws=r.webSocket;
        if(!ws) throw new Error("Endpoint không trả về WebSocket");
        ws.accept(); this.outbound=ws;
        ws.addEventListener("message",e=>this.onMessage(e.data));
        ws.addEventListener("close",async()=>{this.outbound=null;this.state.status="Offline";await this.persist()});
        ws.addEventListener("error",async()=>{this.state.status="Lỗi";this.state.log.unshift(new Date().toISOString()+": lỗi WebSocket");await this.persist()});
        this.state.status="Online"; this.state.lastConnected=new Date().toISOString();
        this.state.log.unshift(this.state.lastConnected+": WebSocket đã kết nối");
        ws.send(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{
          protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"xiaozhi-cloudflare-manager",version:"0.2.0"}
        }}));
        await this.persist(); return Response.json({ok:true});
      }catch(e){this.state.status="Lỗi";this.state.log.unshift(new Date().toISOString()+": "+e.message);await this.persist();return Response.json({error:e.message},{status:500})}
    }
    if(req.method==="POST" && p.endsWith("/disconnect")){
      if(this.outbound) try{this.outbound.close(1000,"user disconnect")}catch{}
      this.outbound=null;this.state.status="Offline";await this.persist();return Response.json({ok:true});
    }
    return Response.json({...this.state,endpoint:"",endpointMasked:this.mask(this.state.endpoint)});
  }
  async onMessage(data){
    let m; try{m=JSON.parse(typeof data==="string"?data:new TextDecoder().decode(data))}catch{return}
    if(m.id===1 && m.result && this.outbound){
      this.outbound.send(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"}));
      this.outbound.send(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list",params:{}}));
    }
    if(m.id===2 && m.result?.tools) this.state.tools=m.result.tools.map(t=>({name:t.name,description:t.description||""}));
    this.state.log.unshift(new Date().toISOString()+": nhận phản hồi MCP");
    await this.persist();
  }
}

export default {
 async fetch(req,env){
   const u=new URL(req.url);
   if(u.pathname==="/") return new Response(HTML,{headers:{"content-type":"text/html; charset=utf-8"}});
   if(u.pathname==="/api/time") return Response.json({value:new Date().toLocaleString("vi-VN",{timeZone:"Asia/Tokyo"})});
   const m=u.pathname.match(/^\/api\/device\/([^/]+)(\/connect|\/disconnect)?$/);
   if(m){
     const name=decodeURIComponent(m[1]), suffix=m[2]||"";
     const id=env.MCP_DEVICE.idFromName(name), stub=env.MCP_DEVICE.get(id);
     const target=new URL(req.url); target.pathname="/internal"+(suffix||"/status");
     let init={method:req.method,headers:req.headers};
     if(req.method==="PUT"){
       const body=await req.text(); init.body=body; target.pathname="/internal/config";
     }
     return stub.fetch(new Request(target,init));
   }
   return new Response("Not found",{status:404});
 }
};
