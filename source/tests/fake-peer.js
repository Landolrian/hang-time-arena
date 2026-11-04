(() => {
  let count = 0;
  class Conn {
    constructor(peer, remote) { this.peer=peer; this.peerId=remote; this.peerName=remote; this.peer=remote; this.owner=peer; this.handlers={}; this.open=false; }
    on(n,f){this.handlers[n]=f;}
    send(data){this.owner.channel.postMessage({type:'data',from:this.owner.id,to:this.peer,data});}
    close(){this.open=false;this.handlers.close?.();}
    opened(){this.open=true;this.handlers.open?.();}
  }
  window.Peer = class {
    constructor(id) {
      this.id=id||('fake-guest-'+Math.random().toString(36).slice(2)); this.handlers={}; this.connections=new Map(); this.taken=false;
      this.channel=new BroadcastChannel('hang-test-room');
      this.channel.onmessage=({data:m})=>{
        if(m.type==='probe' && m.id===this.id) this.channel.postMessage({type:'taken',id:m.id});
        if(m.type==='taken' && m.id===this.id) this.taken=true;
        if(m.type==='connect' && m.to===this.id) {const c=new Conn(this,m.from);this.connections.set(m.from,c);this.handlers.connection?.(c);setTimeout(()=>{c.opened();this.channel.postMessage({type:'accept',to:m.from,from:this.id})},80);}
        if(m.type==='accept' && m.to===this.id) this.connections.get(m.from)?.opened();
        if(m.type==='data' && m.to===this.id) this.connections.get(m.from)?.handlers.data?.(m.data);
      };
      this.channel.postMessage({type:'probe',id:this.id});
      setTimeout(()=>{if(this.taken){this.handlers.error?.({type:'unavailable-id'});}else this.handlers.open?.(this.id)},180);
    }
    on(n,f){this.handlers[n]=f;}
    connect(id){const c=new Conn(this,id);this.connections.set(id,c);setTimeout(()=>this.channel.postMessage({type:'connect',from:this.id,to:id}),60);return c;}
    destroy(){this.channel.close();}
  };
})();
