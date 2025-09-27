const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const targetLang = document.getElementById("targetLang");
const voiceSel = document.getElementById("voice");
const out = document.getElementById("out");
const remoteAudio = document.getElementById("remoteAudio");

let pc, dc, localStream, abortController;

function log(line) {
  out.textContent += line + "\n";
  out.scrollTop = out.scrollHeight;
}

async function start() {
  btnStart.disabled = true;
  btnStop.disabled = false;
  out.textContent = "";

  abortController = new AbortController();
  // Richiede sessione effimera al server
  const url = new URL("/session", window.location.origin);
  url.searchParams.set("targetLang", targetLang.value);
  if (voiceSel.value) url.searchParams.set("voice", voiceSel.value);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Cannot create session: " + t);
  }
  const session = await r.json();
  const clientSecret = session?.client_secret?.value;
  const realtimeUrl = session?.realtimeUrl;
  if (!clientSecret || !realtimeUrl) throw new Error("Missing session data");

  // PeerConnection
  pc = new RTCPeerConnection();
  pc.onconnectionstatechange = () => log(`PC: ${pc.connectionState}`);
  pc.oniceconnectionstatechange = () => log(`ICE: ${pc.iceConnectionState}`);
  pc.ontrack = (e) => { remoteAudio.srcObject = e.streams[0]; };

  // Data channel per testo
  dc = pc.createDataChannel("oai-events");
  dc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "response.output_text.delta" && msg.delta) {
        log(msg.delta);
      } else if (msg.type === "response.completed") {
        log("\n---");
      }
    } catch {
      log(ev.data);
    }
  };

  // Mic
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const offer = await pc.createOffer({ offerToReceiveAudio: true, voiceActivityDetection: true });
  await pc.setLocalDescription(offer);

  // Scambio SDP contro Azure OpenAI Realtime
  const resp = await fetch(realtimeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    body: offer.sdp,
    signal: abortController.signal,
  });
  if (!resp.ok) { throw new Error(await resp.text()); }
  const answer = { type: "answer", sdp: await resp.text() };
  await pc.setRemoteDescription(answer);

  log("Sessione avviata. Parla nel microfono…");
}

async function stop() {
  btnStart.disabled = false;
  btnStop.disabled = true;

  if (abortController) abortController.abort();
  if (dc) dc.close();
  if (pc) pc.close();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());

  log("Sessione terminata.");
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
