const EPOCHS = {
  empire_1914: { title: "Эпоха империй", years: "1900–1918", start: 1914, description: "Империи, великие державы и меняющийся мировой порядок." },
  interwar_1936: { title: "Межвоенный период", years: "1919–1938", start: 1936, description: "Политические перемены и промышленное развитие." },
  ww2_1936: { title: "Вторая мировая: подготовка", years: "1936–1945", start: 1936, description: "Исторический старт кампании 1936 года." },
  coldwar_1946: { title: "Холодная война", years: "1946–1991", start: 1946, description: "Блоки, дипломатия, технологии и влияние." },
  modern_2026: { title: "Современный мир", years: "1991–2026", start: 2026, description: "Современные государства и международные отношения." },
  alternate: { title: "Альтернативная история", years: "Своя дата", start: 1936, description: "Сценарии с изменённой историей." }
};
const COUNTRIES = {
  GER: { name:"Германия", flag:"🇩🇪", civ:10, mil:8, dock:2, manpower:250000 },
  SOV: { name:"СССР", flag:"☭", civ:12, mil:7, dock:3, manpower:500000 },
  ENG: { name:"Великобритания", flag:"🇬🇧", civ:9, mil:6, dock:7, manpower:180000 },
  FRA: { name:"Франция", flag:"🇫🇷", civ:9, mil:7, dock:3, manpower:170000 },
  ITA: { name:"Италия", flag:"🇮🇹", civ:8, mil:7, dock:4, manpower:160000 },
  JAP: { name:"Япония", flag:"🇯🇵", civ:8, mil:7, dock:6, manpower:190000 }
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" }
});
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
const hex = b => [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function verify(initData, token) {
  if (!initData || !token) return null;
  const p = new URLSearchParams(initData), hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\\n");
  const secret = await hmac("WebAppData", token);
  const k = await crypto.subtle.importKey("raw", secret, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const actual = hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(check))));
  if (actual.length !== hash.length) return null;
  let mismatch=0; for(let i=0;i<hash.length;i++) mismatch |= actual.charCodeAt(i)^hash.charCodeAt(i);
  if(mismatch) return null;
  const ts=Number(p.get("auth_date")||0);
  if(!ts || Math.abs(Date.now()/1000-ts)>86400) return null;
  try { return JSON.parse(p.get("user")||"null"); } catch { return null; }
}
async function auth(req, env) {
  const user=await verify(req.headers.get("X-Telegram-Init-Data"),env.BOT_TOKEN);
  if(!user?.id) return null;
  await env.DB.prepare("INSERT OR IGNORE INTO players(telegram_id,username,first_name) VALUES(?,?,?)")
    .bind(String(user.id),user.username||null,user.first_name||"Игрок").run();
  return user;
}
function code() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map(b=>chars[b%chars.length]).join("");
}
async function roomDetails(env, roomId) {
  const room=await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(roomId).first();
  if(!room) return null;
  const players=await env.DB.prepare(`SELECT rp.telegram_id,rp.country_id,rp.is_ready,rp.role,p.first_name,p.username
    FROM room_players rp JOIN players p ON p.telegram_id=rp.telegram_id WHERE rp.room_id=?`)
    .bind(roomId).all();
  const proposal=await env.DB.prepare("SELECT * FROM room_setting_proposals WHERE room_id=? AND status='open' ORDER BY created_at DESC LIMIT 1").bind(roomId).first();
  let activeProposal=null;
  if(proposal) {
    const tally=await env.DB.prepare("SELECT SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) AS yes,SUM(CASE WHEN vote=0 THEN 1 ELSE 0 END) AS no FROM room_setting_votes WHERE proposal_id=?").bind(proposal.id).first();
    activeProposal={...proposal,yes:tally.yes||0,no:tally.no||0,epoch_title:proposal.epoch_id?(EPOCHS[proposal.epoch_id]?.title||proposal.epoch_id):null};
  }
  return { ...room, epoch:EPOCHS[room.epoch_id]||EPOCHS.ww2_1936, players:players.results||[], active_proposal:activeProposal };
}
async function api(req,env,path) {
  const user=await auth(req,env);
  if(!user) return json({error:"Открой Mini App через Telegram-бота, чтобы подтвердить вход."},401);
  const uid=String(user.id);
  if(req.method==="GET" && path==="/api/bootstrap")
    return json({player:{id:uid,name:user.first_name||"Игрок"},epochs:EPOCHS,countries:COUNTRIES});
  if(req.method==="GET" && path==="/api/rooms") {
    const rows=await env.DB.prepare(`SELECT r.*,COUNT(rp.telegram_id) AS player_count
      FROM rooms r LEFT JOIN room_players rp ON rp.room_id=r.id
      WHERE r.status='lobby' GROUP BY r.id ORDER BY r.created_at DESC LIMIT 30`).all();
    return json({rooms:rows.results||[]});
  }
  if(req.method==="POST" && path==="/api/rooms") {
    const b=await req.json();
    if(!b.name?.trim()) return json({error:"Укажи название комнаты."},400);
    if(!EPOCHS[b.epoch_id]) return json({error:"Неизвестная эпоха."},400);
    const id=crypto.randomUUID(), invite=code();
    const max=Math.max(2,Math.min(20,Number(b.max_players)||8));
    await env.DB.prepare(`INSERT INTO rooms(id,code,name,host_id,epoch_id,scenario_id,max_players,game_speed)
      VALUES(?,?,?,?,?,?,?,?)`).bind(id,invite,b.name.trim().slice(0,40),uid,b.epoch_id,
      b.scenario_id==="alternate"?"alternate":"historical",max,b.game_speed||"normal").run();
    await env.DB.prepare("INSERT INTO room_players(room_id,telegram_id,role) VALUES(?,?,'host')").bind(id,uid).run();
    const start=EPOCHS[b.epoch_id].start;
    await env.DB.prepare("INSERT INTO room_state(room_id,year,state_json) VALUES(?,?,?)")
      .bind(id,start,JSON.stringify({paused:true})).run();
    await env.DB.prepare("INSERT INTO room_events(room_id,event_type,payload_json) VALUES(?,?,?)")
      .bind(id,"room_created",JSON.stringify({by:uid,epoch:b.epoch_id})).run();
    return json({room:await roomDetails(env,id)});
  }
  if(req.method==="POST" && path==="/api/rooms/join") {
    const b=await req.json(), room=await env.DB.prepare("SELECT * FROM rooms WHERE code=?").bind(String(b.code||"").toUpperCase()).first();
    if(!room) return json({error:"Комната с таким кодом не найдена."},404);
    if(room.status!=="lobby") return json({error:"Эта партия уже началась."},400);
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM room_players WHERE room_id=?").bind(room.id).first();
    if(count.n>=room.max_players) return json({error:"В комнате нет свободных мест."},400);
    await env.DB.prepare("INSERT OR IGNORE INTO room_players(room_id,telegram_id) VALUES(?,?)").bind(room.id,uid).run();
    return json({room:await roomDetails(env,room.id)});
  }
  const roomMatch=path.match(/^\\/api\\/rooms\\/([a-f0-9-]+)$/);
  if(req.method==="GET" && roomMatch) {
    const room=await roomDetails(env,roomMatch[1]);
    if(!room) return json({error:"Комната не найдена."},404);
    const member=room.players.some(p=>p.telegram_id===uid);
    if(!member) return json({error:"Сначала присоединись к комнате."},403);
    return json({room});
  }
  const settingsMatch=path.match(/^\/api\/rooms\/([a-f0-9-]+)\/settings$/);
  if(req.method==="POST" && settingsMatch) {
    const rid=settingsMatch[1], b=await req.json();
    const room=await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(rid).first();
    if(!room) return json({error:"Комната не найдена."},404);
    if(room.host_id!==uid) return json({error:"Настройки напрямую может менять создатель комнаты."},403);
    if(room.status!=="lobby") return json({error:"После старта кампании настройки эпохи и сценария зафиксированы."},400);
    if(b.epoch_id && !EPOCHS[b.epoch_id]) return json({error:"Неизвестная эпоха."},400);
    if(b.scenario_id && !["historical","alternate"].includes(b.scenario_id)) return json({error:"Неизвестный тип сценария."},400);
    await env.DB.prepare("UPDATE rooms SET epoch_id=COALESCE(?,epoch_id),scenario_id=COALESCE(?,scenario_id) WHERE id=?")
      .bind(b.epoch_id||null,b.scenario_id||null,rid).run();
    await env.DB.prepare("INSERT INTO room_events(room_id,event_type,payload_json) VALUES(?,?,?)")
      .bind(rid,"settings_changed_by_host",JSON.stringify({by:uid,epoch_id:b.epoch_id||null,scenario_id:b.scenario_id||null})).run();
    return json({room:await roomDetails(env,rid)});
  }
  const proposalMatch=path.match(/^\/api\/rooms\/([a-f0-9-]+)\/proposals$/);
  if(req.method==="POST" && proposalMatch) {
    const rid=proposalMatch[1], b=await req.json();
    const room=await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(rid).first();
    if(!room) return json({error:"Комната не найдена."},404);
    if(room.status!=="lobby") return json({error:"Голосование доступно только до начала кампании."},400);
    const member=await env.DB.prepare("SELECT 1 AS ok FROM room_players WHERE room_id=? AND telegram_id=?").bind(rid,uid).first();
    if(!member) return json({error:"Только участники комнаты могут предлагать изменения."},403);
    if((b.epoch_id && !EPOCHS[b.epoch_id]) || (b.scenario_id && !["historical","alternate"].includes(b.scenario_id)) || (!b.epoch_id && !b.scenario_id))
      return json({error:"Укажи допустимую эпоху и/или сценарий."},400);
    const open=await env.DB.prepare("SELECT id FROM room_setting_proposals WHERE room_id=? AND status='open'").bind(rid).first();
    if(open) return json({error:"В этой комнате уже идёт голосование."},409);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO room_setting_proposals(id,room_id,proposer_id,epoch_id,scenario_id) VALUES(?,?,?,?,?)")
      .bind(id,rid,uid,b.epoch_id||null,b.scenario_id||null).run();
    await env.DB.prepare("INSERT INTO room_setting_votes(proposal_id,telegram_id,vote) VALUES(?,?,1)").bind(id,uid).run();
    await env.DB.prepare("INSERT INTO room_events(room_id,event_type,payload_json) VALUES(?,?,?)")
      .bind(rid,"settings_vote_started",JSON.stringify({proposal_id:id,by:uid})).run();
    return json({proposal_id:id,status:"open",message:"Предложение создано; твой голос учтён."});
  }
  const voteMatch=path.match(/^\/api\/proposals\/([a-f0-9-]+)\/vote$/);
  if(req.method==="POST" && voteMatch) {
    const id=voteMatch[1], b=await req.json();
    const proposal=await env.DB.prepare("SELECT * FROM room_setting_proposals WHERE id=?").bind(id).first();
    if(!proposal) return json({error:"Голосование не найдено."},404);
    if(proposal.status!=="open") return json({error:"Голосование уже завершено."},400);
    const room=await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(proposal.room_id).first();
    if(!room || room.status!=="lobby") return json({error:"Кампания уже началась; настройки зафиксированы."},400);
    const member=await env.DB.prepare("SELECT 1 AS ok FROM room_players WHERE room_id=? AND telegram_id=?").bind(proposal.room_id,uid).first();
    if(!member) return json({error:"Голосовать могут только участники комнаты."},403);
    if(typeof b.approve!=="boolean") return json({error:"Нужно указать approve: true или false."},400);
    await env.DB.prepare("INSERT INTO room_setting_votes(proposal_id,telegram_id,vote) VALUES(?,?,?) ON CONFLICT(proposal_id,telegram_id) DO UPDATE SET vote=excluded.vote,created_at=CURRENT_TIMESTAMP")
      .bind(id,uid,b.approve?1:0).run();
    const tally=await env.DB.prepare("SELECT SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) AS yes,SUM(CASE WHEN vote=0 THEN 1 ELSE 0 END) AS no FROM room_setting_votes WHERE proposal_id=?").bind(id).first();
    const members=await env.DB.prepare("SELECT COUNT(*) AS n FROM room_players WHERE room_id=?").bind(proposal.room_id).first();
    const threshold=Math.floor(members.n/2)+1;
    let status="open";
    if((tally.yes||0)>=threshold) {
      await env.DB.prepare("UPDATE rooms SET epoch_id=COALESCE(?,epoch_id),scenario_id=COALESCE(?,scenario_id) WHERE id=?")
        .bind(proposal.epoch_id,proposal.scenario_id,proposal.room_id).run();
      await env.DB.prepare("UPDATE room_setting_proposals SET status='passed' WHERE id=?").bind(id).run();
      status="passed";
      await env.DB.prepare("INSERT INTO room_events(room_id,event_type,payload_json) VALUES(?,?,?)")
        .bind(proposal.room_id,"settings_vote_passed",JSON.stringify({proposal_id:id,yes:tally.yes,no:tally.no})).run();
    } else if((tally.no||0)>=threshold) {
      await env.DB.prepare("UPDATE room_setting_proposals SET status='rejected' WHERE id=?").bind(id).run();
      status="rejected";
    }
    return json({status,yes:tally.yes||0,no:tally.no||0,required:threshold,room:await roomDetails(env,proposal.room_id)});
  }
  const readyMatch=path.match(/^\\/api\\/rooms\\/([a-f0-9-]+)\\/ready$/);
  if(req.method==="POST" && readyMatch) {
    const b=await req.json(), rid=readyMatch[1];
    const membership=await env.DB.prepare("SELECT * FROM room_players WHERE room_id=? AND telegram_id=?").bind(rid,uid).first();
    if(!membership) return json({error:"Ты не состоишь в этой комнате."},403);
    await env.DB.prepare("UPDATE room_players SET is_ready=? WHERE room_id=? AND telegram_id=?")
      .bind(b.ready?1:0,rid,uid).run();
    return json({room:await roomDetails(env,rid)});
  }
  if(req.method==="POST" && path==="/api/rooms/start") {
    const b=await req.json(), rid=b.room_id;
    const room=await env.DB.prepare("SELECT * FROM rooms WHERE id=?").bind(rid).first();
    if(!room || room.host_id!==uid) return json({error:"Запустить партию может только создатель."},403);
    const members=await env.DB.prepare("SELECT * FROM room_players WHERE room_id=?").bind(rid).all();
    if(members.results.length<1) return json({error:"В комнате нет игроков."},400);
    await env.DB.prepare("UPDATE rooms SET status='active' WHERE id=?").bind(rid).run();
    await env.DB.prepare("INSERT INTO room_events(room_id,event_type,payload_json) VALUES(?,?,?)")
      .bind(rid,"game_started",JSON.stringify({by:uid})).run();
    return json({room:await roomDetails(env,rid)});
  }
  return json({error:"Маршрут не найден."},404);
}
async function tg(env,method,payload) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
  });
}
async function webhook(req,env) {
  if(req.headers.get("X-Telegram-Bot-Api-Secret-Token")!==env.WEBHOOK_SECRET) return new Response("Forbidden",{status:403});
  const u=await req.json(),m=u.message;
  if(!m?.chat?.id) return new Response("ok");
  const text=m.text||"",chat_id=m.chat.id;
  if(text.startsWith("/start")) {
    await tg(env,"sendMessage",{chat_id,text:"Добро пожаловать в World Domination | WD. Создавай кампании, выбирай эпохи и управляй своей страной.",reply_markup:{inline_keyboard:[[{text:"Открыть WD",web_app:{url:env.APP_URL}}]]}});
  } else {
    await tg(env,"sendMessage",{chat_id,text:"Напиши /start, чтобы открыть World Domination | WD."});
  }
  return new Response("ok");
}
export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    if(url.pathname.startsWith("/api/")) return api(req,env,url.pathname);
    if(url.pathname==="/telegram/webhook" && req.method==="POST") return webhook(req,env);
    return env.ASSETS.fetch(req);
  }
};