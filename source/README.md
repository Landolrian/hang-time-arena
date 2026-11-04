# Hang Time! Online

Open the game and copy the invite link to play together in the browser. Free for All supports up to four players. Select **4v4 teams** for Breakfast Bowl: the host can fill empty team slots with bots or turn bot fill off, then start with the people already in the room. Team rooms support up to eight humans, assigned alternately to Rockets and Comets. The host must remain connected throughout the match.

Controls: WASD move, Space jump, right mouse grapple, left mouse fire, E whip, V melee kick, Q yank, F reload, B camera, Escape settings. Mouse side buttons can be bound in Controls. Health is in the bottom right; hits display a marker and damage number above the target.

PeerJS provides connection signaling and the players exchange game data over WebRTC. Some restrictive networks may block peer connections. Mouse and keyboard are required.

Development: `npm install`, then `npm run dev`. Production build: `npm run build`. The two-browser room test uses a deterministic PeerJS transport: with the dev server running, run `node tests/network-room.mjs`.
