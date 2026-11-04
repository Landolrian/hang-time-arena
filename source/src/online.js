import * as THREE from 'three';
import { createContestant } from './contestant.js';

// The first browser owns the room. Other browsers connect to it over WebRTC.
export function createOnline(scene, onHit, onKO, options = {}) {
  const teamMode = !!options.team;
  const capacity = teamMode ? 8 : 4;
  let eventHandler = () => {};
  const params = new URLSearchParams(location.search);
  const room = /^[A-Z2-9]{6}$/.test((params.get('room') || '').toUpperCase()) ? params.get('room').toUpperCase() : Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  params.set('room', room); history.replaceState(null, '', `${location.pathname}?${params}`);
  const hostId = `hangtime-fight-${room}`;
  const remotes = new Map(), connections = new Map();
  let peer, host = false, me = '', nextSlot = 1, assigned = false, status = 'Connecting…', started = false, fillBots = options.bots !== false;
  const panel = document.createElement('div'); panel.className = 'online-panel' + (teamMode ? ' team-panel' : '');
  panel.innerHTML = `<b>HANG TIME! <span>${teamMode ? "BREAKFAST BOWL · 4v4" : "FREE FOR ALL"}</span></b><div class="online-room">ROOM <strong>${room}</strong> <button class="copy">Copy invite</button> <button class="mode">${teamMode ? "Free for all" : "4v4 teams"}</button></div><div class="online-status">Connecting…</div><div class="online-score">Waiting for players</div>${teamMode ? `<div class="team-controls"><label><input type="checkbox" ${fillBots ? "checked" : ""}> Fill empty slots with bots</label> <button class="start-team">Start match</button></div>` : ""}<small>Share the invite link · ${teamMode ? "1–8" : "2–4"} players · mouse & keyboard</small>`;
  document.body.append(panel);
  const statusEl = panel.querySelector('.online-status'), scoreEl = panel.querySelector('.online-score');
  panel.querySelector('.copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); panel.querySelector('.copy').textContent = 'Copied!'; } catch { prompt('Copy this invite link:', location.href); } };
  panel.querySelector('.mode').onclick = () => { const url=new URL(location.href); url.searchParams.delete('room'); url.searchParams.delete('map'); if(teamMode) url.searchParams.delete('mode'); else {url.searchParams.set('mode','team');url.searchParams.set('map','bowl');} location.href=url.href; };
  if(teamMode) {
    panel.querySelector('.team-controls input').onchange = e => { if(!host || started) { e.target.checked=fillBots; return; } fillBots=e.target.checked; eventHandler({t:'config',bots:fillBots}); broadcast({t:'config',bots:fillBots}); };
    panel.querySelector('.start-team').onclick = () => { if(!host || !assigned || started) return; started=true; eventHandler({t:'start',bots:fillBots}); broadcast({t:'start',bots:fillBots}); panel.querySelector('.team-controls').hidden=true; };
  }
  const setStatus = s => { status = s; statusEl.textContent = s; };
  function send(c, m) { if (c?.open) c.send(m); }
  function broadcast(m, except) { for (const c of connections.values()) if (c !== except) send(c, m); }
  function addRemote(id, slot) {
    if (id === me || remotes.has(id)) return remotes.get(id);
    const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({visible:false});
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.48,.9,4,8), material); body.position.y = .15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3,12,8), material); head.position.y = 1.15;
    const d = {id, slot, team:slot % 2 ? "rockets" : "comets", name:`P${slot}`, group, pos:new THREE.Vector3(), vel:new THREE.Vector3(), target:new THREE.Vector3(), hp:100, dead:0, status:'alive', flash:0};
    group.userData.dummy = body.userData.dummy = head.userData.dummy = d; group.add(body, head);
    const labelCanvas = document.createElement('canvas'); labelCanvas.width=256; labelCanvas.height=80;
    const labelContext=labelCanvas.getContext('2d'); labelContext.fillStyle='#201a38'; labelContext.fillRect(12,8,232,60); labelContext.font='bold 38px sans-serif'; labelContext.textAlign='center'; labelContext.fillStyle='#ffe34d'; labelContext.fillText(`PLAYER ${slot}`,128,52);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(labelCanvas),depthTest:false})); label.position.set(0,2.4,0); label.scale.set(2.6,.8,1); label.renderOrder=1000; label.raycast = () => {}; group.add(label);
    scene.add(group); remotes.set(id,d);
    createContestant(teamMode ? (slot % 2 ? 'red' : 'blue') : (slot % 2 ? 'blue' : 'red'), slot).then(v => { if (!remotes.has(id)) return; d.visual=v; group.add(v.model); v.model.traverse(o => { if(o.isMesh) o.raycast = () => {}; }); });
    return d;
  }
  function remove(id) { const d=remotes.get(id); if(d){scene.remove(d.group); remotes.delete(id);} }
  function receive(m, from) {
    if(!m || typeof m !== 'object') return;
    if(host && from && m.t !== 'hello') broadcast(m, from);
    if(m.t === 'welcome') { me=m.id; nextSlot=m.slot; assigned=true; setStatus(`You are P${m.slot} · connected`); for(const p of m.players) addRemote(p.id,p.slot); if(teamMode && m.started){started=true;fillBots=m.bots;panel.querySelector('.team-controls').hidden=true;eventHandler({t:'start',bots:fillBots});} }
    if(m.t === 'join') { addRemote(m.id,m.slot); setStatus(`${remotes.size+1} / ${capacity} fighters connected`); }
    if(m.t === 'leave') { remove(m.id); setStatus(`${remotes.size+1} / ${capacity} fighters connected`); }
    if(m.t === 'state' && m.id !== me) { const d=addRemote(m.id,m.slot); if(!d || !Array.isArray(m.pos) || !m.pos.every(Number.isFinite)) return; d.target.fromArray(m.pos); d.vel.fromArray(m.vel || [0,0,0]); d.yaw=m.yaw || 0; d.pitch=m.pitch || 0; d.hook=m.hook || 'ready'; d.hookPoint=m.hookPoint || m.pos; d.grounded=!!m.grounded; d.slide=!!m.slide; d.hp=m.hp; d.kills=m.kills; d.status=m.status || (m.dead?'eliminated':'alive'); d.knockedHp=m.knockedHp; d.dead=m.dead ? 1 : 0; d.group.visible=!d.dead; }
    if(teamMode && m.t === 'start'){started=true;fillBots=m.bots;panel.querySelector('.team-controls').hidden=true;}
    if(teamMode && m.t === 'config'){fillBots=m.bots;panel.querySelector('.team-controls input').checked=fillBots;}
    if(teamMode && ['start','config','snapshot','bot-hit','claim','revive','wipe'].includes(m.t)) eventHandler(m,from);
    if(m.t === 'ko' && m.to === me) onKO();
    if(m.t === 'hit' && m.to === me && Number.isFinite(m.amount)) onHit(Math.max(0,Math.min(100,m.amount)),m.from,m.source,m.yaw);
  }
  function attach(c) {
    c.on('open', () => {
      if(host) {
        if(connections.size >= capacity - 1) { send(c,{t:'full'}); setTimeout(()=>c.close(),200); return; }
        const used = new Set([1,...Array.from(connections.values(),x=>x.slot)]); c.slot=Array.from({length:capacity-1},(_,i)=>i+2).find(n=>!used.has(n)); c.remoteId=c.peer; connections.set(c.peer,c);
        send(c,{t:'welcome',id:c.peer,slot:c.slot,started,bots:fillBots,players:[{id:me,slot:1},...Array.from(connections.values()).filter(x=>x!==c).map(x=>({id:x.remoteId,slot:x.slot}))]});
        broadcast({t:'join',id:c.peer,slot:c.slot},c); addRemote(c.peer,c.slot); setStatus(`${remotes.size+1} / ${capacity} fighters connected`);
      } else { connections.set('host',c); setStatus('Connected · waiting for room'); if(teamMode){panel.querySelector('.start-team').disabled=true;panel.querySelector('.team-controls input').disabled=true;} }
    });
    c.on('data', m => { if(m?.t==='full'){setStatus(`This room is full (${capacity} players).`);c.close();return;} receive(m,c); });
    c.on('close',()=>{if(host){connections.delete(c.peer);remove(c.peer);broadcast({t:'leave',id:c.peer});setStatus(`${remotes.size+1} / ${capacity} fighters connected`);}else{connections.delete('host');setStatus('Host disconnected. Refresh to reconnect.');}});
  }
  function start(asHost) {
    host=asHost; peer = new window.Peer(asHost ? hostId : undefined, {debug:0});
    peer.on('open', id => { me=id; if(host){nextSlot=1;assigned=true;setStatus('Room ready · share the invite');} else attach(peer.connect(hostId,{reliable:true,serialization:'json'})); });
    peer.on('connection', c => {if(host)attach(c);else c.close();});
    peer.on('error', e => { if(host && e.type === 'unavailable-id'){peer.destroy();start(false);} else setStatus(`Connection error: ${e.type}. Refresh to retry.`); });
    peer.on('disconnected',()=>setStatus('Connection lost. Refresh to reconnect.'));
  }
  if(window.Peer) start(true); else setStatus('Online play failed to load. Refresh to retry.');
  let lastSend=0, lastYaw=0;
  return {
    get all(){return [...remotes.values()];},
    get id(){return me;},
    get isHost(){return host && assigned;},
    get started(){return started;},
    get botsEnabled(){return fillBots;},
    onEvent(fn){eventHandler=fn;},
    sendEvent(m){if(host)broadcast(m);else send(connections.get('host'),m);},
    get slot(){return assigned ? nextSlot : 0;},
    reportKO(to){const m={t:'ko',to,from:me};if(host)broadcast(m);else send(connections.get('host'),m);},
    damage(d, amount, source, yaw=lastYaw){if(!d?.id || d.dead)return; const m={t:'hit',to:d.id,from:me,amount,source,yaw}; if(host)broadcast(m);else send(connections.get('host'),m);},
    update(dt, player, hook, kills, dead){
      lastYaw=player.yaw;
      for(const d of remotes.values()) {d.pos.lerp(d.target,Math.min(1,dt*15));d.group.position.copy(d.pos); d.visual?.update(dt,{velocity:d.vel,position:d.pos,target:new THREE.Vector3().fromArray(d.hookPoint||d.pos.toArray()),grounded:d.grounded,slide:d.slide,hook:d.hook,mantle:false,landing:false,whip:false,aim:new THREE.Vector3(-Math.sin(d.yaw||0),Math.sin(d.pitch||0),-Math.cos(d.yaw||0))});}
      lastSend+=dt;if(lastSend>.05){lastSend=0; const slot=host?1:nextSlot; const m={t:'state',id:me,slot,pos:player.pos.toArray(),vel:player.vel.toArray(),yaw:player.yaw,pitch:player.pitch,grounded:player.grounded,slide:player.slide,hook:hook.state,hookPoint:hook.point.toArray(),hp:player.hp,kills,dead,status:player.status,knockedHp:player.knockedHp};if(host)broadcast(m);else send(connections.get('host'),m); }
      scoreEl.textContent=teamMode ? `YOU: ${player.team === 'rockets' ? 'ROCKETS' : 'COMETS'}  ·  ${remotes.size+1} / 8 PLAYERS` : `YOU  ${Math.ceil(player.hp)} HP  ·  ${kills} KOs` + [...remotes.values()].sort((a,b)=>a.slot-b.slot).map(d=>`   |   P${d.slot} ${Math.ceil(d.hp||0)} HP · ${d.kills||0} KOs`).join('');
    },
    get status(){return status;}
  };
}
