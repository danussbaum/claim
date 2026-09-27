// Peer-to-peer connection for 2-player mode.
// Signaling runs over several public MQTT brokers (WebSocket) in parallel;
// after the WebRTC data channel is open, the brokers are no longer needed.
const Net = (() => {
  const BROKERS = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const TOPIC_PREFIX = 'claim-p2p/v1/';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  // --- Minimal MQTT 3.1.1 client (QoS 0 only) ---
  const enc = new TextEncoder(), dec = new TextDecoder();

  function mqttString(s) {
    const b = enc.encode(s);
    return [b.length >> 8, b.length & 255, ...b];
  }

  function mqttPacket(type, body) {
    const len = [];
    let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    return new Uint8Array([type, ...len, ...body]);
  }

  function mqttConnect(url, topic, onMessage, onStatus) {
    let ws;
    try { ws = new WebSocket(url, 'mqtt'); } catch (e) { onStatus(url, 'error'); return null; }
    ws.binaryType = 'arraybuffer';
    let ping = null, buf = new Uint8Array(0);
    const client = {
      ready: false,
      publish(t, text) {
        if (!client.ready) return;
        ws.send(mqttPacket(0x30, [...mqttString(t), ...enc.encode(text)]));
      },
      close() { clearInterval(ping); try { ws.close(); } catch (e) {} },
    };
    ws.onopen = () => {
      const clientId = 'claim-' + Math.random().toString(36).slice(2, 12);
      // Protocol "MQTT", level 4, clean session, keep-alive 60 s
      ws.send(mqttPacket(0x10, [...mqttString('MQTT'), 4, 0x02, 0, 60, ...mqttString(clientId)]));
    };
    ws.onmessage = ev => {
      const merged = new Uint8Array(buf.length + ev.data.byteLength);
      merged.set(buf); merged.set(new Uint8Array(ev.data), buf.length);
      buf = merged;
      // Parse all complete packets in the buffer
      while (buf.length >= 2) {
        let mult = 1, len = 0, pos = 1, byte;
        do {
          if (pos >= buf.length) return;
          byte = buf[pos++]; len += (byte & 127) * mult; mult *= 128;
        } while (byte & 128);
        if (buf.length < pos + len) return;
        const type = buf[0] >> 4, qos = (buf[0] >> 1) & 3;
        const body = buf.slice(pos, pos + len);
        buf = buf.slice(pos + len);
        if (type === 2) { // CONNACK
          if (body[1] !== 0) { onStatus(url, 'error'); return; }
          ws.send(mqttPacket(0x82, [0, 1, ...mqttString(topic), 0]));
          ping = setInterval(() => ws.send(new Uint8Array([0xC0, 0])), 30000);
        } else if (type === 9) { // SUBACK
          client.ready = true;
          onStatus(url, 'ready');
        } else if (type === 3) { // PUBLISH
          const tlen = (body[0] << 8) | body[1];
          const start = 2 + tlen + (qos > 0 ? 2 : 0);
          onMessage(dec.decode(body.slice(start)));
        }
      }
    };
    ws.onerror = () => onStatus(url, 'error');
    ws.onclose = () => { clearInterval(ping); client.ready = false; };
    return client;
  }

  // --- Signaling over all brokers at once ---
  function makeSignal(room, myRole, onMessage, onStatus) {
    const inbox = TOPIC_PREFIX + room + '/' + myRole;
    const outbox = TOPIC_PREFIX + room + '/' + (myRole === 'host' ? 'guest' : 'host');
    const seen = new Set();
    const clients = BROKERS.map(url => mqttConnect(url, inbox, text => {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || !msg.id || seen.has(msg.id)) return; // same message arrives via each broker
      seen.add(msg.id);
      onMessage(msg);
    }, onStatus)).filter(Boolean);
    return {
      send(msg) {
        msg.id = Math.random().toString(36).slice(2, 12);
        const text = JSON.stringify(msg);
        clients.forEach(c => c.publish(outbox, text));
      },
      readyCount() { return clients.filter(c => c.ready).length; },
      close() { clients.forEach(c => c.close()); },
    };
  }

  // Waits until all ICE candidates are in the description (no trickle ICE),
  // so offer and answer each fit into a single message.
  function waitForIce(pc) {
    return new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 4000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') done();
      });
    });
  }

  function randomRoom() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  // --- Public API ---
  const api = {
    role: null,
    room: null,
    connected: false,
    onStatus: () => {},   // (text) human-readable progress
    onOpen: () => {},     // data channel ready
    onMessage: () => {},  // (obj) message from the other player
    onClose: () => {},
    _pc: null, _dc: null, _signal: null,
  };

  function setupChannel(dc) {
    api._dc = dc;
    dc.onopen = () => {
      api.connected = true;
      api.onStatus('Connected');
      api.onOpen();
      // Signaling is no longer needed
      if (api._signal) { api._signal.close(); api._signal = null; }
    };
    dc.onmessage = ev => { try { api.onMessage(JSON.parse(ev.data)); } catch (e) {} };
    dc.onclose = () => { api.connected = false; api.onStatus('Disconnected'); api.onClose(); };
  }

  function brokerStatus(url, state) {
    const n = api._signal ? api._signal.readyCount() : 0;
    if (state === 'ready') api.onStatus('Signaling ready (' + n + '/' + BROKERS.length + ' servers)');
  }

  // Host: opens a room and waits for the guest's offer.
  api.host = function () {
    api.role = 'host';
    api.room = randomRoom();
    api.onStatus('Connecting to signaling servers...');
    api._signal = makeSignal(api.room, 'host', async msg => {
      if (msg.type !== 'offer' || api._pc) return;
      api.onStatus('Player found, connecting...');
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      api._pc = pc;
      pc.ondatachannel = ev => setupChannel(ev.channel);
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIce(pc);
      api._signal.send({ type: 'answer', sdp: pc.localDescription.sdp });
    }, brokerStatus);
    return api.room;
  };

  // Guest: joins a room, sends an offer, waits for the answer.
  api.join = function (room) {
    api.role = 'guest';
    api.room = room;
    api.onStatus('Connecting to signaling servers...');
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    api._pc = pc;
    setupChannel(pc.createDataChannel('game'));
    let answered = false, offerSdp = null, sentTo = 0;
    const sendOffer = () => {
      // Resend whenever another broker becomes ready, in case the first ones are down
      const n = api._signal ? api._signal.readyCount() : 0;
      if (!offerSdp || answered || n <= sentTo) return;
      sentTo = n;
      api._signal.send({ type: 'offer', sdp: offerSdp });
      api.onStatus('Waiting for host...');
    };
    api._signal = makeSignal(room, 'guest', async msg => {
      if (msg.type !== 'answer' || answered) return;
      answered = true;
      api.onStatus('Host answered, connecting...');
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    }, (url, state) => { brokerStatus(url, state); sendOffer(); });
    (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      offerSdp = pc.localDescription.sdp;
      sendOffer();
    })();
  };

  api.send = function (obj) {
    if (api._dc && api._dc.readyState === 'open') api._dc.send(JSON.stringify(obj));
  };

  api.close = function () {
    if (api._signal) api._signal.close();
    if (api._pc) api._pc.close();
    api._signal = api._pc = api._dc = null;
    api.connected = false;
  };

  // Link the guest scans: current page + #join=<room>
  api.joinUrl = function (room) {
    return location.origin + location.pathname + '#join=' + room;
  };

  api.roomFromUrl = function () {
    const m = location.hash.match(/join=([a-z0-9]+)/);
    return m ? m[1] : null;
  };

  return api;
})();
